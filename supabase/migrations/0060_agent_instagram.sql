-- Instagram personale dell'agente: link cliccabile nel suo profilo e nella scheda dell'atleta.
alter table public.crm_agent_profile add column if not exists instagram_url text;

update public.crm_agent_profile set
  instagram_url = 'https://www.instagram.com/davidepetrucci10/',
  notes = regexp_replace(notes, '\s*Instagram: instagram\.com/davidepetrucci10\s*$', '')
where agent_id = '6f3c2a1e-5d4b-4c8e-9a7f-2b1d0e9c8a71';
