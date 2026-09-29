-- Ufficio del professionista, fase 1 (29/09/2026)
-- 1) Fisioterapista: vede i suoi atleti (prima la RLS su player non lo prevedeva:
--    Home e Ufficio sempre vuoti) e l'approvazione di una sua richiesta lo collega davvero.
-- 2) Partite: le leggono anche assicuratore, commercialista e fisioterapista dei propri atleti
--    (il calendario sportivo non è riservato; senza questo la "prossima partita" era vuota).
-- 3) Il fisioterapista compare tra i referenti dell'atleta (vista crm_athlete_team).
-- 4) Invito dal professionista: il pro genera un codice suo, l'atleta lo accetta
--    dalla propria area → collegamento creato solo con il sì dell'atleta.

-- 1) visibilità fisioterapista ------------------------------------------------
create or replace function public.crm_physio_sees(p_api bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select current_crm_role() = 'fisioterapista'
     and exists (select 1 from public.crm_physio_athletes p
                 where p.physio_id = auth.uid() and p.player_id = p_api);
$$;
revoke execute on function public.crm_physio_sees(bigint) from public, anon;
grant execute on function public.crm_physio_sees(bigint) to authenticated;

drop policy if exists rls_read_scoped on public.player;
create policy rls_read_scoped on public.player for select to authenticated using (
  (current_crm_role() = any (array['admin','creator']))
  or ((current_crm_role() = 'player') and (api_player_id = current_player_api_id()))
  or ((current_crm_role() = 'preparatore') and exists (
        select 1 from fitness_trainer_athletes a
        where a.trainer_id = auth.uid() and a.player_id = player.api_player_id))
  or crm_agent_sees(api_player_id) or crm_insurer_sees(api_player_id)
  or crm_tax_sees(api_player_id) or crm_brand_sees(api_player_id)
  or crm_physio_sees(api_player_id)
);

-- 2) partite per tutti i professionisti collegati -------------------------------
drop policy if exists rls_read_scoped on public.matches;
create policy rls_read_scoped on public.matches for select to authenticated using (
  crm_manages_player(player_id)
  or ((current_crm_role() = 'preparatore') and fitness_can_manage(player_id))
  or crm_brand_sees(player_id)
  or crm_insurer_sees(player_id) or crm_tax_sees(player_id) or crm_physio_sees(player_id)
);

-- collegamento generico pro ↔ atleta (un solo posto per i rami per ruolo)
create or replace function public.crm_link_pro(p_pro uuid, p_role text, p_player bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_role = 'assicuratore' then
    insert into crm_insurer_athletes (insurer_id, player_id) values (p_pro, p_player) on conflict do nothing;
  elsif p_role = 'agente' then
    insert into crm_agent_athletes (agent_id, player_id) values (p_pro, p_player) on conflict do nothing;
  elsif p_role = 'preparatore' then
    insert into fitness_trainer_athletes (trainer_id, player_id) values (p_pro, p_player) on conflict do nothing;
  elsif p_role = 'commercialista' then
    insert into crm_tax_athletes (advisor_id, player_id) values (p_pro, p_player) on conflict do nothing;
  elsif p_role = 'fisioterapista' then
    insert into crm_physio_athletes (physio_id, player_id) values (p_pro, p_player) on conflict do nothing;
  else
    raise exception 'Ruolo professionale non valido: %', p_role;
  end if;
end $$;
revoke execute on function public.crm_link_pro(uuid, text, bigint) from public, anon, authenticated;

-- approvazione richiesta: ora gestisce anche il fisioterapista
create or replace function public.crm_decide_access(p_request uuid, p_approve boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v_name text;
begin
  select * into r from public.crm_access_requests where id = p_request;
  if r is null then raise exception 'Richiesta inesistente'; end if;
  if not (current_crm_role() = 'admin'
          or (current_crm_role() = 'player' and r.player_id = current_player_api_id())) then
    raise exception 'Non autorizzato a decidere su questa richiesta';
  end if;
  update public.crm_access_requests
  set status = case when p_approve then 'approvata' else 'rifiutata' end,
      decided_at = now(), decided_by = auth.uid()
  where id = p_request;
  if p_approve then
    perform public.crm_link_pro(r.requester_id, r.requester_role, r.player_id);
  end if;
  select name into v_name from public.player where api_player_id = r.player_id;
  insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
  values (r.requester_role,
          case when p_approve then 'Accesso approvato' else 'Accesso non approvato' end,
          case when p_approve then 'Ora puoi lavorare sull''area di ' || v_name
               else 'La richiesta per ' || v_name || ' non è stata accolta' end,
          'my-athletes', r.player_id, auth.uid());
  return jsonb_build_object('ok', true);
end $$;

-- i codici generati dall'atleta/AUVI possono essere dedicati anche al fisioterapista
create or replace function public.crm_generate_code(p_player_id bigint, p_label text default null, p_role text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_prefix text; v_code text; v_name text; i int := 0;
begin
  if not coalesce(current_crm_role() = 'admin'
          or (current_crm_role() = 'player' and p_player_id = current_player_api_id()), false) then
    raise exception 'Non autorizzato a generare codici per questo atleta';
  end if;
  if p_role is not null and p_role not in ('assicuratore','agente','preparatore','commercialista','fisioterapista') then
    raise exception 'Ruolo invito non valido: %', p_role;
  end if;
  select name into v_name from public.player where api_player_id = p_player_id;
  v_prefix := coalesce(nullif(upper(substr(regexp_replace(coalesce(v_name,''), '[^a-zA-Z]', '', 'g'), 1, 3)), ''), 'ATL');
  loop
    v_code := v_prefix || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.crm_access_codes where code = v_code);
    i := i + 1; if i > 25 then raise exception 'Generazione codice non riuscita'; end if;
  end loop;
  insert into public.crm_access_codes (code, player_id, label, role, created_by)
  values (v_code, p_player_id, nullif(trim(coalesce(p_label, '')), ''), p_role, auth.uid());
  return jsonb_build_object('ok', true, 'code', v_code);
end $$;

-- 3) referenti dell'atleta: + fisioterapista -----------------------------------
create or replace view public.crm_athlete_team as
 with members as (
   select a.player_id, 'agente'::text as role, 1 as sort, pr.name, pr.title, pr.photo_url,
          pr.email, pr.phone, pr.whatsapp, pr.agency_name
     from crm_agent_athletes a join crm_agent_profile pr on pr.agent_id = a.agent_id
   union all
   select t.player_id, 'preparatore', 2, pr.name, pr.headline, pr.photo_url,
          pr.contacts ->> 'email', pr.contacts ->> 'phone', pr.contacts ->> 'whatsapp', null
     from fitness_trainer_athletes t join fitness_coach_profile pr on pr.trainer_id = t.trainer_id
   union all
   select i.player_id, 'assicuratore', 3, pr.name, pr.title, pr.photo_url,
          pr.email, pr.phone, pr.whatsapp, pr.agency_name
     from crm_insurer_athletes i join crm_insurer_profile pr on pr.insurer_id = i.insurer_id
   union all
   select x.player_id, 'commercialista', 4, pr.name, pr.title, pr.photo_url,
          pr.email, pr.phone, pr.whatsapp, pr.agency_name
     from crm_tax_athletes x join crm_tax_profile pr on pr.advisor_id = x.advisor_id
   union all
   select f.player_id, 'fisioterapista', 5, pr.name, pr.title, pr.photo_url,
          pr.email, pr.phone, pr.whatsapp, pr.clinic_name
     from crm_physio_athletes f join crm_physio_profile pr on pr.physio_id = f.physio_id
 )
 select player_id, role, sort, name, title, photo_url, email, phone, whatsapp, agency_name
   from members m
  where exists (select 1 from crm_profiles me where me.id = auth.uid() and me.role = 'admin')
     or exists (select 1 from crm_profiles me where me.id = auth.uid() and me.player_api_id = m.player_id)
     or exists (select 1 from crm_agent_athletes z where z.agent_id = auth.uid() and z.player_id = m.player_id)
     or exists (select 1 from fitness_trainer_athletes z where z.trainer_id = auth.uid() and z.player_id = m.player_id)
     or exists (select 1 from crm_insurer_athletes z where z.insurer_id = auth.uid() and z.player_id = m.player_id)
     or exists (select 1 from crm_tax_athletes z where z.advisor_id = auth.uid() and z.player_id = m.player_id)
     or exists (select 1 from crm_physio_athletes z where z.physio_id = auth.uid() and z.player_id = m.player_id);
revoke all on public.crm_athlete_team from anon;

-- 4) invito generato dal professionista -----------------------------------------
alter table public.crm_access_codes alter column player_id drop not null;
alter table public.crm_access_codes add column if not exists pro_id uuid references auth.users(id) on delete cascade;
alter table public.crm_access_codes add column if not exists pro_role text;

-- un codice del professionista non si usa per collegare un altro professionista
create or replace function public.crm_request_access(p_code text, p_message text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_player bigint; v_name text; v_role text; v_who text; v_mail text; v_prof text; c record;
begin
  v_role := current_crm_role();
  if v_role is null or v_role not in ('assicuratore','agente','preparatore','commercialista','fisioterapista') then
    raise exception 'Solo i professionisti possono collegarsi a un atleta';
  end if;
  select * into c from public.crm_access_codes
   where upper(code) = upper(trim(p_code)) and status = 'active' and pro_id is null;
  if c is null then
    return jsonb_build_object('ok', false, 'error', 'Codice non valido o gia utilizzato');
  end if;
  if c.role is not null and c.role <> v_role then
    return jsonb_build_object('ok', false, 'error', 'Questo codice e per un altro tipo di professionista');
  end if;
  v_player := c.player_id;
  select name into v_name from public.player where api_player_id = v_player;
  perform public.crm_link_pro(auth.uid(), v_role, v_player);
  update public.crm_access_codes set status = 'used', used_by = auth.uid(), used_at = now() where id = c.id and status = 'active';
  select full_name, email into v_who, v_mail from public.crm_profiles where id = auth.uid();
  v_prof := public.crm_pro_display_name(auth.uid(), v_role);
  v_who := coalesce(nullif(trim(coalesce(v_prof,'')), ''), v_who, v_mail);
  insert into public.crm_access_requests
    (requester_id, requester_role, player_id, message, requester_name, requester_email, status, decided_at, decided_by)
  values (auth.uid(), v_role, v_player, p_message, v_who, v_mail, 'approvata', now(), auth.uid())
  on conflict (requester_id, player_id) do update
    set status='approvata', message=excluded.message, created_at=now(),
        requester_name=excluded.requester_name, requester_email=excluded.requester_email,
        decided_at=now(), decided_by=auth.uid();
  insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
  values ('admin', 'Nuovo collegamento',
          coalesce(v_who,'Un professionista') || ' (' || v_role || ') si e collegato a ' || v_name, 'access-requests', v_player, auth.uid());
  insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
  values ('player', 'Nuovo collegamento',
          coalesce(v_who,'Un professionista') || ' (' || v_role || ') si e collegato alla tua area', 'access-requests', v_player, auth.uid());
  return jsonb_build_object('ok', true, 'player', v_name);
end $$;

-- nome pubblico del professionista (profilo del suo ruolo)
create or replace function public.crm_pro_display_name(p_pro uuid, p_role text)
returns text language sql stable security definer set search_path = public as $$
  select case p_role
    when 'assicuratore' then (select name from crm_insurer_profile where insurer_id = p_pro)
    when 'agente' then (select name from crm_agent_profile where agent_id = p_pro)
    when 'preparatore' then (select name from fitness_coach_profile where trainer_id = p_pro)
    when 'commercialista' then (select name from crm_tax_profile where advisor_id = p_pro)
    when 'fisioterapista' then (select name from crm_physio_profile where physio_id = p_pro)
  end;
$$;
revoke execute on function public.crm_pro_display_name(uuid, text) from public, anon, authenticated;

-- il professionista crea un suo codice invito
create or replace function public.crm_pro_create_invite(p_label text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_role text := current_crm_role(); v_code text; i int := 0;
begin
  if v_role is null or v_role not in ('assicuratore','agente','preparatore','commercialista','fisioterapista') then
    raise exception 'Solo i professionisti possono creare un invito';
  end if;
  loop
    v_code := 'AUVI-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.crm_access_codes where code = v_code);
    i := i + 1; if i > 25 then raise exception 'Generazione codice non riuscita'; end if;
  end loop;
  insert into public.crm_access_codes (code, player_id, label, role, created_by, pro_id, pro_role)
  values (v_code, null, nullif(trim(coalesce(p_label, '')), ''), null, auth.uid(), auth.uid(), v_role);
  return jsonb_build_object('ok', true, 'code', v_code);
end $$;
revoke execute on function public.crm_pro_create_invite(text) from public, anon;
grant execute on function public.crm_pro_create_invite(text) to authenticated;

-- i miei inviti (professionista)
create or replace function public.crm_pro_list_invites()
returns table (id uuid, code text, label text, status text, created_at timestamptz, used_at timestamptz, player_name text)
language sql stable security definer set search_path = public as $$
  select c.id, c.code, c.label, c.status, c.created_at, c.used_at, p.name
    from crm_access_codes c left join player p on p.api_player_id = c.player_id
   where c.pro_id = auth.uid()
   order by c.created_at desc;
$$;
revoke execute on function public.crm_pro_list_invites() from public, anon;
grant execute on function public.crm_pro_list_invites() to authenticated;

-- l'atleta accetta l'invito di un professionista (è lui a confermare il collegamento)
create or replace function public.crm_accept_pro_invite(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c record; v_player bigint := current_player_api_id(); v_who text; v_pname text; v_mail text;
begin
  if current_crm_role() <> 'player' or v_player is null then
    raise exception 'Solo l''atleta puo accettare un invito';
  end if;
  select * into c from public.crm_access_codes
   where upper(code) = upper(trim(p_code)) and status = 'active' and pro_id is not null;
  if c is null then
    return jsonb_build_object('ok', false, 'error', 'Codice non valido o gia utilizzato');
  end if;
  perform public.crm_link_pro(c.pro_id, c.pro_role, v_player);
  update public.crm_access_codes set status = 'used', used_by = auth.uid(), used_at = now(), player_id = v_player
   where id = c.id and status = 'active';
  select email into v_mail from public.crm_profiles where id = c.pro_id;
  v_who := coalesce(nullif(trim(coalesce(public.crm_pro_display_name(c.pro_id, c.pro_role), '')), ''), v_mail);
  select name into v_pname from public.player where api_player_id = v_player;
  insert into public.crm_access_requests
    (requester_id, requester_role, player_id, message, requester_name, requester_email, status, decided_at, decided_by)
  values (c.pro_id, c.pro_role, v_player, 'Invito accettato dall''atleta', v_who, v_mail, 'approvata', now(), auth.uid())
  on conflict (requester_id, player_id) do update
    set status='approvata', decided_at=now(), decided_by=auth.uid();
  insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
  values (c.pro_role, 'Nuovo atleta collegato', coalesce(v_pname, 'Un atleta') || ' ha accettato il tuo invito', 'my-athletes', v_player, auth.uid());
  insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
  values ('admin', 'Nuovo collegamento', coalesce(v_who, 'Un professionista') || ' (' || c.pro_role || ') collegato a ' || coalesce(v_pname, ''), 'access-requests', v_player, auth.uid());
  return jsonb_build_object('ok', true, 'pro', v_who, 'role', c.pro_role);
end $$;
revoke execute on function public.crm_accept_pro_invite(text) from public, anon;
grant execute on function public.crm_accept_pro_invite(text) to authenticated;
