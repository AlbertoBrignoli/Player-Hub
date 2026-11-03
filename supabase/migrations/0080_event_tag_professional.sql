-- Impegno dalla Home con il professionista di riferimento taggato.
-- L'atleta (o AUVI) crea un impegno, una call o un allenamento e tagga una persona del suo team:
--  - il professionista entra nella voce (crm_item_people → la vede e ne segue la conversazione)
--  - riceve UNA notifica chiara ("Richiesta da …" per l'atleta, "… con …" per AUVI)
--  - se l'ha chiesto l'atleta, è lui (non AUVI) a confermare o rifiutare: crm_event_answer
-- Senza tag tutto resta com'era: la richiesta dell'atleta va ad AUVI.

-- 1. il trigger delle richieste dell'atleta: se è già indirizzata a un professionista, AUVI non riceve il doppione
create or replace function public.crm_event_request()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_role text; v_atleta text; v_quando text; v_who text;
begin
  if coalesce(current_setting('auvi.training', true), '') = '1' then return new; end if;
  if new.week_plan_id is not null then return new; end if;
  select role into v_role from public.crm_profiles where id = new.created_by;
  select name into v_atleta from public.player where api_player_id = new.player_id;
  v_quando := to_char(new.start_at at time zone 'Europe/Rome', 'DD/MM/YYYY HH24:MI');
  new.proposed_by_role := coalesce(new.proposed_by_role, v_role);
  if v_role = 'player' then
    if new.request_status is null then new.request_status := 'da_confermare'; end if;
    if new.assignee_role is null then new.assignee_role := 'admin'; end if;
    -- indirizzata a un professionista: la notifica la manda crm_event_create (con il suo nome)
    if new.assignee_role = 'admin' then
      insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
      values ('admin', 'Richiesta da ' || coalesce(v_atleta, 'atleta') || ': ' || new.title,
              v_quando || coalesce(' · ' || new.location, ''), 'agenda', new.player_id, new.created_by);
    end if;
  elsif v_role = 'nutrizionista' and new.type = 'nutrizione' then
    new.request_status := null;
    new.visibility := 'team';
    v_who := coalesce(nullif(trim(coalesce(public.crm_pro_display_name(new.created_by, v_role), '')), ''), 'Il nutrizionista');
    insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('player', v_who || ': ' || new.title,
            v_quando || coalesce(' · ' || new.location, ''), 'agenda', new.player_id, new.created_by);
  elsif v_role in ('preparatore','assicuratore','commercialista','fisioterapista','nutrizionista','wealth','agente')
        and new.fitness_program_id is null then
    new.request_status := 'da_confermare';
    new.assignee_role := 'player';
    v_who := coalesce(nullif(trim(coalesce(public.crm_pro_display_name(new.created_by, v_role), '')), ''), initcap(v_role));
    insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('player', 'Proposta da ' || v_who || ': ' || new.title,
            v_quando || coalesce(' · ' || new.location, '') || ' · da confermare', 'agenda?event=' || new.id, new.player_id, new.created_by);
  elsif v_role in ('admin','creator') then
    insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('player', 'Nuovo impegno: ' || new.title,
            v_quando || coalesce(' · ' || new.location, ''), 'agenda?event=' || new.id, new.player_id, new.created_by);
  end if;
  return new;
end $$;

-- 2. il "ti ha coinvolto" generico si può zittire quando la notifica la manda già chi crea l'impegno
create or replace function public.crm_item_people_notify()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare m record; v_who text;
begin
  if coalesce(current_setting('auvi.silent_tag', true), '') = '1' then return new; end if;
  select * into m from public.crm_item_meta(new.kind, new.item_id);
  if m.player_id is null then return new; end if;
  v_who := coalesce(nullif(trim(coalesce(public.crm_pro_display_name(auth.uid(), current_crm_role()), '')), ''),
                    (select full_name from public.crm_profiles where id = auth.uid()), 'AUVI');
  insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
  values (new.role, v_who || ' ti ha coinvolto: ' || coalesce(m.title, ''),
          coalesce('entro il ' || to_char(m.due, 'DD/MM/YYYY'), ''),
          'item?k=' || new.kind || '&id=' || new.item_id, m.player_id, auth.uid());
  return new;
end $$;

-- 3. crea l'impegno (impegno / call / allenamento) e, se c'è, tagga il professionista di riferimento
create or replace function public.crm_event_create(
  p_player bigint, p_type text, p_title text, p_start timestamptz,
  p_location text default null, p_link text default null, p_tag uuid default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_role text := current_crm_role();
  v_is_player boolean := coalesce(current_player_api_id() = p_player, false);
  v_tag_role text; v_tag_name text; v_id uuid; v_atleta text; v_quando text;
begin
  if not (v_is_player or coalesce(v_role in ('admin','creator'), false)) then
    raise exception 'Non puoi creare impegni per questo atleta';
  end if;
  if p_type not in ('personale','call','allenamento') then raise exception 'Tipo non valido'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Manca il titolo'; end if;

  if p_tag is not null then
    -- solo una persona del team di QUESTO atleta
    select t.role, t.name into v_tag_role, v_tag_name from public.crm_athlete_team t
      where t.player_id = p_player and t.pro_id = p_tag limit 1;
    if v_tag_role is null then raise exception 'Questa persona non è nel team dell''atleta'; end if;
  end if;

  -- il professionista taggato la vede grazie al tag (p_events_tagged), non serve aprirla a tutto il team
  insert into public.crm_events (title, type, start_at, location, link_url, player_id, created_by, assignee_role)
  values (trim(p_title), p_type, p_start, nullif(trim(coalesce(p_location, '')), ''), nullif(trim(coalesce(p_link, '')), ''),
          p_player, auth.uid(),
          case when v_is_player and v_tag_role is not null then v_tag_role end)
  returning id into v_id;

  if v_tag_role is not null then
    perform set_config('auvi.silent_tag', '1', true);
    insert into public.crm_item_people (kind, item_id, user_id, role, name, added_by)
    values ('event', v_id, p_tag, v_tag_role, v_tag_name, auth.uid());
    perform set_config('auvi.silent_tag', '', true);

    select name into v_atleta from public.player where api_player_id = p_player;
    v_quando := to_char(p_start at time zone 'Europe/Rome', 'DD/MM/YYYY HH24:MI');
    insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values (v_tag_role,
            case when v_is_player then 'Richiesta da ' || coalesce(v_atleta, 'atleta') || ': ' || trim(p_title)
                 else trim(p_title) || ' con ' || coalesce(v_atleta, 'l''atleta') end,
            v_quando || coalesce(' · ' || nullif(trim(coalesce(p_location, '')), ''), '')
              || case when v_is_player then ' · da confermare' else '' end,
            'agenda?event=' || v_id, p_player, auth.uid());
  end if;
  return v_id;
end $$;
grant execute on function public.crm_event_create(bigint, text, text, timestamptz, text, text, uuid) to authenticated;

-- 4. risposta a una richiesta dell'atleta: AUVI, oppure il professionista a cui è indirizzata
create or replace function public.crm_event_answer(p_event uuid, p_ok boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
declare e record; v_role text := current_crm_role();
begin
  select * into e from public.crm_events where id = p_event;
  if e.id is null then raise exception 'Impegno non trovato'; end if;
  if coalesce(e.request_status, '') <> 'da_confermare' then raise exception 'Questa richiesta ha già una risposta'; end if;
  if not (coalesce(v_role = 'admin', false)
          or (e.assignee_role = v_role and public.crm_item_tagged('event', p_event))) then
    raise exception 'Non puoi rispondere a questa richiesta';
  end if;
  update public.crm_events
     set request_status = case when p_ok then 'confermata' else 'rifiutata' end, resolved_at = now()
   where id = p_event;
end $$;
grant execute on function public.crm_event_answer(uuid, boolean) to authenticated;
