-- Documenti dell'atleta: lo spostamento di un file nella casella di un altro professionista.
-- Non tocca il file né la sua origine (chat, voce, archivio): cambia solo dove lo si vede.
create table if not exists public.crm_doc_placements (
  player_id bigint not null,
  file_path text not null,
  group_key text not null,
  moved_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (player_id, file_path)
);
alter table public.crm_doc_placements enable row level security;
create policy p_doc_place_all on public.crm_doc_placements for all to authenticated
  using (crm_manages_player(player_id)) with check (crm_manages_player(player_id));
