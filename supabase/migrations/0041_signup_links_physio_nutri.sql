-- Registrazione con codice invito: collegamento all'atleta anche per fisioterapista e
-- nutrizionista (18/10/2026). handle_new_crm_user collegava solo agente, assicuratore,
-- commercialista e preparatore: chi si registrava come fisio/nutrizionista entrava senza atleti.
-- Ora crea anche il collegamento, il profilo base e la notifica "Nuovo collegamento"
-- (come crm_request_access), e ripara gli account già registrati.

create or replace function public.handle_new_crm_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare wl record; v_name text; v_who text;
begin
  select * into wl from public.crm_allowed_emails where lower(email) = lower(new.email);
  if wl is null then
    raise exception 'Email non autorizzata all''accesso a questo CRM: %', new.email;
  end if;

  insert into public.crm_profiles (id, email, role, full_name, player_api_id)
  values (new.id, new.email, wl.role, coalesce(new.raw_user_meta_data->>'full_name', wl.note), wl.player_api_id)
  on conflict (id) do update set role = excluded.role, player_api_id = excluded.player_api_id;

  if wl.role = 'brand' and wl.brand_id is not null then
    update public.crm_brands set owner_id = new.id where id = wl.brand_id;
  end if;

  if wl.role = 'agente' then
    if wl.player_api_id is not null then
      insert into public.crm_agent_athletes (agent_id, player_id) values (new.id, wl.player_api_id) on conflict do nothing;
    end if;
    insert into public.crm_agent_profile (agent_id, name, email)
    values (new.id, split_part(coalesce(wl.note,''), ' · ', 1), new.email) on conflict (agent_id) do nothing;
    if wl.profile_seed is not null then
      update public.crm_agent_profile set
        title = coalesce(wl.profile_seed->>'title', title),
        phone = coalesce(wl.profile_seed->>'phone', phone),
        photo_url = coalesce(wl.profile_seed->>'photo_url', photo_url),
        agency_name = coalesce(wl.profile_seed->>'agency_name', agency_name),
        agency_website = coalesce(wl.profile_seed->>'agency_website', agency_website),
        agency_transfermarkt = coalesce(wl.profile_seed->>'agency_transfermarkt', agency_transfermarkt),
        agency_email = coalesce(wl.profile_seed->>'agency_email', agency_email),
        agency_address = coalesce(wl.profile_seed->>'agency_address', agency_address),
        agency_founded = coalesce(wl.profile_seed->>'agency_founded', agency_founded),
        agency_instagram = coalesce(wl.profile_seed->>'agency_instagram', agency_instagram),
        agency_linkedin = coalesce(wl.profile_seed->>'agency_linkedin', agency_linkedin),
        agency_logo_url = coalesce(wl.profile_seed->>'agency_logo_url', agency_logo_url)
      where agent_id = new.id;
    end if;
  end if;

  if wl.role = 'assicuratore' then
    if wl.player_api_id is not null then
      insert into public.crm_insurer_athletes (insurer_id, player_id) values (new.id, wl.player_api_id) on conflict do nothing;
    end if;
    insert into public.crm_insurer_profile (insurer_id, name, email)
    values (new.id, split_part(coalesce(wl.note,''), ' · ', 1), new.email) on conflict (insurer_id) do nothing;
  end if;

  if wl.role = 'commercialista' then
    if wl.player_api_id is not null then
      insert into public.crm_tax_athletes (advisor_id, player_id) values (new.id, wl.player_api_id) on conflict do nothing;
    end if;
    insert into public.crm_tax_profile (advisor_id, name, email)
    values (new.id, split_part(coalesce(wl.note,''), ' · ', 1), new.email) on conflict (advisor_id) do nothing;
  end if;

  if wl.role = 'preparatore' then
    if wl.player_api_id is not null then
      insert into public.fitness_trainer_athletes (trainer_id, player_id) values (new.id, wl.player_api_id) on conflict do nothing;
    end if;
    insert into public.fitness_coach_profile (trainer_id, name)
    values (new.id, split_part(coalesce(wl.note,''), ' · ', 1)) on conflict (trainer_id) do nothing;
  end if;

  if wl.role = 'fisioterapista' then
    if wl.player_api_id is not null then
      insert into public.crm_physio_athletes (physio_id, player_id) values (new.id, wl.player_api_id) on conflict do nothing;
    end if;
    insert into public.crm_physio_profile (physio_id, name, email)
    values (new.id, nullif(split_part(coalesce(wl.note,''), ' · ', 1), ''), new.email) on conflict (physio_id) do nothing;
  end if;

  if wl.role = 'nutrizionista' then
    if wl.player_api_id is not null then
      insert into public.crm_nutri_athletes (nutri_id, player_id) values (new.id, wl.player_api_id) on conflict do nothing;
    end if;
    insert into public.crm_nutri_profile (nutri_id, email)
    values (new.id, new.email) on conflict (nutri_id) do nothing;
  end if;

  -- professionista collegato a un atleta: AUVI e l'atleta lo sanno (come col codice da "Collegamenti")
  if wl.role in ('agente','assicuratore','commercialista','preparatore','fisioterapista','nutrizionista')
     and wl.player_api_id is not null then
    select name into v_name from public.player where api_player_id = wl.player_api_id;
    v_who := coalesce(nullif(trim(coalesce(wl.note, '')), ''), new.email);
    insert into public.crm_access_requests
      (requester_id, requester_role, player_id, message, requester_name, requester_email, status, decided_at, decided_by)
    values (new.id, wl.role, wl.player_api_id, null, v_who, new.email, 'approvata', now(), new.id)
    on conflict (requester_id, player_id) do nothing;
    insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('admin', 'Nuovo collegamento', v_who || ' (' || wl.role || ') si e registrato ed e collegato a ' || coalesce(v_name, 'atleta'),
            'access-requests', wl.player_api_id, new.id);
    insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('player', 'Nuovo collegamento', v_who || ' (' || wl.role || ') e ora nel tuo team', 'access-requests', wl.player_api_id, new.id);
  end if;

  return new;
end $$;
revoke execute on function public.handle_new_crm_user() from public, anon, authenticated;

-- ripara chi si è già registrato come fisioterapista o nutrizionista con un codice atleta
insert into public.crm_nutri_athletes (nutri_id, player_id)
select p.id, w.player_api_id from public.crm_profiles p
  join public.crm_allowed_emails w on lower(w.email) = lower(p.email)
 where p.role = 'nutrizionista' and w.role = 'nutrizionista' and w.player_api_id is not null
on conflict do nothing;
insert into public.crm_nutri_profile (nutri_id, email)
select p.id, p.email from public.crm_profiles p where p.role = 'nutrizionista'
on conflict (nutri_id) do nothing;
insert into public.crm_physio_athletes (physio_id, player_id)
select p.id, w.player_api_id from public.crm_profiles p
  join public.crm_allowed_emails w on lower(w.email) = lower(p.email)
 where p.role = 'fisioterapista' and w.role = 'fisioterapista' and w.player_api_id is not null
on conflict do nothing;
