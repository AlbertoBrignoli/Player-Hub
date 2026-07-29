-- Automazione grafiche partita: la edge function generate-story crea da sola
-- le storie Instagram 1080x1920 (pre-match entro 24h dal kickoff, post-match
-- appena arrivano le statistiche personali in public.matches).
-- In piu': le statistiche post-partita vengono sincronizzate ogni ora nelle
-- 48h successive al match (i job settimanali del lunedi/giovedi restano).

-- NOTA 28/07/2026: il job 'story-autogen' e' stato messo in pausa subito dopo
-- (cron.unschedule) in attesa della verifica interna delle grafiche.
-- Per riattivarlo: rieseguire il blocco cron.schedule('story-autogen', ...) qui sotto.

-- 1) Generazione storie: ogni 30 minuti, solo quando c'e' qualcosa da fare
select cron.schedule(
  'story-autogen',
  '*/30 * * * *',
  $$
  select net.http_post(
      url := 'https://irdphiphumxsymttvfzq.supabase.co/functions/v1/generate-story',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-sync-secret',(select value from public.cp_secrets where key = 'sync_secret')
      ),
      body := '{"mode":"auto"}'::jsonb,
      timeout_milliseconds := 120000
  )
  where exists (
    -- pre-match: partita nelle prossime 24 ore
    select 1 from public.crm_editorial
    where type = 'partita' and status <> 'pubblicato'
      and (match_info->>'kickoff') is not null
      and (match_info->>'kickoff')::timestamptz between now() and now() + interval '24 hours'
  ) or exists (
    -- post-match: partita giocata negli ultimi 4 giorni
    select 1 from public.matches
    where match_date between now() - interval '4 days' and now()
  )
  $$
);

-- 2) Statistiche fresche subito dopo la partita: sync orario nelle 48h post-match
--    finche' mancano minuti/rating (i friendlies possono non averle mai: il
--    controllo scade comunque dopo 48 ore).
select cron.schedule(
  'sync-player-stats-postmatch',
  '20 * * * *',
  $$
  select net.http_post(
      url := 'https://irdphiphumxsymttvfzq.supabase.co/functions/v1/sync_player_stats_game',
      headers := jsonb_build_object('Content-Type','application/json'),
      body := '{}'::jsonb
  )
  where exists (
    select 1 from public.matches
    where match_date between now() - interval '48 hours' and now() - interval '2 hours'
      and (minutes is null or rating is null)
  )
  $$
);
