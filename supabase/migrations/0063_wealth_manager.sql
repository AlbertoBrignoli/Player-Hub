-- Wealth manager (28/10/2026) — Delian & Co.
-- Nuovo professionista del team dell'atleta, sul modello del commercialista:
--  * quadro del patrimonio (crm_wealth_overview): patrimonio seguito, ripartizione, profilo di rischio,
--    obiettivi, prossimo incontro;
--  * voci (crm_wealth_items): task e richieste di documenti all'atleta, scadenze, documenti e report;
--    le scadenze finiscono in agenda e arrivano le notifiche, come per il commercialista;
--  * chat dedicata (canale 'wealth'), profilo e home "ufficio" come gli altri professionisti.
-- Dati riservati: li vedono solo l'atleta, AUVI (admin) e il wealth manager collegato
-- (non procuratore, staff o creator).

-- ruolo
alter table public.crm_profiles drop constraint if exists crm_profiles_role_check;
alter table public.crm_profiles add constraint crm_profiles_role_check check (role = any (array['admin','player','creator','brand','preparatore','agente','assicuratore','commercialista','fisioterapista','nutrizionista','partner','wealth']));
alter table public.crm_allowed_emails drop constraint if exists crm_allowed_emails_role_check;
alter table public.crm_allowed_emails add constraint crm_allowed_emails_role_check check (role = any (array['admin','player','creator','brand','preparatore','agente','assicuratore','commercialista','fisioterapista','nutrizionista','partner','wealth']));
alter table public.crm_user_roles drop constraint if exists crm_user_roles_role_check;
alter table public.crm_user_roles add constraint crm_user_roles_role_check check (role = any (array['admin','player','creator','brand','preparatore','agente','assicuratore','commercialista','fisioterapista','nutrizionista','partner','wealth']));
alter table public.crm_notifications drop constraint if exists crm_notifications_recipient_role_check;
alter table public.crm_notifications add constraint crm_notifications_recipient_role_check check (recipient_role = any (array['admin','player','creator','team','preparatore','brand','agente','assicuratore','commercialista','fisioterapista','nutrizionista','partner','wealth']));

-- atleti seguiti (advisor_id senza FK su auth: AUVI può preparare il profilo prima che entri,
-- come per i procuratori; alla registrazione passa al suo account con "pending_wealth_id")
create table if not exists public.crm_wealth_athletes (
  advisor_id uuid not null,
  player_id bigint not null references public.player(api_player_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (advisor_id, player_id)
);
alter table public.crm_wealth_athletes enable row level security;
create policy p_wealth_athletes_admin on public.crm_wealth_athletes for all to authenticated
  using (current_crm_role() = 'admin') with check (current_crm_role() = 'admin');
create policy p_wealth_athletes_read on public.crm_wealth_athletes for select to authenticated
  using (current_crm_role() = 'admin' or advisor_id = auth.uid() or player_id = current_player_api_id());

create table if not exists public.crm_wealth_profile (
  advisor_id uuid primary key,
  name text, title text, photo_url text, email text, phone text, whatsapp text, licence text,
  agency_name text, agency_website text, agency_email text, agency_phone text, agency_address text,
  agency_logo_url text, instagram_url text, notes text,
  updated_at timestamptz not null default now()
);
alter table public.crm_wealth_profile enable row level security;
create policy p_wealth_profile_admin on public.crm_wealth_profile for all to authenticated
  using (current_crm_role() = 'admin') with check (current_crm_role() = 'admin');
create policy p_wealth_profile_own on public.crm_wealth_profile for all to authenticated
  using (advisor_id = auth.uid()) with check (advisor_id = auth.uid());
create policy p_wealth_profile_read on public.crm_wealth_profile for select to authenticated
  using (current_crm_role() in ('admin', 'creator') or advisor_id = auth.uid()
         or exists (select 1 from public.crm_wealth_athletes w
                     where w.advisor_id = crm_wealth_profile.advisor_id and w.player_id = current_player_api_id()));

create or replace function public.crm_wealth_sees(p_api bigint)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select current_crm_role() = 'wealth'
     and exists (select 1 from public.crm_wealth_athletes w where w.advisor_id = auth.uid() and w.player_id = p_api);
$$;

-- chi può leggere i dati patrimoniali di un atleta
create or replace function public.crm_wealth_access(p_api bigint)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce(current_crm_role() = 'admin'
      or (current_crm_role() = 'player' and p_api = current_player_api_id())
      or public.crm_wealth_sees(p_api), false);
$$;

-- quadro del patrimonio: una scheda per atleta, la compila il wealth manager (o AUVI)
create table if not exists public.crm_wealth_overview (
  player_id bigint primary key references public.player(api_player_id) on delete cascade,
  total_assets numeric, liquidity numeric, invested numeric, real_estate numeric, other_assets numeric,
  currency text not null default 'EUR',
  risk_profile text, horizon text, goals text, next_meeting date, notes text,
  updated_by uuid, updated_at timestamptz not null default now()
);
alter table public.crm_wealth_overview enable row level security;
create policy p_wealth_overview_read on public.crm_wealth_overview for select to authenticated
  using (crm_wealth_access(player_id));
create policy p_wealth_overview_write on public.crm_wealth_overview for all to authenticated
  using (current_crm_role() = 'admin' or crm_wealth_sees(player_id))
  with check (current_crm_role() = 'admin' or crm_wealth_sees(player_id));

-- voci: task / richiesta (all'atleta), scadenza, report, documento
create table if not exists public.crm_wealth_items (
  id uuid primary key default gen_random_uuid(),
  player_id bigint not null references public.player(api_player_id) on delete cascade,
  kind text not null check (kind in ('task', 'richiesta', 'scadenza', 'report', 'documento')),
  category text, title text not null, description text,
  amount numeric, due_date date, period text,
  status text not null default 'aperto' check (status in ('aperto', 'completato')),
  attachments jsonb not null default '[]', response_attachments jsonb not null default '[]', response_note text,
  created_by uuid default auth.uid(), completed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists crm_wealth_items_player_idx on public.crm_wealth_items (player_id, due_date);
alter table public.crm_wealth_items enable row level security;
create policy p_wealth_items_read on public.crm_wealth_items for select to authenticated
  using (crm_wealth_access(player_id));
create policy p_wealth_items_manage on public.crm_wealth_items for all to authenticated
  using (current_crm_role() = 'admin' or crm_wealth_sees(player_id))
  with check (current_crm_role() = 'admin' or crm_wealth_sees(player_id));
-- l'atleta risponde (allegati, nota, completato) ma non crea né cancella voci
create policy p_wealth_items_player on public.crm_wealth_items for update to authenticated
  using (current_crm_role() = 'player' and player_id = current_player_api_id())
  with check (current_crm_role() = 'player' and player_id = current_player_api_id());

create table if not exists public.crm_wealth_reminders (
  item_id uuid not null references public.crm_wealth_items(id) on delete cascade,
  days_before int not null,
  sent_at timestamptz not null default now(),
  primary key (item_id, days_before)
);
alter table public.crm_wealth_reminders enable row level security;
create policy p_wealth_rem_admin on public.crm_wealth_reminders for all to authenticated
  using (current_crm_role() = 'admin') with check (current_crm_role() = 'admin');

-- file: wealth-docs/<player_id>/<file>
insert into storage.buckets (id, name, public, file_size_limit)
values ('wealth-docs', 'wealth-docs', false, 52428800) on conflict (id) do nothing;
create or replace function public.crm_wealth_path_ok(p_name text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9]+$'
              then crm_wealth_access(split_part(p_name, '/', 1)::bigint) else false end;
$$;
create policy p_wealthdoc_read on storage.objects for select using (bucket_id = 'wealth-docs' and public.crm_wealth_path_ok(name));
create policy p_wealthdoc_write on storage.objects for insert with check (bucket_id = 'wealth-docs' and public.crm_wealth_path_ok(name));

-- scadenze e task con data in agenda; notifiche all'atleta e al wealth manager
create or replace function public.crm_wealth_to_agenda()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  delete from public.crm_events
   where player_id = new.player_id and type = 'scadenza' and notes = 'patrimonio:' || new.id::text;
  if new.due_date is not null and new.status = 'aperto' and new.kind in ('task', 'richiesta', 'scadenza') then
    insert into public.crm_events (title, type, start_at, notes, player_id, created_by)
    values (case new.kind when 'scadenza' then 'Scadenza · ' else 'Da fare · ' end || new.title,
            'scadenza', (new.due_date::timestamp + time '09:00') at time zone 'Europe/Rome',
            'patrimonio:' || new.id::text, new.player_id, null);
  end if;
  return new;
end $$;

create or replace function public.crm_wealth_agenda_cleanup()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  delete from public.crm_events where type = 'scadenza' and notes = 'patrimonio:' || old.id::text;
  return old;
end $$;

create or replace function public.crm_wealth_notify()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_t text;
begin
  if tg_op = 'INSERT' then
    if current_crm_role() = 'player' then return new; end if;
    v_t := case new.kind
             when 'task' then 'Da fare: '
             when 'richiesta' then 'Documento richiesto: '
             when 'scadenza' then 'Scadenza: '
             when 'report' then 'Nuovo report: '
             else 'Nuovo documento: ' end;
    insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('player', v_t || new.title,
            coalesce('entro il ' || to_char(new.due_date, 'DD/MM/YYYY'), coalesce(new.period, 'Wealth manager')),
            'wealth', new.player_id, auth.uid());
    return new;
  end if;
  if new.status is distinct from old.status and new.status = 'completato' then
    insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('wealth', 'Completato: ' || new.title, coalesce(new.response_note, ''), 'wealth', new.player_id, auth.uid());
  end if;
  return new;
end $$;

create trigger trg_wealth_agenda after insert or update of due_date, title, status on public.crm_wealth_items
  for each row execute function crm_wealth_to_agenda();
create trigger trg_wealth_agenda_del after delete on public.crm_wealth_items
  for each row execute function crm_wealth_agenda_cleanup();
create trigger trg_wealth_notify_ins after insert on public.crm_wealth_items
  for each row execute function crm_wealth_notify();
create trigger trg_wealth_notify_upd after update of status on public.crm_wealth_items
  for each row execute function crm_wealth_notify();

create or replace function public.crm_wealth_due_check()
returns void language plpgsql security definer set search_path to 'public' as $$
declare r record;
begin
  for r in
    select i.*, (i.due_date - current_date) as giorni from public.crm_wealth_items i
     where i.due_date is not null and i.status = 'aperto' and i.kind in ('task', 'richiesta', 'scadenza')
       and i.due_date >= current_date and (i.due_date - current_date) in (30, 7, 1)
  loop
    if not exists (select 1 from public.crm_wealth_reminders where item_id = r.id and days_before = r.giorni) then
      insert into public.crm_notifications (recipient_role, title, body, route, player_id)
      values ('player', case when r.kind = 'scadenza' then 'Scadenza tra ' else 'Da fare tra ' end || r.giorni || ' g',
              r.title, 'wealth', r.player_id);
      insert into public.crm_wealth_reminders (item_id, days_before) values (r.id, r.giorni);
    end if;
  end loop;
end $$;
select cron.schedule('wealth-due-check', '35 8 * * *', 'select public.crm_wealth_due_check()');

-- il wealth manager entra nel team dell'atleta (calendario, profilo atleta, partite)
create or replace function public.crm_team_sees(p_api bigint)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select crm_agent_sees(p_api) or crm_insurer_sees(p_api) or crm_tax_sees(p_api) or crm_physio_sees(p_api)
      or crm_nutri_sees(p_api) or crm_wealth_sees(p_api)
      or (current_crm_role() = 'preparatore' and fitness_can_manage(p_api));
$$;

-- policy e funzioni esistenti: si aggiunge 'wealth' accanto al commercialista
do $$
declare r record; d text;
begin
  -- player / matches: lettura del profilo atleta
  for r in select tablename, policyname, qual from pg_policies
            where schemaname = 'public' and tablename in ('player', 'matches') and policyname = 'rls_read_scoped' loop
    execute format('alter policy %I on public.%I using (%s or crm_wealth_sees(%s))', r.policyname, r.tablename, r.qual,
                   case when r.tablename = 'player' then 'api_player_id' else 'player_id' end);
  end loop;

  -- chat dedicata: canale 'wealth'
  select qual into d from pg_policies where tablename = 'crm_messages' and policyname = 'p_messages_read';
  execute format('alter policy p_messages_read on public.crm_messages using (%s or ((current_crm_role() = ''wealth'') and crm_wealth_sees(player_id) and (channel = ''wealth'')))', d);
  select with_check into d from pg_policies where tablename = 'crm_messages' and policyname = 'p_messages_insert';
  d := replace(d, '''nutrizionista''::text]', '''nutrizionista''::text, ''wealth''::text]');
  execute format('alter policy p_messages_insert on public.crm_messages with check (%s or ((sender_id = auth.uid()) and (current_crm_role() = ''wealth'') and crm_wealth_sees(player_id) and (channel = ''wealth'')))', d);

  -- notifiche: il wealth manager vede le sue
  select qual into d from pg_policies where tablename = 'crm_notifications' and policyname = 'p_notif_select';
  execute format('alter policy p_notif_select on public.crm_notifications using ((%s) or ((recipient_role = ''wealth'') and (current_crm_role() = ''wealth'') and crm_wealth_sees(player_id)))', d);
  select with_check into d from pg_policies where tablename = 'crm_notifications' and policyname = 'p_notif_insert';
  execute format('alter policy p_notif_insert on public.crm_notifications with check (%s or crm_wealth_sees(player_id))', d);

  -- logo / foto del profilo
  for r in select policyname, cmd, qual, with_check from pg_policies where policyname like 'p_agent_profiles_%' and cmd <> 'SELECT' loop
    if r.cmd = 'INSERT' then
      execute format('alter policy %I on storage.objects with check (%s)', r.policyname,
                     replace(r.with_check, '''nutrizionista''::text]', '''nutrizionista''::text, ''wealth''::text]'));
    else
      execute format('alter policy %I on storage.objects using (%s)', r.policyname,
                     replace(r.qual, '''nutrizionista''::text]', '''nutrizionista''::text, ''wealth''::text]'));
    end if;
  end loop;

  -- elenchi dei ruoli professionali nelle funzioni
  for r in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('crm_generate_code', 'crm_pro_create_invite', 'crm_request_access',
              'crm_event_request', 'crm_event_comment_notify', 'crm_event_confirmed', 'crm_event_reproposed', 'handle_new_crm_user') loop
    d := pg_get_functiondef(r.oid);
    d := replace(d, '''commercialista'',''fisioterapista'',''nutrizionista''', '''commercialista'',''fisioterapista'',''nutrizionista'',''wealth''');
    d := replace(d, '''fisioterapista'',''nutrizionista'',''agente''', '''fisioterapista'',''nutrizionista'',''agente'',''wealth''');
    execute d;
  end loop;
end $$;

create or replace function public.crm_link_pro(p_pro uuid, p_role text, p_player bigint)
returns void language plpgsql security definer set search_path to 'public' as $$
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
  elsif p_role = 'wealth' then
    insert into crm_wealth_athletes (advisor_id, player_id) values (p_pro, p_player) on conflict do nothing;
  else
    raise exception 'Ruolo professionale non valido: %', p_role;
  end if;
end $$;

create or replace function public.crm_pro_display_name(p_pro uuid, p_role text)
returns text language sql stable security definer set search_path to 'public' as $$
  select case p_role
    when 'assicuratore' then (select name from crm_insurer_profile where insurer_id = p_pro)
    when 'agente' then (select name from crm_agent_profile where agent_id = p_pro)
    when 'preparatore' then (select name from fitness_coach_profile where trainer_id = p_pro)
    when 'commercialista' then (select name from crm_tax_profile where advisor_id = p_pro)
    when 'fisioterapista' then (select name from crm_physio_profile where physio_id = p_pro)
    when 'nutrizionista' then (select name from crm_nutri_profile where nutri_id = p_pro)
    when 'wealth' then (select coalesce(name, agency_name) from crm_wealth_profile where advisor_id = p_pro)
  end;
$$;

create or replace function public.crm_direct_recipients(p_channel text, p_player bigint, p_sender uuid, p_sender_role text)
returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select x from (
    select id as x from crm_profiles where p_sender_role = 'player' and coalesce(p_channel, 'team') = 'team' and role = 'admin'
    union select agent_id from crm_agent_athletes where p_sender_role = 'player' and p_channel = 'agente' and player_id = p_player
    union select insurer_id from crm_insurer_athletes where p_sender_role = 'player' and p_channel = 'assicuratore' and player_id = p_player
    union select advisor_id from crm_tax_athletes where p_sender_role = 'player' and p_channel = 'commercialista' and player_id = p_player
    union select advisor_id from crm_wealth_athletes where p_sender_role = 'player' and p_channel = 'wealth' and player_id = p_player
    union select trainer_id from fitness_trainer_athletes where p_sender_role = 'player' and p_channel = 'fitness' and player_id = p_player
    union select physio_id from crm_physio_athletes where p_sender_role = 'player' and p_channel = 'fisioterapista' and player_id = p_player
    union select nutri_id from crm_nutri_athletes where p_sender_role = 'player' and p_channel = 'nutrizionista' and player_id = p_player
    union select owner_id from crm_brands where p_sender_role = 'player' and p_channel = 'brand:' || id::text
    union select id from crm_profiles where p_sender_role = 'agente' and coalesce(p_channel, 'team') = 'team' and role = 'admin'
  ) r where x is not null and x <> p_sender;
$$;

do $$
declare d text;
begin
  -- notifica dei messaggi sul canale 'wealth'
  d := pg_get_functiondef('public.crm_message_notify'::regproc);
  d := replace(d, E'  elsif new.channel = ''commercialista'' then\n',
    E'  elsif new.channel = ''wealth'' then\n'
    || E'    v_recipient := case when new.sender_role = ''wealth'' then ''player'' else ''wealth'' end;\n'
    || E'  elsif new.channel = ''commercialista'' then\n');
  execute d;

  -- avvisi al team: anche il wealth manager
  d := pg_get_functiondef('public.crm_notify_team'::regproc);
  d := replace(d, E'    union all select ''admin''\n',
    E'    union all select ''wealth'' where exists (select 1 from crm_wealth_athletes where player_id = p_player)\n'
    || E'    union all select ''admin''\n');
  execute d;

  -- calendario esterno (iCal): solo i suoi impegni, come il commercialista
  d := pg_get_functiondef('public.crm_calendar_feed_items'::regproc);
  d := replace(d, E'  elsif v_role = ''brand'' then\n',
    E'  elsif v_role = ''wealth'' then\n'
    || E'    select coalesce(array_agg(distinct a.player_id), ''{}'') into v_ids\n'
    || E'      from public.crm_wealth_athletes a where a.advisor_id = v_user;\n'
    || E'  elsif v_role = ''brand'' then\n');
  d := replace(d, E'when v_role in (''assicuratore'', ''commercialista'') then ''own''',
                  E'when v_role in (''assicuratore'', ''commercialista'', ''wealth'') then ''own''');
  execute d;

  -- registrazione: collegamenti e profilo del wealth manager (anche se preparato da AUVI)
  d := pg_get_functiondef('public.handle_new_crm_user'::regproc);
  d := replace(d, E'  if wl.role = ''preparatore'' then\n',
    E'  if wl.role = ''wealth'' then\n'
    || E'    if wl.profile_seed ? ''pending_wealth_id'' then\n'
    || E'      update public.crm_wealth_profile set advisor_id = new.id, email = coalesce(email, new.email)\n'
    || E'       where advisor_id = (wl.profile_seed->>''pending_wealth_id'')::uuid;\n'
    || E'      update public.crm_wealth_athletes set advisor_id = new.id\n'
    || E'       where advisor_id = (wl.profile_seed->>''pending_wealth_id'')::uuid;\n'
    || E'    end if;\n'
    || E'    if wl.player_api_id is not null then\n'
    || E'      insert into public.crm_wealth_athletes (advisor_id, player_id) values (new.id, wl.player_api_id) on conflict do nothing;\n'
    || E'    end if;\n'
    || E'    insert into public.crm_wealth_profile (advisor_id, name, email)\n'
    || E'    values (new.id, split_part(coalesce(wl.note,''''), '' · '', 1), new.email) on conflict (advisor_id) do nothing;\n'
    || E'  end if;\n\n'
    || E'  if wl.role = ''preparatore'' then\n');
  d := replace(d, E'''preparatore'',''fisioterapista'',''nutrizionista'')\n     and wl.player_api_id',
                  E'''preparatore'',''fisioterapista'',''nutrizionista'',''wealth'')\n     and wl.player_api_id');
  execute d;
end $$;
