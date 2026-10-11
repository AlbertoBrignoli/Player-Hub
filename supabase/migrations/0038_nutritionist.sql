-- Nutrizionista sportivo (11/10/2026)
-- Nuovo professionista del team dell'atleta. Vede il calendario (programma del club incluso)
-- e da lì integra il mangiare e gli integratori:
--  * su un impegno esistente (colazione, allenamento, partita…) aggiunge "cosa mangiare" e i
--    supplementi → crm_events.nutrition, via RPC crm_set_event_nutrition (l'atleta non deve fare nulla);
--  * crea pasti/integratori come impegni di tipo 'nutrizione': indicazioni, non proposte da confermare.
-- Il programma settimanale risalvato conserva le indicazioni sugli impegni che restano uguali.

-- ruolo
alter table public.crm_profiles drop constraint if exists crm_profiles_role_check;
alter table public.crm_profiles add constraint crm_profiles_role_check check (role = any (array['admin','player','creator','brand','preparatore','agente','assicuratore','commercialista','fisioterapista','nutrizionista','partner']));
alter table public.crm_allowed_emails drop constraint if exists crm_allowed_emails_role_check;
alter table public.crm_allowed_emails add constraint crm_allowed_emails_role_check check (role = any (array['admin','player','creator','brand','preparatore','agente','assicuratore','commercialista','fisioterapista','nutrizionista','partner']));
alter table public.crm_user_roles drop constraint if exists crm_user_roles_role_check;
alter table public.crm_user_roles add constraint crm_user_roles_role_check check (role = any (array['admin','player','creator','brand','preparatore','agente','assicuratore','commercialista','fisioterapista','nutrizionista','partner']));
alter table public.crm_notifications drop constraint if exists crm_notifications_recipient_role_check;
alter table public.crm_notifications add constraint crm_notifications_recipient_role_check check (recipient_role = any (array['admin','player','creator','team','preparatore','brand','agente','assicuratore','commercialista','fisioterapista','nutrizionista','partner']));

-- atleti seguiti e profilo
create table if not exists public.crm_nutri_athletes (
  nutri_id uuid not null references auth.users(id) on delete cascade,
  player_id bigint not null references public.player(api_player_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (nutri_id, player_id)
);
alter table public.crm_nutri_athletes enable row level security;
drop policy if exists p_nutriath_admin on public.crm_nutri_athletes;
create policy p_nutriath_admin on public.crm_nutri_athletes for all to authenticated using (crm_is_admin()) with check (crm_is_admin());
drop policy if exists p_nutriath_self on public.crm_nutri_athletes;
create policy p_nutriath_self on public.crm_nutri_athletes for select to authenticated using (nutri_id = auth.uid());
revoke all on public.crm_nutri_athletes from anon;

create table if not exists public.crm_nutri_profile (
  nutri_id uuid primary key references auth.users(id) on delete cascade,
  name text, title text, licence text, city text, photo_url text,
  email text, phone text, whatsapp text, website text,
  bio text, specialties text, clubs text, years_experience text, languages text,
  updated_at timestamptz not null default now()
);
alter table public.crm_nutri_profile enable row level security;
drop policy if exists p_nutri_admin on public.crm_nutri_profile;
create policy p_nutri_admin on public.crm_nutri_profile for all to authenticated using (crm_is_admin()) with check (crm_is_admin());
drop policy if exists p_nutri_read on public.crm_nutri_profile;
create policy p_nutri_read on public.crm_nutri_profile for select to authenticated using (true);
drop policy if exists p_nutri_self_ins on public.crm_nutri_profile;
create policy p_nutri_self_ins on public.crm_nutri_profile for insert to authenticated with check (nutri_id = auth.uid());
drop policy if exists p_nutri_self_upd on public.crm_nutri_profile;
create policy p_nutri_self_upd on public.crm_nutri_profile for update to authenticated using (nutri_id = auth.uid()) with check (nutri_id = auth.uid());
revoke all on public.crm_nutri_profile from anon;

create or replace function public.crm_nutri_sees(p_api bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select current_crm_role() = 'nutrizionista'
     and exists (select 1 from public.crm_nutri_athletes n where n.nutri_id = auth.uid() and n.player_id = p_api);
$$;

create or replace function public.crm_team_sees(p_api bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select crm_agent_sees(p_api) or crm_insurer_sees(p_api) or crm_tax_sees(p_api) or crm_physio_sees(p_api)
      or crm_nutri_sees(p_api)
      or (current_crm_role() = 'preparatore' and fitness_can_manage(p_api));
$$;

-- anagrafica atleta e partite (per vedere quando gioca)
drop policy if exists rls_read_scoped on public.player;
create policy rls_read_scoped on public.player for select using (
  (current_crm_role() = any (array['admin','creator']))
  or ((current_crm_role() = 'player') and (api_player_id = current_player_api_id()))
  or ((current_crm_role() = 'preparatore') and exists (select 1 from fitness_trainer_athletes a where a.trainer_id = auth.uid() and a.player_id = player.api_player_id))
  or crm_agent_sees(api_player_id) or crm_insurer_sees(api_player_id) or crm_tax_sees(api_player_id)
  or crm_brand_sees(api_player_id) or crm_physio_sees(api_player_id) or crm_nutri_sees(api_player_id));
drop policy if exists rls_read_scoped on public.matches;
create policy rls_read_scoped on public.matches for select using (
  crm_manages_player(player_id) or ((current_crm_role() = 'preparatore') and fitness_can_manage(player_id))
  or crm_brand_sees(player_id) or crm_insurer_sees(player_id) or crm_tax_sees(player_id)
  or crm_physio_sees(player_id) or crm_nutri_sees(player_id));

-- collegamento con codice invito, come gli altri professionisti
create or replace function public.crm_link_pro(p_pro uuid, p_role text, p_player bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_role = 'assicuratore' then
    insert into crm_insurer_athletes (insurer_id, player_id) values (p_pro, p_player) on conflict do nothing;
  elsif p_role = 'agente' then
    insert into crm_agent_athletes (agent_id, player_id) values (p_pro, p_player) on conflict do nothing;
  elsif p_role = 'preparatore' then
    insert into fitness_trainer_athletes (trainer_id, player_id) values (p_pro, p_player) on conflict do nothing;
  elsif p_role = 'commercialista' then
    insert into crm_tax_athletes (advisor_id, player_id) values (p_pro, p_player) on conflict do nothing;
  elsif p_role = 'fisioterapista' then
    insert into crm_physio_athletes (physio_id, player_id) values (p_pro, p_player) on conflict do nothing;
  elsif p_role = 'nutrizionista' then
    insert into crm_nutri_athletes (nutri_id, player_id) values (p_pro, p_player) on conflict do nothing;
  else
    raise exception 'Ruolo professionale non valido: %', p_role;
  end if;
end $$;

create or replace function public.crm_pro_display_name(p_pro uuid, p_role text)
returns text language sql stable security definer set search_path = public as $$
  select case p_role
    when 'assicuratore' then (select name from crm_insurer_profile where insurer_id = p_pro)
    when 'agente' then (select name from crm_agent_profile where agent_id = p_pro)
    when 'preparatore' then (select name from fitness_coach_profile where trainer_id = p_pro)
    when 'commercialista' then (select name from crm_tax_profile where advisor_id = p_pro)
    when 'fisioterapista' then (select name from crm_physio_profile where physio_id = p_pro)
    when 'nutrizionista' then (select name from crm_nutri_profile where nutri_id = p_pro)
  end;
$$;

create or replace function public.crm_generate_code(p_player_id bigint, p_label text default null, p_role text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_prefix text; v_code text; v_name text; i int := 0;
begin
  if not coalesce(current_crm_role() = 'admin'
          or (current_crm_role() = 'player' and p_player_id = current_player_api_id()), false) then
    raise exception 'Non autorizzato a generare codici per questo atleta';
  end if;
  if p_role is not null and p_role not in ('assicuratore','agente','preparatore','commercialista','fisioterapista','nutrizionista') then
    raise exception 'Ruolo invito non valido: %', p_role;
  end if;
  select name into v_name from public.player where api_player_id = p_player_id;
  v_prefix := coalesce(nullif(upper(substr(regexp_replace(coalesce(v_name,''), '[^a-zA-Z]', '', 'g'), 1, 3)), ''), 'ATL');
  loop
    v_code := v_prefix || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.crm_access_codes where code = v_code);
    i := i + 1; if i > 25 then raise exception 'Generazione codice non riuscita'; end if;
  end loop;
  insert into public.crm_access_codes (code, player_id, label, role, created_by)
  values (v_code, p_player_id, nullif(trim(coalesce(p_label, '')), ''), p_role, auth.uid());
  return jsonb_build_object('ok', true, 'code', v_code);
end $$;

create or replace function public.crm_pro_create_invite(p_label text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_role text := current_crm_role(); v_code text; i int := 0;
begin
  if v_role is null or v_role not in ('assicuratore','agente','preparatore','commercialista','fisioterapista','nutrizionista') then
    raise exception 'Solo i professionisti possono creare un invito';
  end if;
  loop
    v_code := 'AUVI-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.crm_access_codes where code = v_code);
    i := i + 1; if i > 25 then raise exception 'Generazione codice non riuscita'; end if;
  end loop;
  insert into public.crm_access_codes (code, player_id, label, role, created_by, pro_id, pro_role)
  values (v_code, null, nullif(trim(coalesce(p_label, '')), ''), null, auth.uid(), auth.uid(), v_role);
  return jsonb_build_object('ok', true, 'code', v_code);
end $$;

create or replace function public.crm_request_access(p_code text, p_message text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_player bigint; v_name text; v_role text; v_who text; v_mail text; v_prof text; c record;
begin
  v_role := current_crm_role();
  if v_role is null or v_role not in ('assicuratore','agente','preparatore','commercialista','fisioterapista','nutrizionista') then
    raise exception 'Solo i professionisti possono collegarsi a un atleta';
  end if;
  select * into c from public.crm_access_codes
   where upper(code) = upper(trim(p_code)) and status = 'active' and pro_id is null;
  if c is null then
    return jsonb_build_object('ok', false, 'error', 'Codice non valido o gia utilizzato');
  end if;
  if c.role is not null and c.role <> v_role then
    return jsonb_build_object('ok', false, 'error', 'Questo codice e per un altro tipo di professionista');
  end if;
  v_player := c.player_id;
  select name into v_name from public.player where api_player_id = v_player;
  perform public.crm_link_pro(auth.uid(), v_role, v_player);
  update public.crm_access_codes set status = 'used', used_by = auth.uid(), used_at = now() where id = c.id and status = 'active';
  select full_name, email into v_who, v_mail from public.crm_profiles where id = auth.uid();
  v_prof := public.crm_pro_display_name(auth.uid(), v_role);
  v_who := coalesce(nullif(trim(coalesce(v_prof,'')), ''), v_who, v_mail);
  insert into public.crm_access_requests
    (requester_id, requester_role, player_id, message, requester_name, requester_email, status, decided_at, decided_by)
  values (auth.uid(), v_role, v_player, p_message, v_who, v_mail, 'approvata', now(), auth.uid())
  on conflict (requester_id, player_id) do update
    set status='approvata', message=excluded.message, created_at=now(),
        requester_name=excluded.requester_name, requester_email=excluded.requester_email,
        decided_at=now(), decided_by=auth.uid();
  insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
  values ('admin', 'Nuovo collegamento',
          coalesce(v_who,'Un professionista') || ' (' || v_role || ') si e collegato a ' || v_name, 'access-requests', v_player, auth.uid());
  insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
  values ('player', 'Nuovo collegamento',
          coalesce(v_who,'Un professionista') || ' (' || v_role || ') si e collegato alla tua area', 'access-requests', v_player, auth.uid());
  return jsonb_build_object('ok', true, 'player', v_name);
end $$;

-- "Il mio team" dell'atleta
create or replace view public.crm_athlete_team as
 with members as (
   select a.player_id, 'agente'::text as role, 1 as sort, pr.name, pr.title, pr.photo_url, pr.email, pr.phone, pr.whatsapp, pr.agency_name
     from crm_agent_athletes a join crm_agent_profile pr on pr.agent_id = a.agent_id
   union all
   select t.player_id, 'preparatore'::text, 2, pr.name, pr.headline, pr.photo_url, pr.contacts ->> 'email', pr.contacts ->> 'phone', pr.contacts ->> 'whatsapp', null::text
     from fitness_trainer_athletes t join fitness_coach_profile pr on pr.trainer_id = t.trainer_id
   union all
   select i.player_id, 'assicuratore'::text, 3, pr.name, pr.title, pr.photo_url, pr.email, pr.phone, pr.whatsapp, pr.agency_name
     from crm_insurer_athletes i join crm_insurer_profile pr on pr.insurer_id = i.insurer_id
   union all
   select x.player_id, 'commercialista'::text, 4, pr.name, pr.title, pr.photo_url, pr.email, pr.phone, pr.whatsapp, pr.agency_name
     from crm_tax_athletes x join crm_tax_profile pr on pr.advisor_id = x.advisor_id
   union all
   select f.player_id, 'fisioterapista'::text, 5, pr.name, pr.title, pr.photo_url, pr.email, pr.phone, pr.whatsapp, pr.clinic_name
     from crm_physio_athletes f join crm_physio_profile pr on pr.physio_id = f.physio_id
   union all
   select n.player_id, 'nutrizionista'::text, 6, pr.name, pr.title, pr.photo_url, pr.email, pr.phone, pr.whatsapp, null::text
     from crm_nutri_athletes n join crm_nutri_profile pr on pr.nutri_id = n.nutri_id
 )
 select player_id, role, sort, name, title, photo_url, email, phone, whatsapp, agency_name
   from members m
  where exists (select 1 from crm_profiles me where me.id = auth.uid() and me.role = 'admin')
     or exists (select 1 from crm_profiles me where me.id = auth.uid() and me.player_api_id = m.player_id)
     or exists (select 1 from crm_agent_athletes z where z.agent_id = auth.uid() and z.player_id = m.player_id)
     or exists (select 1 from fitness_trainer_athletes z where z.trainer_id = auth.uid() and z.player_id = m.player_id)
     or exists (select 1 from crm_insurer_athletes z where z.insurer_id = auth.uid() and z.player_id = m.player_id)
     or exists (select 1 from crm_tax_athletes z where z.advisor_id = auth.uid() and z.player_id = m.player_id)
     or exists (select 1 from crm_physio_athletes z where z.physio_id = auth.uid() and z.player_id = m.player_id)
     or exists (select 1 from crm_nutri_athletes z where z.nutri_id = auth.uid() and z.player_id = m.player_id);

-- notifiche: il nutrizionista vede quelle dei suoi atleti; e' parte del team avvisato
drop policy if exists p_notif_select on public.crm_notifications;
create policy p_notif_select on public.crm_notifications for select to authenticated using (
  (current_crm_role() = any (array['admin','creator']))
  or ((recipient_role = 'player') and (player_id = current_player_api_id()))
  or ((recipient_role = 'preparatore') and (current_crm_role() = 'preparatore') and fitness_can_manage(player_id))
  or ((current_crm_role() = 'agente') and crm_agent_sees(player_id))
  or ((recipient_role = 'assicuratore') and (current_crm_role() = 'assicuratore') and crm_insurer_sees(player_id))
  or ((recipient_role = 'commercialista') and (current_crm_role() = 'commercialista') and crm_tax_sees(player_id))
  or ((recipient_role = 'fisioterapista') and (current_crm_role() = 'fisioterapista') and crm_physio_sees(player_id))
  or ((recipient_role = 'nutrizionista') and (current_crm_role() = 'nutrizionista') and crm_nutri_sees(player_id))
  or ((recipient_role = 'brand') and crm_brand_sees(player_id))
  or ((recipient_role = 'partner') and route like 'partner-home?req=%'
      and (case when route ~ 'req=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
           then crm_is_request_partner(substring(route from 'req=([0-9a-f-]{36})')::uuid) else false end))
);

create or replace function public.crm_notify_team(p_player bigint, p_title text, p_body text, p_route text, p_source uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_role text;
begin
  for v_role in
    select 'agente' where exists (select 1 from crm_agent_athletes where player_id = p_player)
    union all select 'preparatore' where exists (select 1 from fitness_trainer_athletes where player_id = p_player)
    union all select 'fisioterapista' where exists (select 1 from crm_physio_athletes where player_id = p_player)
    union all select 'nutrizionista' where exists (select 1 from crm_nutri_athletes where player_id = p_player)
    union all select 'assicuratore' where exists (select 1 from crm_insurer_athletes where player_id = p_player)
    union all select 'commercialista' where exists (select 1 from crm_tax_athletes where player_id = p_player)
    union all select 'admin'
  loop
    insert into crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values (v_role, p_title, p_body, p_route, p_player, p_source);
  end loop;
end $$;
revoke execute on function public.crm_notify_team(bigint, text, text, text, uuid) from public, anon, authenticated;

-- indicazioni alimentari su un impegno: {menu, supplements:[{name,dose,when}], note, by, by_name, updated_at}
alter table public.crm_events add column if not exists nutrition jsonb;

create or replace function public.crm_set_event_nutrition(p_event uuid, p_nutrition jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare e record; v_role text := current_crm_role(); v_who text; v_new jsonb; v_tz text;
begin
  select * into e from crm_events where id = p_event;
  if e is null then raise exception 'Impegno non trovato'; end if;
  if not (crm_nutri_sees(e.player_id) or v_role in ('admin','creator')) then
    raise exception 'Solo il nutrizionista dell''atleta puo'' integrare il piano alimentare';
  end if;
  if not crm_event_visible(p_event) then raise exception 'Impegno non visibile'; end if;
  v_who := coalesce(nullif(trim(coalesce(crm_pro_display_name(auth.uid(), v_role), '')), ''),
                    (select full_name from crm_profiles where id = auth.uid()), 'Il nutrizionista');
  -- vuoto = togli le indicazioni
  if p_nutrition is null or (coalesce(trim(p_nutrition->>'menu'), '') = '' and coalesce(trim(p_nutrition->>'note'), '') = ''
       and coalesce(jsonb_array_length(case when jsonb_typeof(p_nutrition->'supplements') = 'array' then p_nutrition->'supplements' end), 0) = 0) then
    v_new := null;
  else
    v_new := jsonb_build_object(
      'menu', nullif(trim(coalesce(p_nutrition->>'menu', '')), ''),
      'note', nullif(trim(coalesce(p_nutrition->>'note', '')), ''),
      'supplements', coalesce((select jsonb_agg(jsonb_build_object(
          'name', trim(s->>'name'), 'dose', nullif(trim(coalesce(s->>'dose', '')), ''), 'when', nullif(trim(coalesce(s->>'when', '')), '')))
        from jsonb_array_elements(case when jsonb_typeof(p_nutrition->'supplements') = 'array' then p_nutrition->'supplements' else '[]'::jsonb end) s
        where coalesce(trim(s->>'name'), '') <> ''), '[]'::jsonb),
      'by', auth.uid(), 'by_name', v_who, 'updated_at', now());
  end if;
  update crm_events set nutrition = v_new where id = p_event;
  if v_new is not null then
    select coalesce(timezone, 'Europe/Rome') into v_tz from player where api_player_id = e.player_id;
    insert into crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('player', v_who || ': piano alimentare per ' || lower(e.title),
            to_char(e.start_at at time zone coalesce(v_tz, 'Europe/Rome'), 'DD/MM HH24:MI')
              || coalesce(' · ' || left(v_new->>'menu', 90), '')
              || case jsonb_array_length(v_new->'supplements') when 0 then '' when 1 then ' · 1 integratore' else ' · ' || jsonb_array_length(v_new->'supplements') || ' integratori' end,
            'agenda?event=' || e.id, e.player_id, auth.uid());
  end if;
end $$;
revoke execute on function public.crm_set_event_nutrition(uuid, jsonb) from public, anon;
grant execute on function public.crm_set_event_nutrition(uuid, jsonb) to authenticated;

-- impegni 'nutrizione' del nutrizionista: indicazioni definitive (l'atleta non deve confermare);
-- li corregge o li toglie lui
drop policy if exists p_events_nutri_upd on public.crm_events;
create policy p_events_nutri_upd on public.crm_events for update to authenticated
  using (crm_nutri_sees(player_id) and created_by = auth.uid() and type = 'nutrizione')
  with check (crm_nutri_sees(player_id) and created_by = auth.uid() and type = 'nutrizione');
drop policy if exists p_events_nutri_del on public.crm_events;
create policy p_events_nutri_del on public.crm_events for delete to authenticated
  using (crm_nutri_sees(player_id) and created_by = auth.uid() and type = 'nutrizione');

create or replace function public.crm_event_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_role text; v_atleta text; v_quando text; v_who text;
begin
  -- impegni del programma settimanale: definitivi, la notifica al team la manda il salvataggio
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
    -- pasto o integratore: indicazione del nutrizionista, entra direttamente nel calendario
    new.request_status := null;
    new.visibility := 'team';
    v_who := coalesce(nullif(trim(coalesce(public.crm_pro_display_name(new.created_by, v_role), '')), ''), 'Il nutrizionista');
    insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('player', v_who || ': ' || new.title,
            v_quando || coalesce(' · ' || new.location, ''), 'agenda', new.player_id, new.created_by);
  elsif v_role in ('preparatore','assicuratore','commercialista','fisioterapista','nutrizionista','agente')
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

-- commenti, conferme e riproposte: anche il nutrizionista
create or replace function public.crm_event_comment_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare e record; v_role text; v_who text;
begin
  select * into e from crm_events where id = new.event_id;
  select role into v_role from crm_profiles where id = new.author_id;
  new.author_role := v_role;
  if v_role = 'partner' then
    v_who := coalesce((select s.partner_name from crm_service_requests r join crm_services s on s.id = r.service_id
                       where r.id = e.service_request_id), 'Partner');
  else
    v_who := coalesce(nullif(trim(coalesce(public.crm_pro_display_name(new.author_id, v_role), '')), ''),
                      (select full_name from crm_profiles where id = new.author_id), initcap(coalesce(v_role, '')));
  end if;
  if v_role in ('preparatore','assicuratore','commercialista','fisioterapista','nutrizionista','agente','partner') then
    insert into crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('player',
            case when new.kind = 'modifica' then v_who || ' chiede una modifica: ' else v_who || ' ha commentato: ' end || e.title,
            left(new.body, 140), 'agenda?event=' || e.id, e.player_id, new.author_id);
  elsif e.proposed_by_role = 'partner' and e.service_request_id is not null then
    insert into crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('partner', case when new.kind = 'modifica' then 'Modifica richiesta: ' else 'Nuovo commento: ' end || e.title,
            left(new.body, 140), 'partner-home?req=' || e.service_request_id, e.player_id, new.author_id);
  elsif e.proposed_by_role in ('preparatore','assicuratore','commercialista','fisioterapista','nutrizionista','agente') then
    insert into crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values (e.proposed_by_role, 'Nuovo commento: ' || e.title, left(new.body, 140), 'agenda', e.player_id, new.author_id);
  elsif e.nutrition is not null and e.nutrition ? 'by' then
    -- commento dell'atleta su un impegno con indicazioni alimentari: lo legge il nutrizionista
    insert into crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('nutrizionista', 'Nuovo commento: ' || e.title, left(new.body, 140), 'agenda?event=' || e.id, e.player_id, new.author_id);
  end if;
  return new;
end $$;

create or replace function public.crm_event_confirmed()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_quando text; v_title text;
begin
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
    elsif new.proposed_by_role in ('preparatore','assicuratore','commercialista','fisioterapista','nutrizionista','agente') then
      insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
      values (new.proposed_by_role, v_title,
              v_quando || coalesce(' · ' || nullif(new.change_note, ''), ''), 'agenda', new.player_id, auth.uid());
    elsif new.request_status in ('confermata','rifiutata') then
      insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
      values ('player', case when new.request_status = 'confermata' then 'Richiesta confermata: ' || new.title
                             else 'Richiesta non accolta: ' || new.title end,
              v_quando, 'agenda', new.player_id, auth.uid());
    end if;
  end if;
  return new;
end $$;

create or replace function public.crm_event_reproposed()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_quando text;
begin
  if auth.uid() = new.created_by
     and new.proposed_by_role in ('preparatore','assicuratore','commercialista','fisioterapista','nutrizionista','agente')
     and old.request_status in ('modifica_richiesta','rifiutata')
     and new.request_status is not distinct from old.request_status
     and (new.start_at, new.end_at, new.title, new.location, new.notes)
         is distinct from (old.start_at, old.end_at, old.title, old.location, old.notes) then
    new.request_status := 'da_confermare';
    v_quando := to_char(new.start_at at time zone 'Europe/Rome', 'DD/MM/YYYY HH24:MI');
    insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('player', 'Proposta aggiornata: ' || new.title, v_quando || ' · da confermare', 'agenda', new.player_id, auth.uid());
  end if;
  return new;
end $$;

-- programma risalvato: le indicazioni del nutrizionista restano sugli impegni uguali (stesso orario e titolo)
create or replace function public.crm_save_week_plans(p_plan uuid, p_items jsonb, p_weeks date[] default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare w record; v_tz text; v_name text; it jsonb; v_week date; v_pid uuid; v_first boolean := true;
        n int := 0; nw int := 0; v_start timestamptz; v_end timestamptz; v_weeks date[]; v_old uuid;
        v_keep jsonb; v_title text;
begin
  select * into w from crm_week_plans where id = p_plan;
  if w is null or not crm_manages_player(w.player_id) then raise exception 'Programma non tuo'; end if;
  select coalesce(timezone, 'Europe/Rome'), name into v_tz, v_name from player where api_player_id = w.player_id;

  select coalesce(array_agg(distinct d order by d), '{}') into v_weeks from (
    select date_trunc('week', (x->>'date')::date)::date d from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x
      where coalesce(x->>'date', '') ~ '^\d{4}-\d{2}-\d{2}$'
    union select unnest(coalesce(p_weeks, array[w.week_start]))
  ) s;

  foreach v_week in array v_weeks loop
    v_pid := case when v_week = w.week_start then p_plan else null end;
    -- indicazioni alimentari gia' date sugli impegni di questa settimana
    select coalesce(jsonb_object_agg(to_char(e.start_at, 'YYYYMMDDHH24MI') || '|' || lower(e.title), e.nutrition), '{}'::jsonb)
      into v_keep
      from crm_events e join crm_week_plans p on p.id = e.week_plan_id
     where p.player_id = w.player_id and p.week_start = v_week and e.nutrition is not null;
    perform set_config('auvi.week_resave', '1', true);
    for v_old in select id from crm_week_plans
        where player_id = w.player_id and week_start = v_week and id <> coalesce(v_pid, '00000000-0000-0000-0000-000000000000'::uuid)
        order by (status = 'confermato') desc, created_at desc loop
      if exists (select 1 from crm_week_plans where id = v_old and status = 'confermato') then v_first := false; end if;
      delete from crm_events where week_plan_id = v_old;
      delete from crm_week_plans where id = v_old;
    end loop;
    if v_pid is null then
      insert into crm_week_plans (player_id, week_start, file_path, file_name, created_by)
      values (w.player_id, v_week, w.file_path, w.file_name, auth.uid()) returning id into v_pid;
    else
      if w.status = 'confermato' then v_first := false; end if;
      delete from crm_events where week_plan_id = v_pid;
    end if;
    perform set_config('auvi.week_resave', '', true);

    for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
      if coalesce(it->>'date', '') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(it->>'start', '') !~ '^\d{1,2}:\d{2}$' then continue; end if;
      if date_trunc('week', (it->>'date')::date)::date <> v_week then continue; end if;
      v_start := ((it->>'date') || ' ' || (it->>'start'))::timestamp at time zone v_tz;
      v_end := case when coalesce(it->>'end', '') ~ '^\d{1,2}:\d{2}$'
                    then ((it->>'date') || ' ' || (it->>'end'))::timestamp at time zone v_tz end;
      if v_end is not null and v_end <= v_start then v_end := null; end if;
      v_title := coalesce(nullif(trim(it->>'title'), ''), 'Allenamento');
      insert into crm_events (player_id, title, type, start_at, end_at, location, notes, created_by, visibility, week_plan_id, nutrition)
      values (w.player_id, v_title,
              case when it->>'type' in ('allenamento','partita','viaggio','medico','personale','visita','nutrizione','call') then it->>'type' else 'allenamento' end,
              v_start, v_end, nullif(trim(coalesce(it->>'location', '')), ''), nullif(trim(coalesce(it->>'notes', '')), ''),
              auth.uid(), 'team', v_pid, v_keep -> (to_char(v_start, 'YYYYMMDDHH24MI') || '|' || lower(v_title)));
      n := n + 1;
    end loop;
    update crm_week_plans set status = 'confermato', confirmed_at = now() where id = v_pid;
    nw := nw + 1;
  end loop;

  perform crm_notify_team(w.player_id,
    coalesce(v_name, 'L''atleta') || case when v_first then ' ha caricato il programma' else ' ha aggiornato il programma' end
      || case when nw > 1 then ' (' || nw || ' settimane)' else ' della settimana' end,
    'Dal ' || to_char(v_weeks[1], 'DD/MM') || ' · ' || n || ' impegni', 'agenda', auth.uid());
  return jsonb_build_object('events', n, 'weeks', nw);
end $$;
revoke execute on function public.crm_save_week_plans(uuid, jsonb, date[]) from public, anon;
grant execute on function public.crm_save_week_plans(uuid, jsonb, date[]) to authenticated;
