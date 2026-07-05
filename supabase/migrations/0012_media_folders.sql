-- Cartelle nella libreria media (es. "Pre Season"): raggruppano gli upload.
alter table public.crm_media add column if not exists folder text;
create index if not exists idx_media_folder on public.crm_media (folder);
