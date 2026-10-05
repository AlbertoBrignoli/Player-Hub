-- Programma settimanale dell'atleta (05/10/2026)
-- L'unica azione attiva dell'atleta: carica il PDF/foto del programma del club, l'AI lo legge,
-- lui spunta cosa tenere e salva. Il programma entra nel calendario (definitivo per la settimana)
-- e il team riceve UNA notifica. Se poi l'atleta cambia un impegno del programma, il team
-- riceve "Brignoli ha modificato l'allenamento: dalle 13:00 alle 16:00".

create table if not exists public.crm_week_plans (
  id uuid primary key default gen_random_uuid(),
  player_id bigint not null references public.player(api_player_id) on delete cascade,
  week_start date not null,
  file_path text,
  file_name text,
  status text not null default 'bozza' check (status in ('bozza','confermato')),
  ai_items jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create index if not exists idx_week_plans_player on public.crm_week_plans (player_id, week_start desc);
alter table public.crm_week_plans enable row level security;
drop policy if exists p_wp_read on public.crm_week_plans;
create policy p_wp_read on public.crm_week_plans for select to authenticated
  using (crm_manages_player(player_id) or crm_team_sees(player_id));
drop policy if exists p_wp_write on public.crm_week_plans;
create policy p_wp_write on public.crm_week_plans for all to authenticated
  using (crm_manages_player(player_id)) with check (crm_manages_player(player_id));
revoke all on public.crm_week_plans from anon;

alter table public.crm_events add column if not exists week_plan_id uuid references public.crm_week_plans(id) on delete set null;
create index if not exists idx_events_week_plan on public.crm_events (week_plan_id);

-- file del programma: privato, cartella = id atleta; lo vedono atleta, AUVI e team
insert into storage.buckets (id, name, public, file_size_limit) values ('week-plans', 'week-plans', false, 20971520)
  on conflict (id) do nothing;
drop policy if exists p_wpfiles_read on storage.objects;
create policy p_wpfiles_read on storage.objects for select to authenticated using (
  bucket_id = 'week-plans' and (case when (storage.foldername(name))[1] ~ '^[0-9]+$'
    then crm_manages_player(((storage.foldername(name))[1])::bigint) or crm_team_sees(((storage.foldername(name))[1])::bigint)
    else false end));
drop policy if exists p_wpfiles_insert on storage.objects;
create policy p_wpfiles_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'week-plans' and (case when (storage.foldername(name))[1] ~ '^[0-9]+$'
    then crm_manages_player(((storage.foldername(name))[1])::bigint) else false end));

-- notifica a tutto il team dell'atleta (una riga per ruolo collegato) + AUVI
create or replace function public.crm_notify_team(p_player bigint, p_title text, p_body text, p_route text, p_source uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_role text;
begin
  for v_role in
    select 'agente' where exists (select 1 from crm_agent_athletes where player_id = p_player)
    union all select 'preparatore' where exists (select 1 from fitness_trainer_athletes where player_id = p_player)
    union all select 'fisioterapista' where exists (select 1 from crm_physio_athletes where player_id = p_player)
    union all select 'assicuratore' where exists (select 1 from crm_insurer_athletes where player_id = p_player)
    union all select 'commercialista' where exists (select 1 from crm_tax_athletes where player_id = p_player)
    union all select 'admin'
  loop
    insert into crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values (v_role, p_title, p_body, p_route, p_player, p_source);
  end loop;
end $$;
revoke execute on function public.crm_notify_team(bigint, text, text, text, uuid) from public, anon, authenticated;

-- il fisioterapista vede le notifiche dei suoi atleti (mancava nella policy)
drop policy if exists p_notif_select on public.crm_notifications;
create policy p_notif_select on public.crm_notifications for select to authenticated using (
  (current_crm_role() = any (array['admin','creator']))
  or ((recipient_role = 'player') and (player_id = current_player_api_id()))
  or ((recipient_role = 'preparatore') and (current_crm_role() = 'preparatore') and fitness_can_manage(player_id))
  or ((current_crm_role() = 'agente') and crm_agent_sees(player_id))
  or ((recipient_role = 'assicuratore') and (current_crm_role() = 'assicuratore') and crm_insurer_sees(player_id))
  or ((recipient_role = 'commercialista') and (current_crm_role() = 'commercialista') and crm_tax_sees(player_id))
  or ((recipient_role = 'fisioterapista') and (current_crm_role() = 'fisioterapista') and crm_physio_sees(player_id))
  or ((recipient_role = 'brand') and crm_brand_sees(player_id))
  or ((recipient_role = 'partner') and route like 'partner-home?req=%'
      and (case when route ~ 'req=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
           then crm_is_request_partner(substring(route from 'req=([0-9a-f-]{36})')::uuid) else false end))
);

-- salva il programma: gli impegni spuntati entrano nel calendario (fuso dello stadio dell'atleta)
-- p_items: [{date:'2026-10-06', start:'10:30', end:'12:00', type:'allenamento', title:'...', location:'...', notes:'...'}]
create or replace function public.crm_save_week_plan(p_plan uuid, p_items jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare w record; v_tz text; v_name text; it jsonb; n int := 0; v_start timestamptz; v_end timestamptz; v_first boolean;
begin
  select * into w from crm_week_plans where id = p_plan;
  if w is null or not crm_manages_player(w.player_id) then raise exception 'Programma non tuo'; end if;
  select coalesce(timezone, 'Europe/Rome'), name into v_tz, v_name from player where api_player_id = w.player_id;
  v_first := w.status = 'bozza';
  -- risalvare sostituisce gli impegni di questo programma (senza notifiche "ha tolto")
  perform set_config('auvi.week_resave', '1', true);
  delete from crm_events where week_plan_id = p_plan;
  perform set_config('auvi.week_resave', '', true);
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    if coalesce(it->>'date', '') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(it->>'start', '') !~ '^\d{1,2}:\d{2}$' then continue; end if;
    v_start := ((it->>'date') || ' ' || (it->>'start'))::timestamp at time zone v_tz;
    v_end := case when coalesce(it->>'end', '') ~ '^\d{1,2}:\d{2}$'
                  then ((it->>'date') || ' ' || (it->>'end'))::timestamp at time zone v_tz end;
    if v_end is not null and v_end <= v_start then v_end := null; end if;
    insert into crm_events (player_id, title, type, start_at, end_at, location, notes, created_by, visibility, week_plan_id)
    values (w.player_id, coalesce(nullif(trim(it->>'title'), ''), 'Allenamento'),
            case when it->>'type' in ('allenamento','partita','viaggio','medico','personale','visita','nutrizione','call') then it->>'type' else 'allenamento' end,
            v_start, v_end, nullif(trim(coalesce(it->>'location', '')), ''), nullif(trim(coalesce(it->>'notes', '')), ''),
            auth.uid(), 'team', p_plan);
    n := n + 1;
  end loop;
  update crm_week_plans set status = 'confermato', confirmed_at = now() where id = p_plan;
  perform crm_notify_team(w.player_id,
    coalesce(v_name, 'L''atleta') || case when v_first then ' ha caricato il programma della settimana' else ' ha aggiornato il programma della settimana' end,
    'Settimana dal ' || to_char(w.week_start, 'DD/MM') || ' · ' || n || ' impegni', 'agenda', auth.uid());
  return n;
end $$;
revoke execute on function public.crm_save_week_plan(uuid, jsonb) from public, anon;
grant execute on function public.crm_save_week_plan(uuid, jsonb) to authenticated;

-- modifica o cancellazione in corsa di un impegno del programma: il team lo sa subito
create or replace function public.crm_week_event_changed()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text; v_tz text; v_kind text; v_body text; v_day text; v_who text;
begin
  if old.week_plan_id is null or coalesce(current_crm_role(), '') not in ('player','admin','creator','agente') then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  -- il salvataggio del programma rimpiazza gli impegni: non e' una modifica in corsa
  if tg_op = 'DELETE' and coalesce(current_setting('auvi.week_resave', true), '') = '1' then return old; end if;
  select name, coalesce(timezone, 'Europe/Rome') into v_name, v_tz from player where api_player_id = old.player_id;
  v_who := coalesce(v_name, 'L''atleta');
  v_kind := lower(coalesce(old.title, 'impegno'));
  v_day := to_char(old.start_at at time zone v_tz, 'DD/MM');
  if tg_op = 'DELETE' then
    perform crm_notify_team(old.player_id, v_who || ' ha tolto ' || v_kind,
      'Era ' || v_day || ' alle ' || to_char(old.start_at at time zone v_tz, 'HH24:MI'), 'agenda', auth.uid());
    return old;
  end if;
  if (new.start_at, new.end_at, new.title, new.location) is not distinct from (old.start_at, old.end_at, old.title, old.location) then
    return new;
  end if;
  if new.start_at is distinct from old.start_at or new.end_at is distinct from old.end_at then
    v_body := 'Dalle ' || to_char(old.start_at at time zone v_tz, 'HH24:MI') || ' alle ' || to_char(new.start_at at time zone v_tz, 'HH24:MI')
      || case when to_char(old.start_at at time zone v_tz, 'DD/MM') <> to_char(new.start_at at time zone v_tz, 'DD/MM')
              then ' · spostato al ' || to_char(new.start_at at time zone v_tz, 'DD/MM') else ' · ' || v_day end;
  else
    v_body := v_day || ' · ' || coalesce(new.title, '') || coalesce(' · ' || new.location, '');
  end if;
  perform crm_notify_team(old.player_id, v_who || ' ha modificato ' || v_kind, v_body, 'agenda?event=' || new.id, auth.uid());
  return new;
end $$;
drop trigger if exists trg_week_event_changed on public.crm_events;
create trigger trg_week_event_changed after update or delete on public.crm_events
  for each row execute function public.crm_week_event_changed();
revoke execute on function public.crm_week_event_changed() from public, anon, authenticated;

-- gli impegni del programma non sono "richieste da confermare"
create or replace function public.crm_event_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_role text; v_atleta text; v_quando text; v_who text;
begin
  -- impegni del programma settimanale: definitivi, la notifica al team la manda crm_save_week_plan
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
  elsif v_role in ('preparatore','assicuratore','commercialista','fisioterapista','agente')
        and new.fitness_program_id is null then
    -- proposta di un professionista: la conferma l'atleta
    new.request_status := 'da_confermare';
    new.assignee_role := 'player';
    v_who := coalesce(nullif(trim(coalesce(public.crm_pro_display_name(new.created_by, v_role), '')), ''), initcap(v_role));
    insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('player', 'Proposta da ' || v_who || ': ' || new.title,
            v_quando || coalesce(' · ' || new.location, '') || ' · da confermare', 'agenda', new.player_id, new.created_by);
  elsif v_role in ('admin','creator') then
    insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('player', 'Nuovo impegno: ' || new.title,
            v_quando || coalesce(' · ' || new.location, ''), 'agenda', new.player_id, new.created_by);
  end if;
  return new;
end $$;

