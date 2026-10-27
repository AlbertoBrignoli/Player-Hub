-- Agenti gestiti da AUVI prima che entrino: l'admin crea e modifica il profilo dell'agente
-- e lo collega all'atleta; quando l'agente si registra (crm_allowed_emails.profile_seed
-- con "pending_agent_id") profilo e collegamenti passano al suo account.

create policy p_agent_profile_admin on public.crm_agent_profile
  for all using (current_crm_role() = 'admin') with check (current_crm_role() = 'admin');

do $$
declare d text := pg_get_functiondef('public.handle_new_crm_user'::regproc);
begin
  d := replace(d,
    E'  if wl.role = ''agente'' then\n',
    E'  if wl.role = ''agente'' then\n'
    || E'    if wl.profile_seed ? ''pending_agent_id'' then\n'
    || E'      update public.crm_agent_profile set agent_id = new.id, email = coalesce(email, new.email)\n'
    || E'       where agent_id = (wl.profile_seed->>''pending_agent_id'')::uuid;\n'
    || E'      update public.crm_agent_athletes set agent_id = new.id\n'
    || E'       where agent_id = (wl.profile_seed->>''pending_agent_id'')::uuid;\n'
    || E'    end if;\n');
  execute d;
end $$;

-- Davide Petrucci (SEG Football), agente di Pierluigi Gollini (30418)
insert into public.crm_agent_profile (agent_id, name, title, agency_name, agency_website, agency_email, agency_phone, agency_address, agency_founded, agency_instagram, agency_logo_url, notes, updated_at)
select '6f3c2a1e-5d4b-4c8e-9a7f-2b1d0e9c8a71'::uuid, 'Davide Petrucci', 'Agente sportivo · SEG Football', 'SEG - Sports Entertainment Group', 'https://www.seginternational.com/football', 'info@seginternational.com', '+31 (0)20 589 4000', 'Amsterdam, Paesi Bassi', '2000', 'https://www.instagram.com/segfootball/', '/agenzie/seg-logo.svg', 'Ex centrocampista, nato a Roma il 5 ottobre 1991. Cresciuto nel settore giovanile della Roma, nel 2008 passa al Manchester United; poi Peterborough, Anversa, Charlton, CFR Cluj, Çaykur Rizespor, Ascoli, Cosenza, Hapoel Be''er Sheva, Brindisi e Messina. Ha giocato nelle nazionali giovanili italiane U16, U17 e U19. Oggi è agente per SEG Football, agenzia con sede ad Amsterdam dal 2000, oltre 800 talenti seguiti e più di 180 agenti in 40 paesi. Instagram: instagram.com/davidepetrucci10', now()
where not exists (select 1 from public.crm_agent_profile where agent_id = '6f3c2a1e-5d4b-4c8e-9a7f-2b1d0e9c8a71');

insert into public.crm_agent_athletes (agent_id, player_id)
values ('6f3c2a1e-5d4b-4c8e-9a7f-2b1d0e9c8a71', 30418) on conflict do nothing;
