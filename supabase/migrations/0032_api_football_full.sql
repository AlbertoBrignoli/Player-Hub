-- Tutto quello che API-Football fornisce sull'atleta (04/10/2026)
-- 1) player_stats_api.raw = l'oggetto `statistics` completo della stagione (titolare/subentrato,
--    tiri, passaggi chiave, dribbling, duelli, contrasti, rigori...), non solo 8 numeri.
-- 2) player_api_extra = profilo (luogo di nascita, infortunato), stagioni disponibili,
--    trasferimenti, trofei, stop per infortunio. Una riga per atleta.
-- 3) sync_matches_to_stats aggiorna anche le righe gia' copiate: prima inseriva una volta sola
--    e restavano i dati provvisori del dopo-partita (es. Macheda vs OFI: 16' invece di 72').

alter table public.player_stats_api add column if not exists raw jsonb;

create table if not exists public.player_api_extra (
  player_id bigint primary key,
  profile jsonb,
  seasons int[],
  transfers jsonb,
  trophies jsonb,
  sidelined jsonb,
  updated_at timestamptz not null default now()
);
alter table public.player_api_extra enable row level security;
drop policy if exists p_extra_read on public.player_api_extra;
create policy p_extra_read on public.player_api_extra for select to authenticated using (
  crm_manages_player(player_id) or crm_team_sees(player_id) or crm_brand_sees(player_id));
drop policy if exists p_extra_admin on public.player_api_extra;
create policy p_extra_admin on public.player_api_extra for all to authenticated
  using (crm_is_admin()) with check (crm_is_admin());
revoke all on public.player_api_extra from anon;

create or replace function public.sync_matches_to_stats()
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare n integer; u integer;
begin
  insert into public.player_stats_match
    (match_date, competition, match_name, minutes, goal, assist,
     cartellini_gialli, cartellini_rossi, duelli, duelli_vinti,
     intercetti, spazzate, passaggi, passaggi_accurati, falli, rating, player_id)
  select m.match_date::date, m.league, m.home_team || ' - ' || m.away_team,
     m.minutes, coalesce(m.goals,0), coalesce(m.assists,0),
     coalesce(m.yellow_cards,0), coalesce(m.red_cards,0),
     m.duels_total, m.duels_won, m.interceptions, m.blocks,
     m.passes_total, nullif(m.passes_accuracy,'')::int, m.fouls_committed,
     m.rating, m.player_id
  from public.matches m
  where m.minutes is not null and m.minutes > 0 and m.match_date >= '2026-07-01'
    and not exists (select 1 from public.player_stats_match p
      where p.player_id = m.player_id and p.match_date = m.match_date::date);
  get diagnostics n = row_count;

  -- riallinea i numeri API delle righe gia' copiate (i campi avanzati inseriti a parte restano)
  update public.player_stats_match p set
     minutes = m.minutes, goal = coalesce(m.goals,0), assist = coalesce(m.assists,0),
     cartellini_gialli = coalesce(m.yellow_cards,0), cartellini_rossi = coalesce(m.red_cards,0),
     duelli = m.duels_total, duelli_vinti = m.duels_won, intercetti = m.interceptions,
     spazzate = m.blocks, passaggi = m.passes_total,
     passaggi_accurati = nullif(m.passes_accuracy,'')::int, falli = m.fouls_committed, rating = m.rating
  from public.matches m
  where p.player_id = m.player_id and p.match_date = m.match_date::date
    and m.minutes is not null and m.minutes > 0 and m.match_date >= '2026-07-01'
    and (p.minutes, p.goal, p.assist, p.rating, p.passaggi, p.duelli)
        is distinct from (m.minutes, coalesce(m.goals,0), coalesce(m.assists,0), m.rating, m.passes_total, m.duels_total);
  get diagnostics u = row_count;
  return n + u;
end $function$;

-- stesso nome competizione in squadre diverse nella stessa stagione (es. "Cup" in Turchia e in
-- Grecia dopo un trasferimento): la chiave include la squadra, prima una sovrascriveva l'altra
alter table public.player_stats_api drop constraint if exists player_stats_api_player_id_season_competition_key;
alter table public.player_stats_api add constraint player_stats_api_player_season_comp_team_key
  unique (player_id, season, competition, team_id);

-- ogni lunedi' alle 5: carriera completa + profilo/trasferimenti/trofei/infortuni,
-- una chiamata per atleta (in parallelo, cosi' nessuna supera il tempo massimo della funzione)
select cron.schedule('sync-player-career', '0 5 * * 1', $$
  select net.http_post(
    url := 'https://irdphiphumxsymttvfzq.supabase.co/functions/v1/sync_player_stats_api',
    headers := jsonb_build_object('Content-Type','application/json','x-sync-secret',(select value from public.cp_secrets where key = 'sync_secret')),
    body := jsonb_build_object('player_id', api_player_id, 'career', true),
    timeout_milliseconds := 150000)
  from public.player where api_player_id is not null
$$);
