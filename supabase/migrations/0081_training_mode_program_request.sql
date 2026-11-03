-- Allenamento dalla Home: in presenza, online o "programma online" (scheda da fare in autonomia).
-- 1. crm_event_create accetta la modalità della sessione (presenza / online)
-- 2. le richieste al preparatore (programma, allenamento) gli mandano finalmente una notifica

drop function if exists public.crm_event_create(bigint, text, text, timestamptz, text, text, uuid);
create or replace function public.crm_event_create(
  p_player bigint, p_type text, p_title text, p_start timestamptz,
  p_location text default null, p_link text default null, p_tag uuid default null, p_mode text default null)
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
  if p_mode is not null and (p_type <> 'allenamento' or p_mode not in ('presenza','online')) then
    raise exception 'Modalità non valida';
  end if;
  if p_tag is not null then
    select t.role, t.name into v_tag_role, v_tag_name from public.crm_athlete_team t
      where t.player_id = p_player and t.pro_id = p_tag limit 1;
    if v_tag_role is null then raise exception 'Questa persona non è nel team dell''atleta'; end if;
  end if;
  insert into public.crm_events (title, type, start_at, location, link_url, player_id, created_by, assignee_role, session_mode)
  values (trim(p_title), p_type, p_start, nullif(trim(coalesce(p_location, '')), ''), nullif(trim(coalesce(p_link, '')), ''),
          p_player, auth.uid(),
          case when v_is_player and v_tag_role is not null then v_tag_role end,
          p_mode)
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
            v_quando
              || case p_mode when 'online' then ' · online' when 'presenza' then ' · in presenza' else '' end
              || coalesce(' · ' || nullif(trim(coalesce(p_location, '')), ''), '')
              || case when v_is_player then ' · da confermare' else '' end,
            'agenda?event=' || v_id, p_player, auth.uid());
  end if;
  return v_id;
end $$;
grant execute on function public.crm_event_create(bigint, text, text, timestamptz, text, text, uuid, text) to authenticated;

-- notifica al preparatore per le richieste dell'atleta (i messaggi vanno in chat, qui no)
create or replace function public.crm_fitness_request_notify()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_atleta text;
begin
  if new.type not in ('programma', 'allenamento') then return new; end if;
  select name into v_atleta from public.player where api_player_id = new.player_id;
  insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
  values ('preparatore',
          case new.type when 'programma' then 'Richiesta programma da ' else 'Richiesta allenamento da ' end
            || coalesce(v_atleta, 'atleta'),
          coalesce(nullif(trim(coalesce(new.note, '')), ''), case new.type when 'programma' then 'Nuovo programma online' else 'Nuova sessione' end),
          'dashboard', new.player_id, auth.uid());
  return new;
end $$;
drop trigger if exists trg_fitness_request_notify on public.fitness_requests;
create trigger trg_fitness_request_notify after insert on public.fitness_requests
  for each row execute function public.crm_fitness_request_notify();
