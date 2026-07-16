-- 0019 — MEDIA KIT A DUE LIVELLI
-- Strategia commerciale AUVI: al brand si mostra un TEASER (fascia follower,
-- categorie compatibili, highlights scelti da AUVI) — mai ER, reach, demografia
-- o numeri dettagliati. Il profilo completo viene condiviso da AUVI solo su
-- richiesta, previa conferma dell'atleta.
--
-- cp_public_teaser è l'UNICA superficie commerciale leggibile dal ruolo brand:
-- la scrive solo l'admin, e solo le righe published=true sono visibili.

create table if not exists public.cp_public_teaser (
  id uuid primary key default gen_random_uuid(),
  player_id bigint not null unique,
  headline text,                                -- es. "Portiere Serie A · profilo internazionale"
  follower_band text,                           -- es. "65.000+" (mai il numero esatto)
  top_categories jsonb not null default '[]'::jsonb,  -- max 3 nomi categoria, senza percentuali
  highlights jsonb not null default '[]'::jsonb,      -- 2-4 frasi scelte da AUVI
  published boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.cp_public_teaser enable row level security;

-- Lettura: tutti gli autenticati (brand incluso) ma SOLO se pubblicato
drop policy if exists p_cp_teaser_read on public.cp_public_teaser;
create policy p_cp_teaser_read on public.cp_public_teaser
  for select to authenticated using (published = true or public.crm_is_admin());

-- Scrittura: solo admin
drop policy if exists p_cp_teaser_admin on public.cp_public_teaser;
create policy p_cp_teaser_admin on public.cp_public_teaser
  for all to authenticated using (public.crm_is_admin()) with check (public.crm_is_admin());
