-- Sessioni di allenamento proposte dal preparatore (v12.2).
-- Flusso: il preparatore tocca un giorno del calendario → propone la sessione (online o in presenza)
-- → l'atleta riceve la notifica e conferma oppure propone un altro orario → il preparatore riceve
-- la notifica, la apre direttamente su quella sessione e conferma.
-- Tutto passa da due funzioni server (permessi, stati e notifiche in un posto solo); le notifiche
-- aprono la sessione precisa: atleta → fitness?training=<id>, preparatore → fitness?view=calendario&training=<id>.

alter table public.crm_events
  add column if not exists session_mode text,
  add column if not exists counter_start_at timestamptz;
alter table public.crm_events drop constraint if exists crm_events_session_mode_chk;
alter table public.crm_events add constraint crm_events_session_mode_chk
  check (session_mode is null or session_mode in ('online','presenza'));

-- ---------- helper: "12/11 alle 18:00" nel fuso dell'atleta ----------
create or replace function public.crm_training_when(p_at timestamptz, p_player bigint)
returns text language sql stable security definer set search_path = public as $$
  select to_char(p_at at time zone coalesce((select timezone from player where api_player_id = p_player), 'Europe/Rome'),
                 'DD/MM "alle" HH24:MI')
$$;
revoke execute on function public.crm_training_when(timestamptz, bigint) from public, anon;
grant execute on function public.crm_training_when(timestamptz, bigint) to authenticated;

-- ---------- i trigger generici dell'agenda tacciono quando agiscono le funzioni qui sotto ----------
create or replace function public.crm_event_request()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
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
    insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('admin', 'Richiesta da ' || coalesce(v_atleta, 'atleta') || ': ' || new.title,
            v_quando || coalesce(' · ' || new.location, ''), 'agenda', new.player_id, new.created_by);
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
end $function$;

create or replace function public.crm_event_confirmed()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare v_quando text; v_title text;
begin
  if coalesce(current_setting('auvi.training', true), '') = '1' then return new; end if;
  if new.request_status is distinct from old.request_status
     and new.request_status in ('confermata','rifiutata','modifica_richiesta') then
    v_quando := to_char(new.start_at at time zone 'Europe/Rome', 'DD/MM/YYYY HH24:MI');
    v_title := case new.request_status
      when 'confermata' then 'Confermato: '
      when 'rifiutata' then 'Non accettato: '
      else 'Modifica richiesta: ' end || new.title;
    if new.proposed_by_role = 'partner' and new.service_request_id is not null then
      insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
      values ('partner', v_title, v_quando || coalesce(' · ' || nullif(new.change_note, ''), ''),
              'partner-home?req=' || new.service_request_id, new.player_id, auth.uid());
      insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
      values ('admin', v_title, v_quando || coalesce(' · ' || nullif(new.change_note, ''), ''),
              'agenda?event=' || new.id, new.player_id, auth.uid());
    elsif new.proposed_by_role in ('preparatore','assicuratore','commercialista','fisioterapista','nutrizionista','wealth','agente') then
      insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
      values (new.proposed_by_role, v_title,
              v_quando || coalesce(' · ' || nullif(new.change_note, ''), ''),
              case when new.session_mode is not null then 'fitness?view=calendario&training=' || new.id
                   else 'agenda?event=' || new.id end,
              new.player_id, auth.uid());
    elsif new.request_status in ('confermata','rifiutata') then
      insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
      values ('player', case when new.request_status = 'confermata' then 'Richiesta confermata: ' || new.title
                             else 'Richiesta non accolta: ' || new.title end,
              v_quando, 'agenda?event=' || new.id, new.player_id, auth.uid());
    end if;
  end if;
  return new;
end $function$;

create or replace function public.crm_event_reproposed()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare v_quando text;
begin
  if coalesce(current_setting('auvi.training', true), '') = '1' then return new; end if;
  if auth.uid() = new.created_by
     and new.proposed_by_role in ('preparatore','assicuratore','commercialista','fisioterapista','nutrizionista','wealth','agente')
     and old.request_status in ('modifica_richiesta','rifiutata')
     and new.request_status is not distinct from old.request_status
     and (new.start_at, new.end_at, new.title, new.location, new.notes)
         is distinct from (old.start_at, old.end_at, old.title, old.location, old.notes) then
    new.request_status := 'da_confermare';
    v_quando := to_char(new.start_at at time zone 'Europe/Rome', 'DD/MM/YYYY HH24:MI');
    insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('player', 'Proposta aggiornata: ' || new.title, v_quando || ' · da confermare',
            case when new.session_mode is not null then 'fitness?training=' || new.id else 'agenda?event=' || new.id end,
            new.player_id, auth.uid());
  end if;
  return new;
end $function$;

-- ---------- il preparatore propone una sessione ----------
create or replace function public.crm_training_propose(
  p_player bigint, p_start timestamptz, p_minutes int, p_mode text,
  p_place text default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_who text; v_mode text;
begin
  if auth.uid() is null or not fitness_can_manage(p_player) then
    raise exception 'Non puoi proporre allenamenti a questo atleta';
  end if;
  if p_mode not in ('online','presenza') then raise exception 'Scegli online o in presenza'; end if;
  if p_start is null or p_start < now() - interval '10 minutes' then raise exception 'Scegli un orario futuro'; end if;
  if p_minutes is null or p_minutes < 15 or p_minutes > 240 then raise exception 'Durata non valida'; end if;

  perform set_config('auvi.training', '1', true);
  insert into crm_events (title, type, start_at, end_at, location, link_url, notes, player_id, created_by,
                          assignee_role, request_status, proposed_by_role, visibility, session_mode)
  values ('Allenamento', 'allenamento', p_start, p_start + make_interval(mins => p_minutes),
          case when p_mode = 'presenza' then nullif(trim(coalesce(p_place, '')), '') end,
          case when p_mode = 'online' then nullif(trim(coalesce(p_place, '')), '') end,
          nullif(trim(coalesce(p_note, '')), ''), p_player, auth.uid(),
          'player', 'da_confermare', 'preparatore', 'team', p_mode)
  returning id into v_id;

  v_who := coalesce(nullif(trim(coalesce(crm_pro_display_name(auth.uid(), 'preparatore'), '')), ''), 'Il preparatore');
  v_mode := case when p_mode = 'online' then 'Online' else 'In presenza' end;
  insert into crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
  values ('player', v_who || ' ti propone un allenamento',
          crm_training_when(p_start, p_player) || ' · ' || v_mode
            || coalesce(' · ' || nullif(trim(coalesce(p_place, '')), ''), '') || ' — tocca per confermare',
          'fitness?training=' || v_id, p_player, auth.uid());
  perform set_config('auvi.training', '', true);
  return v_id;
end $$;
revoke execute on function public.crm_training_propose(bigint, timestamptz, int, text, text, text) from public, anon;
grant execute on function public.crm_training_propose(bigint, timestamptz, int, text, text, text) to authenticated;

-- ---------- risposte: atleta (confirm / counter / decline) e preparatore (accept / repropose / cancel) ----------
create or replace function public.crm_training_respond(
  p_event uuid, p_action text, p_start timestamptz default null, p_note text default null)
returns text language plpgsql security definer set search_path = public as $$
declare e crm_events; v_player boolean; v_coach boolean; v_len interval; v_atleta text; v_who text;
        v_coach_route text; v_player_route text; v_status text;
begin
  select * into e from crm_events where id = p_event for update;
  if not found or e.session_mode is null then raise exception 'Allenamento non trovato'; end if;
  v_player := coalesce(e.player_id = current_player_api_id(), false) or coalesce(current_crm_role() in ('admin','creator'), false);
  v_coach := coalesce(fitness_can_manage(e.player_id), false);
  v_len := coalesce(e.end_at - e.start_at, interval '60 minutes');
  select name into v_atleta from player where api_player_id = e.player_id;
  v_atleta := coalesce(v_atleta, 'L''atleta');
  v_who := coalesce(nullif(trim(coalesce(crm_pro_display_name(e.created_by, 'preparatore'), '')), ''), 'Il preparatore');
  v_coach_route := 'fitness?view=calendario&training=' || e.id;
  v_player_route := 'fitness?training=' || e.id;
  perform set_config('auvi.training', '1', true);

  if p_action in ('confirm','counter','decline') then
    if not v_player then raise exception 'Solo l''atleta può rispondere a questa proposta'; end if;
    if e.request_status <> 'da_confermare' then raise exception 'Questa proposta non è più in attesa di risposta'; end if;
    if p_action = 'confirm' then
      update crm_events set request_status = 'confermata', change_note = null, counter_start_at = null, resolved_at = now()
        where id = e.id;
      insert into crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
      values ('preparatore', v_atleta || ' ha confermato l''allenamento',
              crm_training_when(e.start_at, e.player_id) || ' · ' || case when e.session_mode = 'online' then 'Online' else 'In presenza' end,
              v_coach_route, e.player_id, auth.uid());
      v_status := 'confermata';
    elsif p_action = 'counter' then
      if p_start is null or p_start < now() then raise exception 'Scegli un orario futuro'; end if;
      update crm_events set request_status = 'modifica_richiesta', counter_start_at = p_start,
             change_note = nullif(trim(coalesce(p_note, '')), '') where id = e.id;
      insert into crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
      values ('preparatore', v_atleta || ' propone un altro orario',
              crm_training_when(p_start, e.player_id) || ' invece di ' || crm_training_when(e.start_at, e.player_id)
                || coalesce(' · «' || nullif(trim(coalesce(p_note, '')), '') || '»', '') || ' — tocca per confermare',
              v_coach_route, e.player_id, auth.uid());
      v_status := 'modifica_richiesta';
    else
      update crm_events set request_status = 'rifiutata', change_note = nullif(trim(coalesce(p_note, '')), ''),
             counter_start_at = null, resolved_at = now() where id = e.id;
      insert into crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
      values ('preparatore', v_atleta || ' non può allenarsi',
              crm_training_when(e.start_at, e.player_id) || coalesce(' · «' || nullif(trim(coalesce(p_note, '')), '') || '»', ''),
              v_coach_route, e.player_id, auth.uid());
      v_status := 'rifiutata';
    end if;

  elsif p_action in ('accept','repropose','cancel') then
    if not v_coach then raise exception 'Solo il preparatore può gestire questa sessione'; end if;
    if p_action = 'accept' then
      if e.request_status <> 'modifica_richiesta' or e.counter_start_at is null then
        raise exception 'Non c''è un nuovo orario da confermare';
      end if;
      update crm_events set start_at = e.counter_start_at, end_at = e.counter_start_at + v_len,
             counter_start_at = null, request_status = 'confermata', resolved_at = now() where id = e.id;
      insert into crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
      values ('player', v_who || ' ha confermato il nuovo orario',
              'Allenamento ' || crm_training_when(e.counter_start_at, e.player_id) || ' · '
                || case when e.session_mode = 'online' then 'Online' else 'In presenza' end,
              v_player_route, e.player_id, auth.uid());
      v_status := 'confermata';
    elsif p_action = 'repropose' then
      if p_start is null or p_start < now() then raise exception 'Scegli un orario futuro'; end if;
      update crm_events set start_at = p_start, end_at = p_start + v_len, counter_start_at = null,
             change_note = null, request_status = 'da_confermare', resolved_at = null where id = e.id;
      insert into crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
      values ('player', v_who || ' propone un nuovo orario',
              'Allenamento ' || crm_training_when(p_start, e.player_id) || ' — tocca per confermare',
              v_player_route, e.player_id, auth.uid());
      v_status := 'da_confermare';
    else
      delete from crm_events where id = e.id;
      insert into crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
      values ('player', 'Allenamento annullato',
              crm_training_when(e.start_at, e.player_id) || coalesce(' · «' || nullif(trim(coalesce(p_note, '')), '') || '»', ''),
              'fitness', e.player_id, auth.uid());
      v_status := 'annullata';
    end if;
  else
    raise exception 'Azione non valida';
  end if;

  perform set_config('auvi.training', '', true);
  return v_status;
end $$;
revoke execute on function public.crm_training_respond(uuid, text, timestamptz, text) from public, anon;
grant execute on function public.crm_training_respond(uuid, text, timestamptz, text) to authenticated;
