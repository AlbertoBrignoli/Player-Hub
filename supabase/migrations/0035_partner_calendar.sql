-- Servizi partner nel calendario dell'atleta (05/10/2026)
-- Regola di Alberto: report, comunicazioni e materiali del servizio restano DENTRO l'app.
-- L'atleta riceve la notifica, apre il calendario e trova il report o la proposta di call
-- con l'orario: un tocco e basta. Documenti caricati nell'app (bucket service-files),
-- video e file pesanti come link scaricabile.
-- Il partner non scrive direttamente su crm_events: passa da due funzioni controllate.

alter table public.crm_events
  add column if not exists service_request_id uuid references public.crm_service_requests(id) on delete set null,
  add column if not exists link_url text;
create index if not exists idx_events_service_req on public.crm_events (service_request_id);

-- il partner vede (e puo' ritirare finche' non confermati) gli impegni delle proprie richieste
drop policy if exists p_events_partner_read on public.crm_events;
create policy p_events_partner_read on public.crm_events for select to authenticated
  using (service_request_id is not null and crm_is_request_partner(service_request_id));
drop policy if exists p_events_partner_del on public.crm_events;
create policy p_events_partner_del on public.crm_events for delete to authenticated
  using (service_request_id is not null and crm_is_request_partner(service_request_id)
         and created_by = auth.uid() and coalesce(request_status, '') <> 'confermata');

-- commenti / "chiedi modifica" dell'atleta arrivano anche al partner
create or replace function public.crm_event_visible(p_event uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from crm_events e where e.id = p_event and (
    crm_manages_player(e.player_id)
    or (crm_team_sees(e.player_id) and (e.visibility = 'team' or e.created_by = auth.uid()))
    or (e.service_request_id is not null and crm_is_request_partner(e.service_request_id))));
$$;

create or replace function public.crm_event_comment_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare e record; v_role text; v_who text;
begin
  select * into e from crm_events where id = new.event_id;
  select role into v_role from crm_profiles where id = new.author_id;
  new.author_role := v_role;
  if v_role = 'partner' then
    v_who := coalesce((select s.partner_name from crm_service_requests r join crm_services s on s.id = r.service_id
                       where r.id = e.service_request_id), 'Partner');
  else
    v_who := coalesce(nullif(trim(coalesce(public.crm_pro_display_name(new.author_id, v_role), '')), ''),
                      (select full_name from crm_profiles where id = new.author_id), initcap(coalesce(v_role, '')));
  end if;
  if v_role in ('preparatore','assicuratore','commercialista','fisioterapista','agente','partner') then
    insert into crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('player',
            case when new.kind = 'modifica' then v_who || ' chiede una modifica: ' else v_who || ' ha commentato: ' end || e.title,
            left(new.body, 140), 'agenda?event=' || e.id, e.player_id, new.author_id);
  elsif e.proposed_by_role = 'partner' and e.service_request_id is not null then
    insert into crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('partner', case when new.kind = 'modifica' then 'Modifica richiesta: ' else 'Nuovo commento: ' end || e.title,
            left(new.body, 140), 'partner-home?req=' || e.service_request_id, e.player_id, new.author_id);
  elsif e.proposed_by_role in ('preparatore','assicuratore','commercialista','fisioterapista','agente') then
    insert into crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values (e.proposed_by_role, 'Nuovo commento: ' || e.title, left(new.body, 140), 'agenda', e.player_id, new.author_id);
  end if;
  return new;
end $$;

-- risposta dell'atleta a una proposta: al partner arriva con il link alla sua richiesta
create or replace function public.crm_event_confirmed()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_quando text; v_title text;
begin
  if new.request_status is distinct from old.request_status
     and new.request_status in ('confermata','rifiutata','modifica_richiesta') then
    v_quando := to_char(new.start_at at time zone 'Europe/Rome', 'DD/MM/YYYY HH24:MI');
    v_title := case new.request_status
      when 'confermata' then 'Confermato: '
      when 'rifiutata' then 'Non accettato: '
      else 'Modifica richiesta: ' end || new.title;
    if new.proposed_by_role = 'partner' and new.service_request_id is not null then
      insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
      values ('partner', v_title, v_quando || coalesce(' · ' || nullif(new.change_note, ''), ''),
              'partner-home?req=' || new.service_request_id, new.player_id, auth.uid());
      insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
      values ('admin', v_title, v_quando || coalesce(' · ' || nullif(new.change_note, ''), ''),
              'agenda?event=' || new.id, new.player_id, auth.uid());
    elsif new.proposed_by_role in ('preparatore','assicuratore','commercialista','fisioterapista','agente') then
      insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
      values (new.proposed_by_role, v_title,
              v_quando || coalesce(' · ' || nullif(new.change_note, ''), ''), 'agenda', new.player_id, auth.uid());
    elsif new.request_status in ('confermata','rifiutata') then
      insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
      values ('player', case when new.request_status = 'confermata' then 'Richiesta confermata: ' || new.title
                             else 'Richiesta non accolta: ' || new.title end,
              v_quando, 'agenda', new.player_id, auth.uid());
    end if;
  end if;
  return new;
end $$;

-- messaggi del thread creati dalle funzioni qui sotto: la notifica la mandano loro (una sola)
create or replace function public.crm_srm_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record; v_role text; v_partner uuid; v_who text; v_route text;
begin
  select * into r from crm_service_requests where id = new.request_id;
  select role into v_role from crm_profiles where id = new.author_id;
  select partner_user_id into v_partner from crm_services where id = r.service_id;
  new.author_role := v_role;
  if v_role = 'partner' then
    v_who := coalesce((select partner_name from crm_services where id = r.service_id), 'Partner');
  else
    v_who := coalesce((select full_name from crm_profiles where id = new.author_id), initcap(coalesce(v_role, '')));
  end if;
  new.author_name := v_who;
  if coalesce(current_setting('auvi.silent_thread', true), '') = '1' then return new; end if;
  v_route := 'services?req=' || r.id;
  if v_role <> 'player' then
    insert into crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('player', v_who || ' · ' || coalesce(r.service_title, 'servizio'),
            coalesce(left(new.body, 140), 'Nuovo file: ' || new.file_name), v_route, r.player_id, new.author_id);
  end if;
  if v_role not in ('admin','creator') then
    insert into crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('admin', v_who || ' · ' || coalesce(r.service_title, 'servizio'),
            coalesce(left(new.body, 140), 'Nuovo file: ' || new.file_name), v_route, r.player_id, new.author_id);
  end if;
  if v_role <> 'partner' and v_partner is not null then
    insert into crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('partner', 'Messaggio da ' || coalesce(r.player_name, 'atleta'),
            coalesce(left(new.body, 140), 'Nuovo file: ' || new.file_name), 'partner-home?req=' || r.id, r.player_id, new.author_id);
  end if;
  return new;
end $$;

-- il partner propone una call: entra nel calendario dell'atleta "da confermare"
create or replace function public.crm_partner_propose_call(
  p_req uuid, p_start timestamptz, p_minutes int default 45, p_link text default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r record; v_partner text; v_id uuid; v_quando text;
begin
  if not crm_is_request_partner(p_req) then raise exception 'Richiesta non tua'; end if;
  if p_start is null or p_start < now() - interval '1 hour' then raise exception 'Scegli una data futura'; end if;
  select * into r from crm_service_requests where id = p_req;
  select partner_name into v_partner from crm_services where id = r.service_id;
  insert into crm_events (player_id, title, type, start_at, end_at, link_url, notes, created_by,
                          assignee_role, request_status, proposed_by_role, visibility, service_request_id)
  values (r.player_id, 'Call con ' || coalesce(v_partner, 'il partner'), 'call', p_start,
          p_start + make_interval(mins => greatest(coalesce(p_minutes, 45), 10)),
          nullif(trim(coalesce(p_link, '')), ''), nullif(trim(coalesce(p_note, '')), ''), auth.uid(),
          'player', 'da_confermare', 'partner', 'privato', p_req)
  returning id into v_id;
  v_quando := to_char(p_start at time zone 'Europe/Rome', 'DD/MM HH24:MI');
  perform set_config('auvi.silent_thread', '1', true);
  insert into crm_service_request_messages (request_id, author_id, body)
  values (p_req, auth.uid(), 'Proposta una call per ' || v_quando || coalesce(' · ' || nullif(trim(p_note), ''), ''));
  perform set_config('auvi.silent_thread', '', true);
  insert into crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
  values ('player', coalesce(v_partner, 'Il partner') || ' propone una call',
          v_quando || ' · tocca per confermare', 'agenda?event=' || v_id, r.player_id, auth.uid());
  insert into crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
  values ('admin', coalesce(v_partner, 'Partner') || ' · call proposta a ' || coalesce(r.player_name, 'atleta'),
          v_quando, 'agenda?event=' || v_id, r.player_id, auth.uid());
  -- prima consegna o call: la richiesta passa in lavorazione senza una seconda notifica
  if r.status = 'aperta' then
    perform set_config('auvi.silent_thread', '1', true);
    update crm_service_requests set status = 'in_carico', updated_at = now() where id = p_req;
    perform set_config('auvi.silent_thread', '', true);
  end if;
  return v_id;
end $$;

-- il partner consegna un report (file caricato nell'app) e/o un link scaricabile (video, file pesanti)
create or replace function public.crm_partner_deliver(
  p_req uuid, p_title text, p_file_path text default null, p_file_name text default null,
  p_file_size bigint default null, p_link text default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r record; v_partner text; v_id uuid; v_att jsonb := '[]'::jsonb; v_link text;
begin
  if not crm_is_request_partner(p_req) then raise exception 'Richiesta non tua'; end if;
  v_link := nullif(trim(coalesce(p_link, '')), '');
  if p_file_path is null and v_link is null then raise exception 'Allega un file o un link'; end if;
  if p_file_path is not null and split_part(p_file_path, '/', 1) <> p_req::text then raise exception 'Percorso file non valido'; end if;
  if v_link is not null and v_link !~* '^https?://' then raise exception 'Il link deve iniziare con https://'; end if;
  select * into r from crm_service_requests where id = p_req;
  select partner_name into v_partner from crm_services where id = r.service_id;
  if p_file_path is not null then
    v_att := jsonb_build_array(jsonb_build_object('name', coalesce(p_file_name, 'Report'), 'path', p_file_path,
                                                  'size', p_file_size, 'bucket', 'service-files'));
  end if;
  insert into crm_events (player_id, title, type, start_at, attachments, link_url, notes, created_by,
                          proposed_by_role, visibility, service_request_id)
  values (r.player_id, coalesce(nullif(trim(p_title), ''), 'Report') , 'report', now(), v_att, v_link,
          nullif(trim(coalesce(p_note, '')), ''), auth.uid(), 'partner', 'privato', p_req)
  returning id into v_id;
  perform set_config('auvi.silent_thread', '1', true);
  insert into crm_service_request_messages (request_id, author_id, body, file_path, file_name)
  values (p_req, auth.uid(), coalesce(nullif(trim(p_title), ''), 'Report') || coalesce(' · ' || v_link, '')
          || coalesce(' · ' || nullif(trim(p_note), ''), ''), p_file_path, p_file_name);
  perform set_config('auvi.silent_thread', '', true);
  insert into crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
  values ('player', coalesce(v_partner, 'Il partner') || ': ' || coalesce(nullif(trim(p_title), ''), 'report pronto'),
          'È nel tuo calendario · tocca per aprirlo', 'agenda?event=' || v_id, r.player_id, auth.uid());
  insert into crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
  values ('admin', coalesce(v_partner, 'Partner') || ' · report consegnato a ' || coalesce(r.player_name, 'atleta'),
          coalesce(nullif(trim(p_title), ''), 'Report'), 'agenda?event=' || v_id, r.player_id, auth.uid());
  -- prima consegna o call: la richiesta passa in lavorazione senza una seconda notifica
  if r.status = 'aperta' then
    perform set_config('auvi.silent_thread', '1', true);
    update crm_service_requests set status = 'in_carico', updated_at = now() where id = p_req;
    perform set_config('auvi.silent_thread', '', true);
  end if;
  return v_id;
end $$;

revoke execute on function public.crm_partner_propose_call(uuid, timestamptz, int, text, text),
  public.crm_partner_deliver(uuid, text, text, text, bigint, text, text) from public, anon;
grant execute on function public.crm_partner_propose_call(uuid, timestamptz, int, text, text),
  public.crm_partner_deliver(uuid, text, text, text, bigint, text, text) to authenticated;

-- stato della richiesta cambiato dalle funzioni partner: nessuna notifica doppia
create or replace function public.crm_service_req_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_atleta text; v_partner uuid;
begin
  select name into v_atleta from public.player where api_player_id = new.player_id;
  select partner_user_id into v_partner from public.crm_services where id = new.service_id;

  if tg_op = 'INSERT' then
    insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('admin', 'Richiesta servizio: ' || coalesce(new.service_title, 'servizio'),
            coalesce(v_atleta, 'Atleta') || coalesce(' · ' || new.message, ''),
            'services?req=' || new.id, new.player_id, auth.uid());
    if v_partner is not null then
      insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
      values ('partner', 'Nuova richiesta da ' || coalesce(v_atleta, 'un atleta'),
              coalesce(new.service_title, 'servizio') || ' · questionario compilato',
              'partner-home?req=' || new.id, new.player_id, auth.uid());
    end if;
    return new;
  end if;

  if coalesce(current_setting('auvi.silent_thread', true), '') = '1' then return new; end if;
  if new.status is distinct from old.status then
    insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('player',
            case new.status
              when 'in_carico' then 'Richiesta presa in carico: '
              when 'completata' then 'Richiesta completata: '
              when 'annullata' then 'Richiesta annullata: '
              else 'Aggiornamento: ' end || coalesce(new.service_title, 'servizio'),
            coalesce(new.internal_note, ''), 'services?req=' || new.id, new.player_id, auth.uid());
    if current_crm_role() = 'partner' then
      insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
      values ('admin', 'Partner: ' || coalesce(new.service_title, 'servizio') || ' · ' ||
              case new.status when 'in_carico' then 'in lavorazione' when 'completata' then 'completata' else new.status end,
              coalesce(v_atleta, 'Atleta'), 'services?req=' || new.id, new.player_id, auth.uid());
    end if;
  end if;
  return new;
end $$;
