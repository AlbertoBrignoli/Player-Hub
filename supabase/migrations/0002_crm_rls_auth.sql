-- RLS, ruoli, whitelist e trigger di provisioning profilo.

create or replace function public.crm_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.crm_profiles where id = auth.uid() and role = 'admin');
$$;

-- Provisioning profilo al primo login, gated dalla whitelist crm_allowed_emails
create or replace function public.handle_new_crm_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare wl record;
begin
  select * into wl from public.crm_allowed_emails where lower(email) = lower(new.email);
  if wl is null then
    raise exception 'Email non autorizzata all''accesso a questo CRM: %', new.email;
  end if;
  insert into public.crm_profiles (id, email, role, full_name)
  values (new.id, new.email, wl.role, coalesce(new.raw_user_meta_data->>'full_name', wl.note))
  on conflict (id) do update set role = excluded.role;
  return new;
end; $$;

drop trigger if exists on_auth_user_created_crm on auth.users;
create trigger on_auth_user_created_crm
  after insert on auth.users for each row execute function public.handle_new_crm_user();

alter table public.crm_profiles       enable row level security;
alter table public.crm_allowed_emails enable row level security;
alter table public.crm_contracts      enable row level security;
alter table public.crm_documents      enable row level security;
alter table public.crm_payments       enable row level security;
alter table public.crm_sponsors       enable row level security;
alter table public.crm_events         enable row level security;
alter table public.crm_tasks          enable row level security;
alter table public.crm_messages       enable row level security;

drop policy if exists p_profiles_select on public.crm_profiles;
create policy p_profiles_select on public.crm_profiles for select to authenticated using (id = auth.uid() or public.crm_is_admin());
drop policy if exists p_profiles_update_self on public.crm_profiles;
create policy p_profiles_update_self on public.crm_profiles for update to authenticated using (id = auth.uid() or public.crm_is_admin());

drop policy if exists p_allowed_admin on public.crm_allowed_emails;
create policy p_allowed_admin on public.crm_allowed_emails for all to authenticated using (public.crm_is_admin()) with check (public.crm_is_admin());

drop policy if exists p_contracts_read on public.crm_contracts;
create policy p_contracts_read on public.crm_contracts for select to authenticated using (true);
drop policy if exists p_contracts_admin on public.crm_contracts;
create policy p_contracts_admin on public.crm_contracts for all to authenticated using (public.crm_is_admin()) with check (public.crm_is_admin());

drop policy if exists p_documents_read on public.crm_documents;
create policy p_documents_read on public.crm_documents for select to authenticated using (true);
drop policy if exists p_documents_insert on public.crm_documents;
create policy p_documents_insert on public.crm_documents for insert to authenticated with check (auth.uid() is not null);
drop policy if exists p_documents_mutate on public.crm_documents;
create policy p_documents_mutate on public.crm_documents for update to authenticated using (public.crm_is_admin() or uploaded_by = auth.uid());
drop policy if exists p_documents_delete on public.crm_documents;
create policy p_documents_delete on public.crm_documents for delete to authenticated using (public.crm_is_admin() or uploaded_by = auth.uid());

drop policy if exists p_payments_read on public.crm_payments;
create policy p_payments_read on public.crm_payments for select to authenticated using (true);
drop policy if exists p_payments_admin on public.crm_payments;
create policy p_payments_admin on public.crm_payments for all to authenticated using (public.crm_is_admin()) with check (public.crm_is_admin());

drop policy if exists p_sponsors_read on public.crm_sponsors;
create policy p_sponsors_read on public.crm_sponsors for select to authenticated using (true);
drop policy if exists p_sponsors_admin on public.crm_sponsors;
create policy p_sponsors_admin on public.crm_sponsors for all to authenticated using (public.crm_is_admin()) with check (public.crm_is_admin());

drop policy if exists p_events_read on public.crm_events;
create policy p_events_read on public.crm_events for select to authenticated using (true);
drop policy if exists p_events_admin on public.crm_events;
create policy p_events_admin on public.crm_events for all to authenticated using (public.crm_is_admin()) with check (public.crm_is_admin());

drop policy if exists p_tasks_read on public.crm_tasks;
create policy p_tasks_read on public.crm_tasks for select to authenticated using (true);
drop policy if exists p_tasks_admin on public.crm_tasks;
create policy p_tasks_admin on public.crm_tasks for all to authenticated using (public.crm_is_admin()) with check (public.crm_is_admin());
drop policy if exists p_tasks_player_update on public.crm_tasks;
create policy p_tasks_player_update on public.crm_tasks for update to authenticated using (assignee = 'player') with check (assignee = 'player');

drop policy if exists p_messages_read on public.crm_messages;
create policy p_messages_read on public.crm_messages for select to authenticated using (true);
drop policy if exists p_messages_insert on public.crm_messages;
create policy p_messages_insert on public.crm_messages for insert to authenticated with check (sender_id = auth.uid());
drop policy if exists p_messages_delete on public.crm_messages;
create policy p_messages_delete on public.crm_messages for delete to authenticated using (public.crm_is_admin() or sender_id = auth.uid());

-- Lettura tabelle performance per gli utenti autenticati
alter table public.player           enable row level security;
alter table public.matches          enable row level security;
alter table public.news             enable row level security;
alter table public.player_stats_api enable row level security;
drop policy if exists p_player_read on public.player;
create policy p_player_read on public.player for select to authenticated using (true);
drop policy if exists p_matches_read on public.matches;
create policy p_matches_read on public.matches for select to authenticated using (true);
drop policy if exists p_news_read on public.news;
create policy p_news_read on public.news for select to authenticated using (true);
drop policy if exists p_stats_read on public.player_stats_api;
create policy p_stats_read on public.player_stats_api for select to authenticated using (true);

-- Seed admin AUVI (adatta l'email per ogni installazione)
insert into public.crm_allowed_emails (email, role, note)
values ('a.brignoli@auviagency.com', 'admin', 'AUVI Agency')
on conflict (email) do update set role = excluded.role;
