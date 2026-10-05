-- Accesso partner dei Servizi AUVI (05/10/2026)
-- Un partner (es. Scouting Department) entra con un ruolo dedicato 'partner' e lavora nella sua
-- area: vede SOLO le richieste dei propri servizi, risponde all'atleta con messaggi e file
-- (report, video), aggiorna lo stato. Vede i dati di gioco (partite, statistiche, carriera)
-- solo degli atleti che hanno chiesto il suo servizio. Mai documenti, contratti, media, chat.
-- Attivazione: AUVI mette l'email in crm_allowed_emails (role 'partner') e in
-- crm_services.partner_email; al primo accesso il servizio si collega da solo all'account.

-- 0) nuovo ruolo ammesso
alter table public.crm_profiles drop constraint if exists crm_profiles_role_check;
alter table public.crm_profiles add constraint crm_profiles_role_check check (role = any (array[
  'admin','player','creator','brand','preparatore','agente','assicuratore','commercialista','fisioterapista','partner']));
alter table public.crm_allowed_emails drop constraint if exists crm_allowed_emails_role_check;
alter table public.crm_allowed_emails add constraint crm_allowed_emails_role_check check (role = any (array[
  'admin','player','creator','brand','preparatore','agente','assicuratore','commercialista','fisioterapista','partner']));
alter table public.crm_user_roles drop constraint if exists crm_user_roles_role_check;
alter table public.crm_user_roles add constraint crm_user_roles_role_check check (role = any (array[
  'admin','player','creator','brand','preparatore','agente','assicuratore','commercialista','fisioterapista','partner']));
alter table public.crm_notifications drop constraint if exists crm_notifications_recipient_role_check;
alter table public.crm_notifications add constraint crm_notifications_recipient_role_check check (recipient_role = any (array[
  'admin','player','creator','team','preparatore','brand','agente','assicuratore','commercialista','fisioterapista','partner']));

-- 1) il ruolo partner non entra nelle aree "tutti tranne i brand"
drop policy if exists p_cp_config_read on public.cp_config;
create policy p_cp_config_read on public.cp_config for select to authenticated
  using (crm_my_role() not in ('brand','partner'));
drop policy if exists p_crmmedia_read on storage.objects;
create policy p_crmmedia_read on storage.objects for select to authenticated using (
  bucket_id = 'crm-media' and (crm_my_role() not in ('brand','partner') or (storage.foldername(name))[1] = 'editorial'));
drop policy if exists p_crmdoc_read on storage.objects;
create policy p_crmdoc_read on storage.objects for select to authenticated
  using (bucket_id = 'crm-documents' and crm_my_role() not in ('brand','partner'));
drop policy if exists p_crmdoc_insert on storage.objects;
create policy p_crmdoc_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'crm-documents' and coalesce(crm_my_role(), 'brand') not in ('brand','partner'));

-- 2) chi e' il partner di una richiesta / di un atleta
create or replace function public.crm_is_request_partner(p_req uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select current_crm_role() = 'partner' and exists (
    select 1 from crm_service_requests r join crm_services s on s.id = r.service_id
    where r.id = p_req and (s.partner_user_id = auth.uid()
      or lower(s.partner_email) = lower((select email from crm_profiles where id = auth.uid()))));
$$;
create or replace function public.crm_partner_sees(p_api bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select current_crm_role() = 'partner' and exists (
    select 1 from crm_service_requests r join crm_services s on s.id = r.service_id
    where r.player_id = p_api and r.status <> 'annullata' and (s.partner_user_id = auth.uid()
      or lower(s.partner_email) = lower((select email from crm_profiles where id = auth.uid()))));
$$;
-- chi vede una richiesta (atleta, AUVI, procuratore via crm_manages_player, partner)
create or replace function public.crm_request_visible(p_req uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from crm_service_requests r where r.id = p_req and crm_manages_player(r.player_id))
      or crm_is_request_partner(p_req);
$$;
revoke execute on function public.crm_is_request_partner(uuid), public.crm_partner_sees(bigint), public.crm_request_visible(uuid) from public, anon;
grant execute on function public.crm_is_request_partner(uuid), public.crm_partner_sees(bigint), public.crm_request_visible(uuid) to authenticated;

-- 3) richieste: il partner aggiorna solo stato e messaggio all'atleta delle proprie
drop policy if exists p_service_req_partner on public.crm_service_requests;
create policy p_service_req_partner on public.crm_service_requests for select to authenticated
  using (crm_is_request_partner(id));
drop policy if exists p_service_req_partner_upd on public.crm_service_requests;
create policy p_service_req_partner_upd on public.crm_service_requests for update to authenticated
  using (crm_is_request_partner(id)) with check (crm_is_request_partner(id));
create or replace function public.crm_service_req_partner_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_crm_role() = 'partner' then
    if (new.player_id, new.service_id, new.service_title, new.message, new.answers, new.created_by, new.player_name)
       is distinct from (old.player_id, old.service_id, old.service_title, old.message, old.answers, old.created_by, old.player_name) then
      raise exception 'Il partner può aggiornare solo stato e messaggio della richiesta';
    end if;
    new.handled_by := auth.uid();
  end if;
  return new;
end $$;
drop trigger if exists trg_service_req_partner_guard on public.crm_service_requests;
create trigger trg_service_req_partner_guard before update on public.crm_service_requests
  for each row execute function public.crm_service_req_partner_guard();

-- 4) thread di lavoro sulla richiesta: messaggi e file tra atleta, AUVI e partner
create table if not exists public.crm_service_request_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.crm_service_requests(id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_role text,
  author_name text,
  body text,
  file_path text,
  file_name text,
  created_at timestamptz not null default now(),
  check (coalesce(length(trim(body)), 0) > 0 or file_path is not null)
);
create index if not exists idx_srm_req on public.crm_service_request_messages (request_id, created_at);
alter table public.crm_service_request_messages enable row level security;
drop policy if exists p_srm_read on public.crm_service_request_messages;
create policy p_srm_read on public.crm_service_request_messages for select to authenticated
  using (crm_request_visible(request_id));
drop policy if exists p_srm_ins on public.crm_service_request_messages;
create policy p_srm_ins on public.crm_service_request_messages for insert to authenticated
  with check (author_id = auth.uid() and crm_request_visible(request_id));
drop policy if exists p_srm_del on public.crm_service_request_messages;
create policy p_srm_del on public.crm_service_request_messages for delete to authenticated
  using (author_id = auth.uid());
revoke all on public.crm_service_request_messages from anon;

create or replace function public.crm_srm_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record; v_role text; v_partner_role text; v_partner uuid; v_who text; v_route text;
begin
  select * into r from crm_service_requests where id = new.request_id;
  select role into v_role from crm_profiles where id = new.author_id;
  select partner_user_id, coalesce(partner_role, 'partner') into v_partner, v_partner_role
    from crm_services where id = r.service_id;
  new.author_role := v_role;
  if v_role = 'partner' then
    v_who := coalesce((select partner_name from crm_services where id = r.service_id), 'Partner');
  else
    v_who := coalesce((select full_name from crm_profiles where id = new.author_id), initcap(coalesce(v_role, '')));
  end if;
  new.author_name := v_who;
  v_route := 'services?req=' || r.id;
  -- all'atleta (se non e' lui a scrivere)
  if v_role <> 'player' then
    insert into crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('player', v_who || ' · ' || coalesce(r.service_title, 'servizio'),
            coalesce(left(new.body, 140), 'Nuovo file: ' || new.file_name), v_route, r.player_id, new.author_id);
  end if;
  -- ad AUVI (sempre, tranne quando scrive AUVI)
  if v_role not in ('admin','creator') then
    insert into crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('admin', v_who || ' · ' || coalesce(r.service_title, 'servizio'),
            coalesce(left(new.body, 140), 'Nuovo file: ' || new.file_name), v_route, r.player_id, new.author_id);
  end if;
  -- al partner (se non e' lui a scrivere)
  if v_role <> 'partner' and v_partner is not null then
    insert into crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('partner', 'Messaggio da ' || coalesce(r.player_name, 'atleta'),
            coalesce(left(new.body, 140), 'Nuovo file: ' || new.file_name), 'partner-home?req=' || r.id, r.player_id, new.author_id);
  end if;
  return new;
end $$;
drop trigger if exists trg_srm_notify on public.crm_service_request_messages;
create trigger trg_srm_notify before insert on public.crm_service_request_messages
  for each row execute function public.crm_srm_notify();
revoke execute on function public.crm_srm_notify() from public, anon, authenticated;

-- nuova richiesta e cambi stato: il partner riceve con il link alla richiesta
create or replace function public.crm_service_req_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_atleta text; v_partner uuid;
begin
  select name into v_atleta from public.player where api_player_id = new.player_id;
  select partner_user_id into v_partner from public.crm_services where id = new.service_id;

  if tg_op = 'INSERT' then
    insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('admin', 'Richiesta servizio: ' || coalesce(new.service_title, 'servizio'),
            coalesce(v_atleta, 'Atleta') || coalesce(' · ' || new.message, ''),
            'services?req=' || new.id, new.player_id, auth.uid());
    if v_partner is not null then
      insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
      values ('partner', 'Nuova richiesta da ' || coalesce(v_atleta, 'un atleta'),
              coalesce(new.service_title, 'servizio') || ' · questionario compilato',
              'partner-home?req=' || new.id, new.player_id, auth.uid());
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('player',
            case new.status
              when 'in_carico' then 'Richiesta presa in carico: '
              when 'completata' then 'Richiesta completata: '
              when 'annullata' then 'Richiesta annullata: '
              else 'Aggiornamento: ' end || coalesce(new.service_title, 'servizio'),
            coalesce(new.internal_note, ''), 'services?req=' || new.id, new.player_id, auth.uid());
    if current_crm_role() = 'partner' then
      insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
      values ('admin', 'Partner: ' || coalesce(new.service_title, 'servizio') || ' · ' ||
              case new.status when 'in_carico' then 'in lavorazione' when 'completata' then 'completata' else new.status end,
              coalesce(v_atleta, 'Atleta'), 'services?req=' || new.id, new.player_id, auth.uid());
    end if;
  end if;
  return new;
end $$;

-- notifiche: il partner vede solo quelle delle proprie richieste
drop policy if exists p_notif_select on public.crm_notifications;
create policy p_notif_select on public.crm_notifications for select to authenticated using (
  (current_crm_role() = any (array['admin','creator']))
  or ((recipient_role = 'player') and (player_id = current_player_api_id()))
  or ((recipient_role = 'preparatore') and (current_crm_role() = 'preparatore') and fitness_can_manage(player_id))
  or ((current_crm_role() = 'agente') and crm_agent_sees(player_id))
  or ((recipient_role = 'assicuratore') and (current_crm_role() = 'assicuratore') and crm_insurer_sees(player_id))
  or ((recipient_role = 'commercialista') and (current_crm_role() = 'commercialista') and crm_tax_sees(player_id))
  or ((recipient_role = 'brand') and crm_brand_sees(player_id))
  or ((recipient_role = 'partner') and route like 'partner-home?req=%'
      and (case when route ~ 'req=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
           then crm_is_request_partner(substring(route from 'req=([0-9a-f-]{36})')::uuid) else false end))
);

-- 5) dati di gioco degli atleti che hanno chiesto il servizio (solo lettura)
drop policy if exists p_partner_read on public.player;
create policy p_partner_read on public.player for select to authenticated using (crm_partner_sees(api_player_id));
drop policy if exists p_partner_read on public.matches;
create policy p_partner_read on public.matches for select to authenticated using (crm_partner_sees(player_id));
drop policy if exists p_partner_read on public.player_stats_api;
create policy p_partner_read on public.player_stats_api for select to authenticated using (crm_partner_sees(player_id));
drop policy if exists p_partner_read on public.player_api_extra;
create policy p_partner_read on public.player_api_extra for select to authenticated using (crm_partner_sees(player_id));

-- 6) file della richiesta (report, video): bucket privato, cartella = id richiesta
insert into storage.buckets (id, name, public) values ('service-files', 'service-files', false)
  on conflict (id) do nothing;
drop policy if exists p_svcfiles_read on storage.objects;
create policy p_svcfiles_read on storage.objects for select to authenticated using (
  bucket_id = 'service-files' and (case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       then crm_request_visible(((storage.foldername(name))[1])::uuid) else false end));
drop policy if exists p_svcfiles_insert on storage.objects;
create policy p_svcfiles_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'service-files' and (case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       then crm_request_visible(((storage.foldername(name))[1])::uuid) else false end));
drop policy if exists p_svcfiles_delete on storage.objects;
create policy p_svcfiles_delete on storage.objects for delete to authenticated using (
  bucket_id = 'service-files' and owner_id = auth.uid()::text);

-- 7) al primo accesso del partner il servizio si collega al suo account
create or replace function public.crm_link_partner_services()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'partner' then
    update crm_services set partner_user_id = new.id, partner_role = 'partner'
    where lower(partner_email) = lower(new.email) and partner_user_id is null;
    insert into crm_user_roles (user_id, role, label) values (new.id, 'partner', 'Partner servizi')
      on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists trg_link_partner_services on public.crm_profiles;
create trigger trg_link_partner_services after insert on public.crm_profiles
  for each row execute function public.crm_link_partner_services();
revoke execute on function public.crm_link_partner_services() from public, anon, authenticated;

-- 8) viste "pubbliche" (security definer) chiuse al partner; il feed operativo solo ad AUVI
--    (auvi_ops_feed mostrava i titoli del calendario editoriale di tutti gli atleti a chiunque
--    fosse loggato; serve solo ad AUVI)
create or replace view public.auvi_ops_feed as
  select id,
    coalesce(nullif(btrim(title), ''), nullif(btrim(theme), ''), 'Contenuto') as titolo,
    entry_date as data, null::text as ora, null::text as canale, type as tipo, status as stato
  from crm_editorial
  where entry_date is not null and entry_date >= (current_date - interval '60 days')
    and crm_my_role() in ('admin','creator');
create or replace view public.cp_preferences_public as
  select player_id, identity, categories_liked, categories_excluded, availability, territories,
         onboarding_completed, updated_at
  from cp_profiles
  where coalesce(crm_my_role(), '') <> 'partner';
create or replace view public.cp_roster_public as
  select api_player_id, name, photo_url, age, "position", team_name
  from player
  where api_player_id is not null and coalesce(crm_my_role(), '') <> 'partner';

-- le immagini del calendario editoriale restano visibili ai brand, non ai partner
drop policy if exists p_crmmedia_read on storage.objects;
create policy p_crmmedia_read on storage.objects for select to authenticated using (
  bucket_id = 'crm-media' and crm_my_role() <> 'partner'
  and (crm_my_role() <> 'brand' or (storage.foldername(name))[1] = 'editorial'));

-- accesso partner Scouting Department (email scelta da AUVI) e copertina AUVI Performance
insert into public.crm_allowed_emails (email, role, note) values ('info@scoutingdepartment.com', 'partner', 'Scouting Department')
  on conflict (email) do update set role = 'partner', note = 'Scouting Department';
update public.crm_services set partner_email = 'info@scoutingdepartment.com' where partner_name = 'Scouting Department';
update public.crm_services set cover_url = '/servizi/auvi-performance.jpg' where title = 'AUVI Performance' and partner_name = 'AUVI Performance';
