-- Davide Petrucci (SEG) autorizzato come agente di Gollini: alla registrazione il profilo
-- preparato da AUVI (pending_agent_id) passa al suo account.
insert into public.crm_allowed_emails (email, role, note, player_api_id, profile_seed)
values ('petruccidavide@hotmail.com', 'agente', 'Davide Petrucci · Agente Pierluigi Gollini', 30418,
        '{"pending_agent_id":"6f3c2a1e-5d4b-4c8e-9a7f-2b1d0e9c8a71"}'::jsonb)
on conflict (email) do update set role = excluded.role, note = excluded.note,
  player_api_id = excluded.player_api_id, profile_seed = excluded.profile_seed;

update public.crm_agent_profile set email = 'petruccidavide@hotmail.com'
 where agent_id = '6f3c2a1e-5d4b-4c8e-9a7f-2b1d0e9c8a71' and email is null;
