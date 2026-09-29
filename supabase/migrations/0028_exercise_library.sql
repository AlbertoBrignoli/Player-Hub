-- AUVI Exercise Library v1 (29/09/2026)
-- Evoluzione di fitness_exercise_library (già esistente: 873 esercizi Free Exercise DB,
-- immagini copiate nel bucket exercise-images). Non si ricrea nulla: si aggiungono i campi
-- del modello "esercizio" e i metadati calcio, e la sessione punta alla libreria invece di
-- copiarla. Esercizio → Programma/Sessione (fitness_programs) → Esercizio di sessione
-- (fitness_exercises, con le sole prescrizioni + library_id).

create extension if not exists pg_trgm with schema extensions;

-- 1) modello esercizio -----------------------------------------------------------
alter table public.fitness_exercise_library
  add column if not exists slug text,                       -- chiave stabile per il seed idempotente
  add column if not exists name_it text,
  add column if not exists subcategory text,
  add column if not exists instructions text[],
  add column if not exists coaching_cues text[],
  add column if not exists common_mistakes text[],
  add column if not exists primary_muscles text[],
  add column if not exists secondary_muscles text[],
  add column if not exists equipment_tags text[],
  add column if not exists movement_pattern text,
  add column if not exists laterality text,                 -- bilaterale | unilaterale | alternato
  add column if not exists gif_url text,
  add column if not exists source text,                     -- free-exercise-db | auvi | custom
  add column if not exists source_license text,
  add column if not exists is_custom boolean not null default false,
  add column if not exists created_by uuid default auth.uid(),
  add column if not exists updated_at timestamptz not null default now(),
  -- metadati calcio (facoltativi)
  add column if not exists curated boolean not null default false,  -- selezione AUVI per il calcio
  add column if not exists football_relevance smallint,             -- 1 bassa · 2 media · 3 alta
  add column if not exists performance_goals text[],
  add column if not exists position_relevance text[],
  add column if not exists injury_prevention text[],
  add column if not exists energy_system text,
  add column if not exists phase text[];

create unique index if not exists fel_slug_key on public.fitness_exercise_library (slug);
create index if not exists fel_name_trgm on public.fitness_exercise_library using gin (name extensions.gin_trgm_ops);
create index if not exists fel_name_it_trgm on public.fitness_exercise_library using gin (name_it extensions.gin_trgm_ops);
create index if not exists fel_category on public.fitness_exercise_library (category);
create index if not exists fel_curated on public.fitness_exercise_library (curated) where archived = false;
create index if not exists fel_primary_muscles on public.fitness_exercise_library using gin (primary_muscles);
create index if not exists fel_equipment_tags on public.fitness_exercise_library using gin (equipment_tags);
create index if not exists fel_goals on public.fitness_exercise_library using gin (performance_goals);
create index if not exists fel_positions on public.fitness_exercise_library using gin (position_relevance);

create or replace function public.fel_touch() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists trg_fel_touch on public.fitness_exercise_library;
create trigger trg_fel_touch before update on public.fitness_exercise_library
  for each row execute function public.fel_touch();
revoke execute on function public.fel_touch() from public, anon, authenticated;

-- 2) permessi: tutti i preparatori leggono; il catalogo lo modifica solo AUVI (admin/creator);
--    gli esercizi personalizzati li crea/modifica chi li ha creati
drop policy if exists fel_insert on public.fitness_exercise_library;
drop policy if exists fel_update on public.fitness_exercise_library;
drop policy if exists fel_delete on public.fitness_exercise_library;
create policy fel_insert on public.fitness_exercise_library for insert to authenticated with check (
  current_crm_role() in ('admin','creator')
  or (current_crm_role() = 'preparatore' and is_custom and created_by = auth.uid())
);
create policy fel_update on public.fitness_exercise_library for update to authenticated using (
  current_crm_role() in ('admin','creator')
  or (current_crm_role() = 'preparatore' and is_custom and created_by = auth.uid())
) with check (
  current_crm_role() in ('admin','creator')
  or (current_crm_role() = 'preparatore' and is_custom and created_by = auth.uid())
);
create policy fel_delete on public.fitness_exercise_library for delete to authenticated using (
  current_crm_role() in ('admin','creator')
  or (current_crm_role() = 'preparatore' and is_custom and created_by = auth.uid())
);

-- 3) esercizio di sessione: riferimento alla libreria + prescrizioni -----------------
alter table public.fitness_exercises
  add column if not exists library_id uuid references public.fitness_exercise_library(id) on delete set null,
  add column if not exists duration text,
  add column if not exists distance text,
  add column if not exists load_unit text,
  add column if not exists rpe numeric(3,1),
  add column if not exists rir smallint,
  add column if not exists tempo text;
create index if not exists idx_fitness_exercises_library on public.fitness_exercises (library_id);
-- (name/image_url/muscle_group restano come istantanea di visualizzazione per le schede
--  già create e per il PDF; i nuovi esercizi li prendono dalla libreria tramite library_id)

-- 4) media: si usa il bucket già esistente exercise-images (lettura pubblica, scrittura
--    admin/creator/preparatore). Nessun nuovo storage.
