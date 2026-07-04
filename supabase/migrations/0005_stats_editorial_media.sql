-- Stats tecniche per partita (migrate da Notion), calendario editoriale,
-- media library con workflow selezione, notifiche in-app, realtime.

-- ============================================================
-- 1) STATS TECNICHE PER PARTITA (fonte: Notion "Season Stats")
--    Le percentuali sono GENERATED COLUMNS: sempre calcolate dal DB.
-- ============================================================
create table if not exists public.player_stats_match (
  id uuid primary key default gen_random_uuid(),
  match_date date not null,
  competition text not null,
  match_name text not null,
  minutes integer,
  goal integer default 0,
  assist integer default 0,
  xg numeric,
  tiri integer,
  tiri_porta integer,
  passaggi integer,
  passaggi_accurati integer,
  passaggi_avanti integer,
  passaggi_avanti_accurati integer,
  lanci_lunghi integer,
  lanci_lunghi_accurati integer,
  cross_totali integer,
  cross_accurati integer,
  dribbling integer,
  dribbling_riusciti integer,
  duelli integer,
  duelli_vinti integer,
  duelli_aerei integer,
  duelli_aerei_vinti integer,
  duelli_difensivi integer,
  duelli_dif_vinti integer,
  duelli_contesa integer,
  duelli_contesa_vinti integer,
  azioni_totali integer,
  azioni_riuscite integer,
  tackle_riusciti integer,
  tackle_scivolati integer,
  intercetti integer,
  spazzate integer,
  palle_recuperate integer,
  palle_rec_meta_avv integer,
  palle_perse integer,
  palle_perse_propria_meta integer,
  falli integer,
  cartellini_gialli integer default 0,
  cartellini_rossi integer default 0,
  pass_pct numeric generated always as (round(passaggi_accurati * 100.0 / nullif(passaggi, 0), 1)) stored,
  passaggi_avanti_pct numeric generated always as (round(passaggi_avanti_accurati * 100.0 / nullif(passaggi_avanti, 0), 1)) stored,
  lanci_lunghi_pct numeric generated always as (round(lanci_lunghi_accurati * 100.0 / nullif(lanci_lunghi, 0), 1)) stored,
  cross_pct numeric generated always as (round(cross_accurati * 100.0 / nullif(cross_totali, 0), 1)) stored,
  dribbling_pct numeric generated always as (round(dribbling_riusciti * 100.0 / nullif(dribbling, 0), 1)) stored,
  duelli_pct numeric generated always as (round(duelli_vinti * 100.0 / nullif(duelli, 0), 1)) stored,
  duelli_aerei_pct numeric generated always as (round(duelli_aerei_vinti * 100.0 / nullif(duelli_aerei, 0), 1)) stored,
  duelli_dif_pct numeric generated always as (round(duelli_dif_vinti * 100.0 / nullif(duelli_difensivi, 0), 1)) stored,
  duelli_contesa_pct numeric generated always as (round(duelli_contesa_vinti * 100.0 / nullif(duelli_contesa, 0), 1)) stored,
  azioni_pct numeric generated always as (round(azioni_riuscite * 100.0 / nullif(azioni_totali, 0), 1)) stored,
  created_at timestamptz not null default now(),
  unique (match_date, competition)
);

alter table public.player_stats_match enable row level security;
drop policy if exists p_stats_select on public.player_stats_match;
create policy p_stats_select on public.player_stats_match for select to authenticated using (true);
drop policy if exists p_stats_admin on public.player_stats_match;
create policy p_stats_admin on public.player_stats_match for all to authenticated
  using (public.crm_is_admin()) with check (public.crm_is_admin());

-- Medie stagionali per competizione: sostituiscono le righe "MEDIA" di Notion.
-- Percentuali aggregate calcolate sui totali (non media delle medie).
create or replace view public.player_stats_season
with (security_invoker = true) as
select
  competition,
  count(*)::int as partite,
  sum(minutes)::int as minuti,
  sum(goal)::int as goal,
  sum(assist)::int as assist,
  round(avg(xg), 2) as xg_medio,
  round(avg(passaggi), 1) as passaggi_media,
  round(sum(passaggi_accurati) * 100.0 / nullif(sum(passaggi), 0), 1) as pass_pct,
  round(avg(passaggi_avanti), 1) as passaggi_avanti_media,
  round(sum(passaggi_avanti_accurati) * 100.0 / nullif(sum(passaggi_avanti), 0), 1) as passaggi_avanti_pct,
  round(avg(lanci_lunghi), 1) as lanci_lunghi_media,
  round(sum(lanci_lunghi_accurati) * 100.0 / nullif(sum(lanci_lunghi), 0), 1) as lanci_lunghi_pct,
  round(avg(duelli), 1) as duelli_media,
  round(sum(duelli_vinti) * 100.0 / nullif(sum(duelli), 0), 1) as duelli_pct,
  round(avg(duelli_aerei), 1) as duelli_aerei_media,
  round(sum(duelli_aerei_vinti) * 100.0 / nullif(sum(duelli_aerei), 0), 1) as duelli_aerei_pct,
  round(sum(duelli_dif_vinti) * 100.0 / nullif(sum(duelli_difensivi), 0), 1) as duelli_dif_pct,
  round(sum(azioni_riuscite) * 100.0 / nullif(sum(azioni_totali), 0), 1) as azioni_pct,
  round(avg(intercetti), 1) as intercetti_media,
  round(avg(spazzate), 1) as spazzate_media,
  round(avg(palle_recuperate), 1) as palle_recuperate_media,
  round(avg(palle_perse), 1) as palle_perse_media,
  sum(cartellini_gialli)::int as cartellini_gialli,
  sum(cartellini_rossi)::int as cartellini_rossi
from public.player_stats_match
group by competition;

-- ============================================================
-- 2) CALENDARIO EDITORIALE
--    Le partite entrano da sole: trigger su matches -> entry 'partita'
--    con snapshot info in match_info. Copy e grafiche per ogni entry.
-- ============================================================
create table if not exists public.crm_editorial (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  type text not null default 'post' check (type in ('partita', 'post', 'story', 'carosello', 'altro')),
  title text not null,
  match_id uuid references public.matches(id) on delete cascade,
  match_info jsonb,
  copy_text text,
  assets jsonb not null default '[]'::jsonb,
  status text not null default 'da_preparare'
    check (status in ('da_preparare', 'copy_pronto', 'grafica_caricata', 'pronto', 'pubblicato')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists idx_editorial_match on public.crm_editorial (match_id) where match_id is not null;
create index if not exists idx_editorial_date on public.crm_editorial (entry_date);

alter table public.crm_editorial enable row level security;
drop policy if exists p_editorial_select on public.crm_editorial;
create policy p_editorial_select on public.crm_editorial for select to authenticated using (true);
drop policy if exists p_editorial_write on public.crm_editorial;
create policy p_editorial_write on public.crm_editorial for insert to authenticated with check (true);
drop policy if exists p_editorial_update on public.crm_editorial;
create policy p_editorial_update on public.crm_editorial for update to authenticated using (true);
drop policy if exists p_editorial_delete on public.crm_editorial;
create policy p_editorial_delete on public.crm_editorial for delete to authenticated using (public.crm_is_admin());

create or replace function public.crm_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_editorial_touch on public.crm_editorial;
create trigger trg_editorial_touch before update on public.crm_editorial
  for each row execute function public.crm_touch_updated_at();

-- Ogni partita in matches genera/aggiorna la sua entry editoriale.
create or replace function public.crm_editorial_from_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.crm_editorial (entry_date, type, title, match_id, match_info)
  values (
    (new.match_date at time zone 'Europe/Rome')::date,
    'partita',
    coalesce(new.home_team, 'TBD') || ' vs ' || coalesce(new.away_team, 'TBD'),
    new.id,
    jsonb_build_object(
      'fixture_id', new.fixture_id,
      'league', new.league,
      'round', new.round,
      'venue', new.venue,
      'stadium', new.stadium,
      'home_team', new.home_team,
      'away_team', new.away_team,
      'opponent', new.opponent,
      'kickoff', new.match_date,
      'status', new.status,
      'team_score', new.team_score,
      'opponent_score', new.opponent_score
    )
  )
  on conflict (match_id) where match_id is not null do update set
    entry_date = excluded.entry_date,
    title = excluded.title,
    match_info = excluded.match_info;
  return new;
end;
$$;

drop trigger if exists trg_matches_editorial on public.matches;
create trigger trg_matches_editorial
  after insert or update of match_date, home_team, away_team, status, team_score, opponent_score
  on public.matches
  for each row execute function public.crm_editorial_from_match();

-- Backfill: entry per le partite già presenti.
insert into public.crm_editorial (entry_date, type, title, match_id, match_info)
select
  (m.match_date at time zone 'Europe/Rome')::date,
  'partita',
  coalesce(m.home_team, 'TBD') || ' vs ' || coalesce(m.away_team, 'TBD'),
  m.id,
  jsonb_build_object(
    'fixture_id', m.fixture_id, 'league', m.league, 'round', m.round,
    'venue', m.venue, 'stadium', m.stadium, 'home_team', m.home_team,
    'away_team', m.away_team, 'opponent', m.opponent, 'kickoff', m.match_date,
    'status', m.status, 'team_score', m.team_score, 'opponent_score', m.opponent_score
  )
from public.matches m
on conflict (match_id) where match_id is not null do nothing;

-- ============================================================
-- 3) MEDIA LIBRARY con workflow selezione
--    foto: nuova -> selezionata (dal giocatore) -> lavorata (grafica creata)
-- ============================================================
create table if not exists public.crm_media (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null,
  file_name text,
  kind text not null default 'foto' check (kind in ('foto', 'grafica', 'carosello')),
  status text not null default 'nuova' check (status in ('nuova', 'selezionata', 'scartata', 'lavorata')),
  source_ids uuid[],
  editorial_id uuid references public.crm_editorial(id) on delete set null,
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_role text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_media_status on public.crm_media (status);

alter table public.crm_media enable row level security;
drop policy if exists p_media_select on public.crm_media;
create policy p_media_select on public.crm_media for select to authenticated using (true);
drop policy if exists p_media_insert on public.crm_media;
create policy p_media_insert on public.crm_media for insert to authenticated with check (uploaded_by = auth.uid());
drop policy if exists p_media_update on public.crm_media;
create policy p_media_update on public.crm_media for update to authenticated using (true);
drop policy if exists p_media_delete on public.crm_media;
create policy p_media_delete on public.crm_media for delete to authenticated
  using (public.crm_is_admin() or uploaded_by = auth.uid());

-- Bucket privato per foto e grafiche.
insert into storage.buckets (id, name, public)
values ('crm-media', 'crm-media', false)
on conflict (id) do nothing;

drop policy if exists p_crmmedia_read on storage.objects;
create policy p_crmmedia_read on storage.objects for select to authenticated
  using (bucket_id = 'crm-media');
drop policy if exists p_crmmedia_insert on storage.objects;
create policy p_crmmedia_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'crm-media');
drop policy if exists p_crmmedia_update on storage.objects;
create policy p_crmmedia_update on storage.objects for update to authenticated
  using (bucket_id = 'crm-media');
drop policy if exists p_crmmedia_delete on storage.objects;
create policy p_crmmedia_delete on storage.objects for delete to authenticated
  using (bucket_id = 'crm-media' and public.crm_is_admin());

-- ============================================================
-- 4) NOTIFICHE IN-APP (per ruolo)
-- ============================================================
create table if not exists public.crm_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_role text not null check (recipient_role in ('admin', 'player')),
  title text not null,
  body text,
  route text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_role on public.crm_notifications (recipient_role, created_at desc);

alter table public.crm_notifications enable row level security;
drop policy if exists p_notif_select on public.crm_notifications;
create policy p_notif_select on public.crm_notifications for select to authenticated
  using (
    (recipient_role = 'admin' and public.crm_is_admin())
    or (recipient_role = 'player' and not public.crm_is_admin())
  );
drop policy if exists p_notif_insert on public.crm_notifications;
create policy p_notif_insert on public.crm_notifications for insert to authenticated with check (true);
drop policy if exists p_notif_update on public.crm_notifications;
create policy p_notif_update on public.crm_notifications for update to authenticated
  using (
    (recipient_role = 'admin' and public.crm_is_admin())
    or (recipient_role = 'player' and not public.crm_is_admin())
  );

-- ============================================================
-- 5) REALTIME: la publication era vuota (nemmeno la chat era live).
-- ============================================================
do $$
begin
  begin
    alter publication supabase_realtime add table public.crm_messages;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.crm_notifications;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.crm_media;
  exception when duplicate_object then null;
  end;
end;
$$;
