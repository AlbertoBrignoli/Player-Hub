-- Ruolo "creator" (team grafiche): accede solo a Calendario Editoriale e Media.
-- Gli advisor restano 'admin', il giocatore 'player'.

-- 1) Constraint ruoli
alter table public.crm_profiles drop constraint if exists crm_profiles_role_check;
alter table public.crm_profiles add constraint crm_profiles_role_check
  check (role in ('admin', 'player', 'creator'));
alter table public.crm_allowed_emails drop constraint if exists crm_allowed_emails_role_check;
alter table public.crm_allowed_emails add constraint crm_allowed_emails_role_check
  check (role in ('admin', 'player', 'creator'));

-- 2) Notifiche: nuovo destinatario 'team' = admin + creator
alter table public.crm_notifications drop constraint if exists crm_notifications_recipient_role_check;
alter table public.crm_notifications add constraint crm_notifications_recipient_role_check
  check (recipient_role in ('admin', 'player', 'creator', 'team'));

-- 3) Helper: ruolo dell'utente corrente (INVOKER, legge il proprio profilo)
create or replace function public.crm_my_role()
returns text language sql stable security invoker set search_path = public as $$
  select role from public.crm_profiles where id = auth.uid();
$$;
revoke execute on function public.crm_my_role() from anon;

-- 4) Aree business: visibili solo ad admin e player (il creator non le vede)
drop policy if exists p_contracts_read on public.crm_contracts;
create policy p_contracts_read on public.crm_contracts for select to authenticated
  using (public.crm_my_role() in ('admin', 'player'));
drop policy if exists p_documents_read on public.crm_documents;
create policy p_documents_read on public.crm_documents for select to authenticated
  using (public.crm_my_role() in ('admin', 'player'));
drop policy if exists p_documents_insert on public.crm_documents;
create policy p_documents_insert on public.crm_documents for insert to authenticated
  with check (public.crm_my_role() in ('admin', 'player'));
drop policy if exists p_payments_read on public.crm_payments;
create policy p_payments_read on public.crm_payments for select to authenticated
  using (public.crm_my_role() in ('admin', 'player'));
drop policy if exists p_sponsors_read on public.crm_sponsors;
create policy p_sponsors_read on public.crm_sponsors for select to authenticated
  using (public.crm_my_role() in ('admin', 'player'));
drop policy if exists p_events_read on public.crm_events;
create policy p_events_read on public.crm_events for select to authenticated
  using (public.crm_my_role() in ('admin', 'player'));
drop policy if exists p_tasks_read on public.crm_tasks;
create policy p_tasks_read on public.crm_tasks for select to authenticated
  using (public.crm_my_role() in ('admin', 'player'));
drop policy if exists p_messages_read on public.crm_messages;
create policy p_messages_read on public.crm_messages for select to authenticated
  using (public.crm_my_role() in ('admin', 'player'));
drop policy if exists p_messages_insert on public.crm_messages;
create policy p_messages_insert on public.crm_messages for insert to authenticated
  with check (sender_id = auth.uid() and public.crm_my_role() in ('admin', 'player'));

-- Storage documenti: fuori dalla portata del creator
drop policy if exists p_crmdoc_read on storage.objects;
create policy p_crmdoc_read on storage.objects for select to authenticated
  using (bucket_id = 'crm-documents' and public.crm_my_role() in ('admin', 'player'));
drop policy if exists p_crmdoc_insert on storage.objects;
create policy p_crmdoc_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'crm-documents' and public.crm_my_role() in ('admin', 'player'));
drop policy if exists p_crmdoc_update on storage.objects;
create policy p_crmdoc_update on storage.objects for update to authenticated
  using (bucket_id = 'crm-documents' and public.crm_my_role() in ('admin', 'player'));

-- 5) Notifiche: match sul ruolo; 'team' raggiunge admin e creator
drop policy if exists p_notif_select on public.crm_notifications;
create policy p_notif_select on public.crm_notifications for select to authenticated
  using (
    recipient_role = public.crm_my_role()
    or (recipient_role = 'team' and public.crm_my_role() in ('admin', 'creator'))
  );
drop policy if exists p_notif_update on public.crm_notifications;
create policy p_notif_update on public.crm_notifications for update to authenticated
  using (
    recipient_role = public.crm_my_role()
    or (recipient_role = 'team' and public.crm_my_role() in ('admin', 'creator'))
  );

-- 6) Accessi
insert into public.crm_allowed_emails (email, role, note) values
  ('mulopolydie@gmail.com', 'creator', 'Lydie · Team grafiche'),
  ('labellarteeleonora@gmail.com', 'creator', 'Eleonora · Team grafiche'),
  ('m.pelizzi@auviagency.com', 'admin', 'Matteo · AUVI Advisor')
on conflict (email) do update set role = excluded.role, note = excluded.note;
update public.crm_allowed_emails set note = 'Alberto · AUVI Advisor'
  where email = 'a.brignoli@auviagency.com';
