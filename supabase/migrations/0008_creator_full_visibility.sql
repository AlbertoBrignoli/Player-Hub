-- Richiesta: i creator vedono tutto (si riaprono le letture a ogni utente
-- autenticato, che è comunque gated dalla whitelist). Le SCRITTURE business
-- restano admin-only. + accesso del giocatore.

drop policy if exists p_contracts_read on public.crm_contracts;
create policy p_contracts_read on public.crm_contracts for select to authenticated using (true);
drop policy if exists p_documents_read on public.crm_documents;
create policy p_documents_read on public.crm_documents for select to authenticated using (true);
drop policy if exists p_documents_insert on public.crm_documents;
create policy p_documents_insert on public.crm_documents for insert to authenticated
  with check (auth.uid() is not null);
drop policy if exists p_payments_read on public.crm_payments;
create policy p_payments_read on public.crm_payments for select to authenticated using (true);
drop policy if exists p_sponsors_read on public.crm_sponsors;
create policy p_sponsors_read on public.crm_sponsors for select to authenticated using (true);
drop policy if exists p_events_read on public.crm_events;
create policy p_events_read on public.crm_events for select to authenticated using (true);
drop policy if exists p_tasks_read on public.crm_tasks;
create policy p_tasks_read on public.crm_tasks for select to authenticated using (true);
drop policy if exists p_messages_read on public.crm_messages;
create policy p_messages_read on public.crm_messages for select to authenticated using (true);
drop policy if exists p_messages_insert on public.crm_messages;
create policy p_messages_insert on public.crm_messages for insert to authenticated
  with check (sender_id = auth.uid());

drop policy if exists p_crmdoc_read on storage.objects;
create policy p_crmdoc_read on storage.objects for select to authenticated
  using (bucket_id = 'crm-documents');
drop policy if exists p_crmdoc_insert on storage.objects;
create policy p_crmdoc_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'crm-documents');
drop policy if exists p_crmdoc_update on storage.objects;
create policy p_crmdoc_update on storage.objects for update to authenticated
  using (bucket_id = 'crm-documents');

-- Accesso del giocatore
insert into public.crm_allowed_emails (email, role, note)
values ('lorenzopirola6@gmail.com', 'player', 'Lorenzo Pirola · Giocatore')
on conflict (email) do update set role = excluded.role, note = excluded.note;
