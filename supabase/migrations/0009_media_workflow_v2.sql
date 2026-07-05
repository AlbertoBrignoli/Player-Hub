-- Workflow media v2: Da approvare -> Da pubblicare -> Pubblicati.
-- Le grafiche delle box editoriali vivono in crm_media (editorial_id),
-- non piu' nel jsonb assets: una sola fonte di verita'.

-- 1) Nuovi stati
alter table public.crm_media drop constraint if exists crm_media_status_check;
update public.crm_media set status = case status
  when 'nuova' then 'da_approvare'
  when 'selezionata' then 'approvata'
  when 'lavorata' then 'pubblicata'
  else status end
where status in ('nuova', 'selezionata', 'lavorata');
alter table public.crm_media add constraint crm_media_status_check
  check (status in ('da_approvare', 'approvata', 'da_pubblicare', 'pubblicata', 'scartata'));

-- 2) Migra le grafiche gia' caricate nelle box (assets jsonb -> crm_media)
insert into public.crm_media (storage_path, file_name, kind, status, editorial_id, uploaded_role)
select a->>'path', a->>'name', 'grafica', 'pubblicata', e.id, 'admin'
from public.crm_editorial e, jsonb_array_elements(e.assets) a
where jsonb_array_length(e.assets) > 0
  and not exists (select 1 from public.crm_media m where m.storage_path = a->>'path');

update public.crm_editorial set assets = '[]'::jsonb where jsonb_array_length(assets) > 0;
