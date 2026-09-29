-- I cron delle sync API-Football mandano il segreto x-sync-secret (da cp_secrets):
-- le funzioni sync_player_* ora rifiutano le chiamate senza segreto/admin.
select cron.alter_job(jobid, command := replace(command,
  $a$jsonb_build_object('Content-Type','application/json'$a$,
  $b$jsonb_build_object('Content-Type','application/json','x-sync-secret',(select value from public.cp_secrets where key = 'sync_secret')$b$))
from cron.job
where jobname in ('sync-player-full-info','sync-player-matches','sync-player-stats-api','sync-player-stats-game','sync-player-stats-postmatch')
  and command not like '%x-sync-secret%';
