-- Le grafiche finali dei contenuti editoriali si raccolgono nella cartella "Pubblicati"
-- invece di restare "senza cartella". Backfill di quelle già presenti.
update public.crm_media set folder = 'Pubblicati'
where folder is null
  and (kind = 'grafica' or (editorial_id is not null and status = 'pubblicata'));
