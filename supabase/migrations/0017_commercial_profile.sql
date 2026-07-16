-- 0017 — AUVI COMMERCIAL PROFILE
-- Modulo commerciale dell'atleta: profilo, score configurabile, brand fit,
-- opportunità, collaborazioni, performance e valutazioni riservate.
--
-- Visibilità (RLS):
--   · brand           → NON vede nulla del modulo
--   · player/creator  → legge tutto tranne le tabelle riservate; il player aggiorna il suo profilo/risposte
--   · admin (AUVI)    → tutto, incluse cp_opportunity_private e cp_internal_evals (mai esposte all'atleta)

-- ── Config score: pesi, livelli e bande di valore (modificabili solo da AUVI, mai hardcoded in app)
create table if not exists public.cp_config (
  id int primary key default 1 check (id = 1),
  weights jsonb not null default '{"sport":25,"audience":20,"content":15,"brand_fit":15,"reputation":15,"readiness":10}'::jsonb,
  levels jsonb not null default '[
    {"min":85,"label":"Profilo commerciale eccellente"},
    {"min":70,"label":"Profilo commerciale molto interessante"},
    {"min":55,"label":"Profilo commerciale interessante"},
    {"min":40,"label":"Profilo commerciale in costruzione"},
    {"min":0,"label":"Profilo commerciale iniziale"}
  ]'::jsonb,
  value_bands jsonb not null default '[
    {"min":85,"lo":50000,"hi":90000},
    {"min":70,"lo":25000,"hi":40000},
    {"min":55,"lo":12000,"hi":22000},
    {"min":40,"lo":5000,"hi":10000},
    {"min":0,"lo":1000,"hi":4000}
  ]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
insert into public.cp_config (id) values (1) on conflict (id) do nothing;

-- ── Categorie brand
create table if not exists public.cp_brand_categories (
  key text primary key,
  name text not null,
  sort int not null default 100,
  active boolean not null default true
);
insert into public.cp_brand_categories (key, name, sort) values
  ('sportswear','Sportswear',10), ('fashion','Fashion',20), ('technology','Technology',30),
  ('gaming','Gaming',40), ('automotive','Automotive',50), ('wellness','Wellness',60),
  ('food','Food',70), ('beverage','Beverage',80), ('travel','Travel',90),
  ('finance','Finance',100), ('luxury','Luxury',110), ('family','Family',120),
  ('entertainment','Entertainment',130)
on conflict (key) do nothing;

-- ── Profilo commerciale dell'atleta (onboarding + preferenze + dati dichiarati)
create table if not exists public.cp_profiles (
  id uuid primary key default gen_random_uuid(),
  player_id bigint not null unique,           -- api_player_id
  onboarding_completed boolean not null default false,
  onboarding_step int not null default 0,
  identity jsonb not null default '{}'::jsonb,          -- valori, stile, interessi, posizionamento
  categories_liked text[] not null default '{}',
  categories_excluded text[] not null default '{}',
  availability jsonb not null default '{}'::jsonb,      -- shooting, eventi, reels…
  territories jsonb not null default '{}'::jsonb,       -- mercati, lingue, viaggi
  history jsonb not null default '{}'::jsonb,           -- sponsor, esclusività, fee minima
  audience jsonb not null default '{}'::jsonb,          -- tiktok/youtube + geo/età/genere/autenticità
  content jsonb not null default '{}'::jsonb,           -- lifestyle, shooting disponibili
  sport jsonb not null default '{}'::jsonb,             -- nazionale, competizioni internazionali
  media_kit jsonb not null default '{}'::jsonb,         -- lingua, categoria target, generated_at
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Snapshot punteggi (trend 30/90 giorni)
create table if not exists public.cp_score_snapshots (
  id uuid primary key default gen_random_uuid(),
  player_id bigint not null,
  total numeric not null,
  components jsonb not null default '{}'::jsonb,
  level text,
  value_lo int,
  value_hi int,
  computed_at timestamptz not null default now()
);
create index if not exists idx_cp_snap on public.cp_score_snapshots (player_id, computed_at desc);

-- ── Opportunità commerciali (pipeline). Nessun dato riservato qui.
create table if not exists public.cp_opportunities (
  id uuid primary key default gen_random_uuid(),
  player_id bigint not null,
  brand_name text not null,
  brand_logo_url text,
  category_key text references public.cp_brand_categories(key),
  description text,
  referente text,
  fee_lo numeric, fee_hi numeric, fee_note text,
  activities text[] not null default '{}',
  duration text, territory text, exclusivity text,
  deadline date,
  status text not null default 'nuova' check (status in (
    'nuova','in_valutazione','interesse_confermato','negoziazione','contratto',
    'in_produzione','in_approvazione','pubblicazione','completata','non_accettata')),
  materials_requested text[] not null default '{}',
  athlete_response text check (athlete_response in ('interesse','rifiuto','info') or athlete_response is null),
  athlete_note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_cp_opp on public.cp_opportunities (player_id, created_at desc);

-- ── Dati riservati dell'opportunità (SOLO admin: margini, note, trattativa)
create table if not exists public.cp_opportunity_private (
  opportunity_id uuid primary key references public.cp_opportunities(id) on delete cascade,
  internal_notes text,
  margin numeric,
  negotiation_notes text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ── Timeline eventi opportunità
create table if not exists public.cp_opportunity_events (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.cp_opportunities(id) on delete cascade,
  actor text,
  kind text not null default 'event',
  body text,
  created_at timestamptz not null default now()
);
create index if not exists idx_cp_oev on public.cp_opportunity_events (opportunity_id, created_at asc);

-- ── Collaborazioni concluse/in corso (storico commerciale proprietario)
create table if not exists public.cp_collaborations (
  id uuid primary key default gen_random_uuid(),
  player_id bigint not null,
  brand_name text not null,
  category_key text references public.cp_brand_categories(key),
  period_start date, period_end date,
  contract_value numeric,
  activities text[] not null default '{}',
  status text not null default 'attiva' check (status in ('attiva','completata','annullata')),
  brand_feedback text,
  athlete_feedback text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_cp_collab on public.cp_collaborations (player_id, created_at desc);

-- ── Performance delle campagne
create table if not exists public.cp_performance (
  id uuid primary key default gen_random_uuid(),
  collaboration_id uuid not null references public.cp_collaborations(id) on delete cascade,
  player_id bigint not null,
  reach bigint, impressions bigint, engagement numeric,
  views bigint, clicks bigint, conversions bigint,
  posts_count int, on_time boolean, quality int check (quality between 1 and 10),
  brand_feedback text, auvi_feedback text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_cp_perf on public.cp_performance (collaboration_id);

-- ── Valutazioni interne (SOLO admin). L'atleta riceve solo una fascia sintetica via RPC.
create table if not exists public.cp_internal_evals (
  id uuid primary key default gen_random_uuid(),
  player_id bigint not null unique,
  reliability int check (reliability between 0 and 100),
  professionalism int check (professionalism between 0 and 100),
  punctuality int check (punctuality between 0 and 100),
  risk_rating text check (risk_rating in ('basso','medio','alto') or risk_rating is null),
  internal_notes text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ── updated_at automatico
create or replace function public.cp_touch_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin new.updated_at := now(); return new; end; $$;
do $$
declare t text;
begin
  foreach t in array array['cp_profiles','cp_opportunities','cp_collaborations','cp_performance'] loop
    execute format('drop trigger if exists trg_%s_touch on public.%I', t, t);
    execute format('create trigger trg_%s_touch before update on public.%I for each row execute function public.cp_touch_updated_at()', t, t);
  end loop;
end $$;

-- ── Fascia di affidabilità per l'atleta: espone SOLO una fascia coarse (mai il dato interno)
create or replace function public.cp_reliability_band(pid bigint)
returns int language sql stable security definer set search_path = public as $$
  select case
    when reliability is null then null
    when reliability >= 85 then 90
    when reliability >= 70 then 75
    when reliability >= 55 then 60
    else 45
  end
  from public.cp_internal_evals where player_id = pid;
$$;
revoke execute on function public.cp_reliability_band(bigint) from anon;

-- ── RLS
alter table public.cp_config              enable row level security;
alter table public.cp_brand_categories    enable row level security;
alter table public.cp_profiles            enable row level security;
alter table public.cp_score_snapshots     enable row level security;
alter table public.cp_opportunities       enable row level security;
alter table public.cp_opportunity_private enable row level security;
alter table public.cp_opportunity_events  enable row level security;
alter table public.cp_collaborations      enable row level security;
alter table public.cp_performance         enable row level security;
alter table public.cp_internal_evals      enable row level security;

-- lettura team (tutti tranne brand)
drop policy if exists p_cp_config_read on public.cp_config;
create policy p_cp_config_read on public.cp_config for select to authenticated using (public.crm_my_role() <> 'brand');
drop policy if exists p_cp_config_admin on public.cp_config;
create policy p_cp_config_admin on public.cp_config for all to authenticated using (public.crm_is_admin()) with check (public.crm_is_admin());

drop policy if exists p_cp_cats_read on public.cp_brand_categories;
create policy p_cp_cats_read on public.cp_brand_categories for select to authenticated using (public.crm_my_role() <> 'brand');
drop policy if exists p_cp_cats_admin on public.cp_brand_categories;
create policy p_cp_cats_admin on public.cp_brand_categories for all to authenticated using (public.crm_is_admin()) with check (public.crm_is_admin());

drop policy if exists p_cp_prof_read on public.cp_profiles;
create policy p_cp_prof_read on public.cp_profiles for select to authenticated using (public.crm_my_role() <> 'brand');
drop policy if exists p_cp_prof_write on public.cp_profiles;
create policy p_cp_prof_write on public.cp_profiles for insert to authenticated with check (public.crm_my_role() in ('admin','player'));
drop policy if exists p_cp_prof_update on public.cp_profiles;
create policy p_cp_prof_update on public.cp_profiles for update to authenticated using (public.crm_my_role() in ('admin','player')) with check (public.crm_my_role() in ('admin','player'));

drop policy if exists p_cp_snap_read on public.cp_score_snapshots;
create policy p_cp_snap_read on public.cp_score_snapshots for select to authenticated using (public.crm_my_role() <> 'brand');
drop policy if exists p_cp_snap_insert on public.cp_score_snapshots;
create policy p_cp_snap_insert on public.cp_score_snapshots for insert to authenticated with check (public.crm_my_role() in ('admin','player','creator'));

drop policy if exists p_cp_opp_read on public.cp_opportunities;
create policy p_cp_opp_read on public.cp_opportunities for select to authenticated using (public.crm_my_role() <> 'brand');
drop policy if exists p_cp_opp_admin on public.cp_opportunities;
create policy p_cp_opp_admin on public.cp_opportunities for all to authenticated using (public.crm_is_admin()) with check (public.crm_is_admin());
-- il player può solo aggiornare (risposta/nota via app); condizioni economiche restano gestite da AUVI
drop policy if exists p_cp_opp_player_update on public.cp_opportunities;
create policy p_cp_opp_player_update on public.cp_opportunities for update to authenticated using (public.crm_my_role() = 'player') with check (public.crm_my_role() = 'player');

drop policy if exists p_cp_opp_priv_admin on public.cp_opportunity_private;
create policy p_cp_opp_priv_admin on public.cp_opportunity_private for all to authenticated using (public.crm_is_admin()) with check (public.crm_is_admin());

drop policy if exists p_cp_oev_read on public.cp_opportunity_events;
create policy p_cp_oev_read on public.cp_opportunity_events for select to authenticated using (public.crm_my_role() <> 'brand');
drop policy if exists p_cp_oev_insert on public.cp_opportunity_events;
create policy p_cp_oev_insert on public.cp_opportunity_events for insert to authenticated with check (public.crm_my_role() in ('admin','player'));

drop policy if exists p_cp_collab_read on public.cp_collaborations;
create policy p_cp_collab_read on public.cp_collaborations for select to authenticated using (public.crm_my_role() <> 'brand');
drop policy if exists p_cp_collab_admin on public.cp_collaborations;
create policy p_cp_collab_admin on public.cp_collaborations for all to authenticated using (public.crm_is_admin()) with check (public.crm_is_admin());
drop policy if exists p_cp_collab_player_update on public.cp_collaborations;
create policy p_cp_collab_player_update on public.cp_collaborations for update to authenticated using (public.crm_my_role() = 'player') with check (public.crm_my_role() = 'player');

drop policy if exists p_cp_perf_read on public.cp_performance;
create policy p_cp_perf_read on public.cp_performance for select to authenticated using (public.crm_my_role() <> 'brand');
drop policy if exists p_cp_perf_admin on public.cp_performance;
create policy p_cp_perf_admin on public.cp_performance for all to authenticated using (public.crm_is_admin()) with check (public.crm_is_admin());

drop policy if exists p_cp_evals_admin on public.cp_internal_evals;
create policy p_cp_evals_admin on public.cp_internal_evals for all to authenticated using (public.crm_is_admin()) with check (public.crm_is_admin());
