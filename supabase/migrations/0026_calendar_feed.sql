-- Calendario sul telefono (feed iCalendar in abbonamento)
-- Ogni utente ha un link personale .../functions/v1/calendar-feed?t=<token>
-- da aggiungere al Calendario di iPhone/Mac o a Google Calendar (e quindi al widget
-- Calendario nativo). Le app calendario non mandano header: l'unica autorizzazione
-- è il token nel link, lungo e non indovinabile, rigenerabile dall'utente.
--
-- 1) crm_calendar_tokens: un token per utente. Leggibile solo dal proprietario,
--    scrivibile solo tramite crm_calendar_token().
-- 2) crm_calendar_token(p_rotate): crea/restituisce (o rigenera) il token dell'utente loggato.
-- 3) crm_calendar_feed_items(p_token): le voci del feed. La chiama SOLO la Edge Function
--    calendar-feed con la service role. Replica le regole RLS di matches / crm_events /
--    crm_editorial per l'utente del token (qui auth.uid() non esiste: niente JWT).
--    Il feed non mostra mai più di quanto l'utente vede nell'app.

-- 1) Tabella token --------------------------------------------------------------
create table if not exists public.crm_calendar_tokens (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  token       text unique not null default encode(extensions.gen_random_bytes(24), 'hex'),
  created_at  timestamptz not null default now(),
  last_access timestamptz
);

alter table public.crm_calendar_tokens enable row level security;

revoke all on public.crm_calendar_tokens from public, anon, authenticated;
grant select on public.crm_calendar_tokens to authenticated;
grant select on public.crm_calendar_tokens to service_role;  -- controllo esistenza token nella Edge Function

drop policy if exists p_caltoken_select_own on public.crm_calendar_tokens;
create policy p_caltoken_select_own on public.crm_calendar_tokens for select to authenticated
  using (user_id = auth.uid());

-- 2) Token dell'utente loggato (p_rotate = true: il vecchio link smette di funzionare)
create or replace function public.crm_calendar_token(p_rotate boolean default false)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_token text;
begin
  if v_uid is null then
    raise exception 'Serve un utente autenticato';
  end if;

  if p_rotate then
    insert into public.crm_calendar_tokens as t (user_id) values (v_uid)
    on conflict (user_id) do update
      set token = encode(extensions.gen_random_bytes(24), 'hex'),
          created_at = now(), last_access = null
    returning t.token into v_token;
  else
    insert into public.crm_calendar_tokens (user_id) values (v_uid)
    on conflict (user_id) do nothing;
    select token into v_token from public.crm_calendar_tokens where user_id = v_uid;
  end if;

  return v_token;
end $$;

revoke execute on function public.crm_calendar_token(boolean) from public, anon;
grant execute on function public.crm_calendar_token(boolean) to authenticated;

-- 3) Voci del feed ---------------------------------------------------------------
-- Visibilità per ruolo (specchio delle policy RLS al 29/09/2026):
--   admin, creator   → tutte le partite, tutti gli impegni, tutto l'editoriale
--   player           → il proprio atleta (crm_profiles.player_api_id): partite, impegni, editoriale
--   agente           → atleti in crm_agent_athletes: partite, impegni, editoriale
--   preparatore      → atleti in fitness_trainer_athletes: partite, impegni (niente editoriale)
--   assicuratore     → atleti in crm_insurer_athletes: solo impegni creati da lui
--                      (la RLS di matches non gli apre le partite)
--   commercialista   → atleti in crm_tax_athletes: solo impegni creati da lui (idem)
--   brand            → atleti in crm_brand_athletes del suo brand: solo partite
--                      (la RLS di crm_events non apre impegni al brand)
--   fisioterapista   → niente: oggi nessuna policy su matches/crm_events lo include
-- Finestra: da 30 giorni fa a 120 giorni avanti. Richieste 'rifiutata' escluse,
-- uscite 'pubblicato' più vecchie di 7 giorni escluse.
create or replace function public.crm_calendar_feed_items(p_token text)
returns table (
  uid         text,
  kind        text,
  title       text,
  starts_at   timestamptz,
  ends_at     timestamptz,
  all_day     boolean,
  location    text,
  description text,
  url_route   text
)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_user     uuid;
  v_role     text;
  v_all      boolean := false;   -- admin/creator: nessun filtro per atleta
  v_ids      bigint[] := '{}';   -- atleti visibili (se non v_all)
  v_brand    uuid;
  v_multi    boolean;            -- più di un atleta visibile → prefisso col nome
  v_from     timestamptz := now() - interval '30 days';
  v_to       timestamptz := now() + interval '120 days';
  v_matches  boolean := false;
  v_events   text := 'none';     -- 'none' | 'all' | 'own'
  v_editor   boolean := false;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then
    return;
  end if;

  update public.crm_calendar_tokens t set last_access = now()
   where t.token = p_token
  returning t.user_id into v_user;
  if v_user is null then
    return;
  end if;

  select p.role::text into v_role from public.crm_profiles p where p.id = v_user;
  if v_role is null then
    return;
  end if;

  -- Atleti visibili: stesse tabelle di collegamento degli helper RLS
  if v_role in ('admin', 'creator') then
    v_all := true;
  elsif v_role = 'player' then
    select array_remove(array[p.player_api_id], null) into v_ids
      from public.crm_profiles p where p.id = v_user;
  elsif v_role = 'agente' then
    select coalesce(array_agg(distinct a.player_id), '{}') into v_ids
      from public.crm_agent_athletes a where a.agent_id = v_user;
  elsif v_role = 'preparatore' then
    select coalesce(array_agg(distinct a.player_id), '{}') into v_ids
      from public.fitness_trainer_athletes a where a.trainer_id = v_user;
  elsif v_role = 'assicuratore' then
    select coalesce(array_agg(distinct a.player_id), '{}') into v_ids
      from public.crm_insurer_athletes a where a.insurer_id = v_user;
  elsif v_role = 'commercialista' then
    select coalesce(array_agg(distinct a.player_id), '{}') into v_ids
      from public.crm_tax_athletes a where a.advisor_id = v_user;
  elsif v_role = 'brand' then
    -- come crm_my_brand_id(): brand dalla whitelist email, altrimenti brand di cui è owner
    select coalesce(
      (select w.brand_id
         from public.crm_allowed_emails w
         join public.crm_profiles p on lower(p.email) = lower(w.email)
        where p.id = v_user and w.brand_id is not null
        limit 1),
      (select b.id from public.crm_brands b where b.owner_id = v_user limit 1)
    ) into v_brand;
    if v_brand is not null then
      select coalesce(array_agg(distinct ba.player_id), '{}') into v_ids
        from public.crm_brand_athletes ba where ba.brand_id = v_brand;
    end if;
  else
    return;  -- fisioterapista o ruolo sconosciuto: feed vuoto
  end if;

  -- Cosa entra nel feed per ciascun ruolo
  v_matches := v_role in ('admin', 'creator', 'player', 'agente', 'preparatore', 'brand');
  v_events  := case
                 when v_role in ('admin', 'creator', 'player', 'agente', 'preparatore') then 'all'
                 when v_role in ('assicuratore', 'commercialista') then 'own'
                 else 'none'
               end;
  v_editor  := v_role in ('admin', 'creator', 'player', 'agente');

  if not v_all and coalesce(array_length(v_ids, 1), 0) = 0 then
    return;
  end if;

  v_multi := case when v_all then (select count(*) > 1 from public.player)
                  else array_length(v_ids, 1) > 1 end;

  -- a) Partite: una voce per fixture anche se più atleti visibili la giocano
  if v_matches then
    return query
    with m as (
      select mt.*, coalesce(pl.name, mt.player_name) as athlete
        from public.matches mt
        left join public.player pl on pl.api_player_id = mt.player_id
       where mt.match_date between v_from and v_to
         and (v_all or mt.player_id = any (v_ids))
    ), g as (
      select coalesce(m.fixture_id::text, m.match_uid, m.id::text) as fx,
             min(m.match_date) as match_date,
             max(m.home_team) as home_team,
             max(m.away_team) as away_team,
             max(m.stadium) as stadium,
             max(m.league) as league,
             max(m.round) as round,
             string_agg(distinct m.athlete, ', ') as athletes
        from m
       group by 1
    )
    select 'm-' || g.fx,
           'match'::text,
           case when v_multi and g.athletes is not null then g.athletes || ' · ' else '' end
             || coalesce(g.home_team, '?') || ' – ' || coalesce(g.away_team, '?'),
           g.match_date,
           g.match_date + interval '2 hours',
           false,
           g.stadium,
           nullif(concat_ws(' · ', g.league, g.round), ''),
           'performance'::text
      from g;
  end if;

  -- b) Impegni in agenda
  if v_events <> 'none' then
    return query
    select 'e-' || e.id::text,
           'event'::text,
           case when v_multi and pl.name is not null then pl.name || ' · ' else '' end
             || coalesce(nullif(e.title, ''), 'Impegno')
             || case when e.request_status = 'da_confermare' then ' (da confermare)' else '' end,
           e.start_at,
           case when e.type = 'scadenza' then null
                else coalesce(nullif(e.end_at, e.start_at), e.start_at + interval '1 hour') end,
           coalesce(e.type = 'scadenza', false),
           e.location,
           nullif(concat_ws(E'\n', initcap(e.type), nullif(e.notes, '')), ''),
           'agenda'::text
      from public.crm_events e
      left join public.player pl on pl.api_player_id = e.player_id
     where e.start_at between v_from and v_to
       and coalesce(e.request_status, '') <> 'rifiutata'
       and (v_all or e.player_id = any (v_ids))
       and (v_events = 'all' or e.created_by = v_user);
  end if;

  -- c) Uscite editoriali (giornata intera)
  if v_editor then
    return query
    select 'ed-' || ed.id::text,
           'editorial'::text,
           'Uscita · ' || case when v_multi and pl.name is not null then pl.name || ' · ' else '' end
             || coalesce(nullif(ed.title, ''), 'Uscita'),
           (ed.entry_date + time '12:00') at time zone 'Europe/Athens',
           null::timestamptz,
           true,
           null::text,
           nullif(concat_ws(' · ', ed.type, replace(ed.status, '_', ' ')), ''),
           'editorial?entry=' || ed.id::text
      from public.crm_editorial ed
      left join public.player pl on pl.api_player_id = ed.player_id
     where ed.entry_date between (v_from at time zone 'Europe/Athens')::date
                             and (v_to at time zone 'Europe/Athens')::date
       and (v_all or ed.player_id = any (v_ids))
       and not (ed.status = 'pubblicato'
                and ed.entry_date < ((now() - interval '7 days') at time zone 'Europe/Athens')::date);
  end if;
end $$;

revoke execute on function public.crm_calendar_feed_items(text) from public, anon, authenticated;
grant execute on function public.crm_calendar_feed_items(text) to service_role;
