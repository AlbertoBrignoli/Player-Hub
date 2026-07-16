-- 0021 — RICERCA TALENT LATO BRAND
-- Il referente del brand compila le caratteristiche dell'atleta che cerca
-- (specchio dell'onboarding commerciale dell'atleta). Il match 0-100 viene
-- calcolato client-side con regole tracciabili usando SOLO dati già visibili
-- al brand (cp_preferences_public + player): nessuna nuova esposizione.

create table if not exists public.cp_brand_search (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null unique references public.crm_brands(id) on delete cascade,
  categories text[] not null default '{}',        -- categorie merceologiche del brand
  values_wanted text[] not null default '{}',      -- valori cercati nell'atleta
  interests_wanted text[] not null default '{}',
  activities text[] not null default '{}',         -- formati/attività richieste
  markets text[] not null default '{}',
  languages text[] not null default '{}',
  age_min int,
  age_max int,
  notes text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cp_brand_search enable row level security;

-- Il brand gestisce SOLO la propria ricerca; AUVI vede tutte.
drop policy if exists p_bsearch_own on public.cp_brand_search;
create policy p_bsearch_own on public.cp_brand_search
  for all to authenticated
  using (brand_id = public.crm_my_brand_id())
  with check (brand_id = public.crm_my_brand_id());

drop policy if exists p_bsearch_admin on public.cp_brand_search;
create policy p_bsearch_admin on public.cp_brand_search
  for all to authenticated using (public.crm_is_admin()) with check (public.crm_is_admin());

drop trigger if exists trg_cp_bsearch_touch on public.cp_brand_search;
create trigger trg_cp_bsearch_touch before update on public.cp_brand_search
  for each row execute function public.cp_touch_updated_at();
