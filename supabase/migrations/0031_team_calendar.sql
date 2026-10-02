-- Calendario condiviso con il team dell'atleta (02/10/2026)
-- Ogni professionista collegato all'atleta (procuratore, preparatore, assicuratore,
-- commercialista, fisioterapista) vede il calendario dell'atleta e può PROPORRE impegni
-- (sessioni, call, nutrizione, visite...). L'atleta conferma, chiede una modifica
-- (con nota) o rifiuta. Gli impegni "privati" dell'atleta restano suoi e di AUVI.

alter table public.crm_events
  add column if not exists proposed_by_role text,
  add column if not exists change_note text,
  add column if not exists visibility text not null default 'team';
alter table public.crm_events drop constraint if exists crm_events_visibility_chk;
alter table public.crm_events add constraint crm_events_visibility_chk check (visibility in ('team','privato'));

-- chi fa parte del team (professionista collegato) di un atleta
create or replace function public.crm_team_sees(p_api bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select crm_agent_sees(p_api) or crm_insurer_sees(p_api) or crm_tax_sees(p_api) or crm_physio_sees(p_api)
      or (current_crm_role() = 'preparatore' and fitness_can_manage(p_api));
$$;
revoke execute on function public.crm_team_sees(bigint) from public, anon;
grant execute on function public.crm_team_sees(bigint) to authenticated;

-- lettura: AUVI/atleta/procuratore come prima; tutto il team vede gli impegni non privati
drop policy if exists p_events_read on public.crm_events;
create policy p_events_read on public.crm_events for select to authenticated using (
  crm_manages_player(player_id)
  or (crm_team_sees(player_id) and (visibility = 'team' or created_by = auth.uid()))
);
-- il team NON modifica il calendario dell'atleta: propone impegni (che entrano solo con la
-- conferma dell'atleta) e può correggere/ritirare la PROPRIA proposta finché non è confermata
drop policy if exists p_events_team_ins on public.crm_events;
create policy p_events_team_ins on public.crm_events for insert to authenticated
  with check (crm_team_sees(player_id) and created_by = auth.uid() and fitness_program_id is null);
drop policy if exists p_events_team_upd on public.crm_events;
create policy p_events_team_upd on public.crm_events for update to authenticated
  using (crm_team_sees(player_id) and created_by = auth.uid()
         and coalesce(request_status, '') in ('da_confermare','modifica_richiesta','rifiutata'))
  with check (crm_team_sees(player_id) and created_by = auth.uid()
              and coalesce(request_status, '') in ('da_confermare','modifica_richiesta','rifiutata'));
drop policy if exists p_events_team_del on public.crm_events;
create policy p_events_team_del on public.crm_events for delete to authenticated
  using (crm_team_sees(player_id) and created_by = auth.uid()
         and coalesce(request_status, '') <> 'confermata');

-- interazione sugli impegni: commenti e richieste di modifica del team, senza toccare l'impegno
create table if not exists public.crm_event_comments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.crm_events(id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_role text,
  kind text not null default 'commento' check (kind in ('commento','modifica')),
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create index if not exists idx_event_comments_event on public.crm_event_comments (event_id, created_at);
alter table public.crm_event_comments enable row level security;

-- chi vede l'impegno ne vede i commenti; chi lo vede può commentare
create or replace function public.crm_event_visible(p_event uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from crm_events e where e.id = p_event and (
    crm_manages_player(e.player_id)
    or (crm_team_sees(e.player_id) and (e.visibility = 'team' or e.created_by = auth.uid()))));
$$;
revoke execute on function public.crm_event_visible(uuid) from public, anon;
grant execute on function public.crm_event_visible(uuid) to authenticated;

drop policy if exists p_evc_read on public.crm_event_comments;
create policy p_evc_read on public.crm_event_comments for select to authenticated using (crm_event_visible(event_id));
drop policy if exists p_evc_ins on public.crm_event_comments;
create policy p_evc_ins on public.crm_event_comments for insert to authenticated
  with check (author_id = auth.uid() and crm_event_visible(event_id));
drop policy if exists p_evc_del on public.crm_event_comments;
create policy p_evc_del on public.crm_event_comments for delete to authenticated using (author_id = auth.uid());
revoke all on public.crm_event_comments from anon;

create or replace function public.crm_event_comment_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare e record; v_role text; v_who text;
begin
  select * into e from crm_events where id = new.event_id;
  select role into v_role from crm_profiles where id = new.author_id;
  new.author_role := v_role;
  v_who := coalesce(nullif(trim(coalesce(public.crm_pro_display_name(new.author_id, v_role), '')), ''),
                    (select full_name from crm_profiles where id = new.author_id), initcap(coalesce(v_role, '')));
  -- avvisa l'atleta (se scrive il team) oppure chi ha proposto (se scrive l'atleta/AUVI)
  if v_role in ('preparatore','assicuratore','commercialista','fisioterapista','agente') then
    insert into crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('player',
            case when new.kind = 'modifica' then v_who || ' chiede una modifica: ' else v_who || ' ha commentato: ' end || e.title,
            left(new.body, 140), 'agenda', e.player_id, new.author_id);
  elsif e.proposed_by_role in ('preparatore','assicuratore','commercialista','fisioterapista','agente') then
    insert into crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values (e.proposed_by_role, 'Nuovo commento: ' || e.title, left(new.body, 140), 'agenda', e.player_id, new.author_id);
  end if;
  return new;
end $$;
drop trigger if exists trg_event_comment_notify on public.crm_event_comments;
create trigger trg_event_comment_notify before insert on public.crm_event_comments
  for each row execute function public.crm_event_comment_notify();
revoke execute on function public.crm_event_comment_notify() from public, anon, authenticated;

-- nuovo impegno: chi propone e chi deve confermare
create or replace function public.crm_event_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_role text; v_atleta text; v_quando text; v_who text;
begin
  select role into v_role from public.crm_profiles where id = new.created_by;
  select name into v_atleta from public.player where api_player_id = new.player_id;
  v_quando := to_char(new.start_at at time zone 'Europe/Rome', 'DD/MM/YYYY HH24:MI');
  new.proposed_by_role := coalesce(new.proposed_by_role, v_role);
  if v_role = 'player' then
    if new.request_status is null then new.request_status := 'da_confermare'; end if;
    if new.assignee_role is null then new.assignee_role := 'admin'; end if;
    insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('admin', 'Richiesta da ' || coalesce(v_atleta, 'atleta') || ': ' || new.title,
            v_quando || coalesce(' · ' || new.location, ''), 'agenda', new.player_id, new.created_by);
  elsif v_role in ('preparatore','assicuratore','commercialista','fisioterapista','agente')
        and new.fitness_program_id is null then
    -- proposta di un professionista: la conferma l'atleta
    new.request_status := 'da_confermare';
    new.assignee_role := 'player';
    v_who := coalesce(nullif(trim(coalesce(public.crm_pro_display_name(new.created_by, v_role), '')), ''), initcap(v_role));
    insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('player', 'Proposta da ' || v_who || ': ' || new.title,
            v_quando || coalesce(' · ' || new.location, '') || ' · da confermare', 'agenda', new.player_id, new.created_by);
  elsif v_role in ('admin','creator') then
    insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('player', 'Nuovo impegno: ' || new.title,
            v_quando || coalesce(' · ' || new.location, ''), 'agenda', new.player_id, new.created_by);
  end if;
  return new;
end $$;

-- il professionista corregge una proposta rimandata indietro: torna da confermare
create or replace function public.crm_event_reproposed()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_quando text;
begin
  if auth.uid() = new.created_by
     and new.proposed_by_role in ('preparatore','assicuratore','commercialista','fisioterapista','agente')
     and old.request_status in ('modifica_richiesta','rifiutata')
     and new.request_status is not distinct from old.request_status
     and (new.start_at, new.end_at, new.title, new.location, new.notes)
         is distinct from (old.start_at, old.end_at, old.title, old.location, old.notes) then
    new.request_status := 'da_confermare';
    v_quando := to_char(new.start_at at time zone 'Europe/Rome', 'DD/MM/YYYY HH24:MI');
    insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('player', 'Proposta aggiornata: ' || new.title, v_quando || ' · da confermare', 'agenda', new.player_id, auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists trg_event_reproposed on public.crm_events;
create trigger trg_event_reproposed before update on public.crm_events
  for each row execute function public.crm_event_reproposed();
revoke execute on function public.crm_event_reproposed() from public, anon, authenticated;

-- risposta dell'atleta (o di AUVI): avvisa chi ha proposto
create or replace function public.crm_event_confirmed()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_quando text; v_title text;
begin
  if new.request_status is distinct from old.request_status
     and new.request_status in ('confermata','rifiutata','modifica_richiesta') then
    v_quando := to_char(new.start_at at time zone 'Europe/Rome', 'DD/MM/YYYY HH24:MI');
    if new.proposed_by_role in ('preparatore','assicuratore','commercialista','fisioterapista','agente') then
      v_title := case new.request_status
        when 'confermata' then 'Confermato: '
        when 'rifiutata' then 'Non accettato: '
        else 'Modifica richiesta: ' end || new.title;
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

-- anche il procuratore è "team": niente più modifica libera del calendario dell'atleta,
-- propone come gli altri (resta la lettura completa via crm_manages_player)
drop policy if exists p_events_agent on public.crm_events;
