-- Bucket privato per i documenti del CRM + policy di accesso.

insert into storage.buckets (id, name, public)
values ('crm-documents', 'crm-documents', false)
on conflict (id) do nothing;

drop policy if exists p_crmdoc_read on storage.objects;
create policy p_crmdoc_read on storage.objects for select to authenticated
  using (bucket_id = 'crm-documents');

drop policy if exists p_crmdoc_insert on storage.objects;
create policy p_crmdoc_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'crm-documents');

drop policy if exists p_crmdoc_update on storage.objects;
create policy p_crmdoc_update on storage.objects for update to authenticated
  using (bucket_id = 'crm-documents');

drop policy if exists p_crmdoc_delete on storage.objects;
create policy p_crmdoc_delete on storage.objects for delete to authenticated
  using (bucket_id = 'crm-documents' and public.crm_is_admin());
