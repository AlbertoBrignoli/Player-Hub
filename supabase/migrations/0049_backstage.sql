-- Backstage (25/10/2026): il profilo privato dell'atleta dentro il Player Hub.
-- L'atleta pubblica "momenti" (foto + testo) scegliendo chi li vede:
--   team  = solo chi lavora con lui (team, AUVI)
--   brand = brand ammessi
--   pro   = tutti i professionisti ammessi (brand, scout, procuratori esterni…)
-- Chi non è del team chiede l'accesso spiegando il perché; l'atleta accetta o rifiuta.
-- Niente like né commenti: i professionisti ammessi possono solo "salvare" un momento o dire
-- "mi interessa" (segnali privati per l'atleta). Le visite si registrano (come LinkedIn),
-- con la possibilità per chi guarda di restare in incognito.

create table if not exists public.bs_profiles (
  player_id bigint primary key,
  bio text,
  passions text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists public.bs_posts (
  id uuid primary key default gen_random_uuid(),
  player_id bigint not null,
  author_id uuid default auth.uid(),
  image_path text,
  caption text,
  category text not null default 'Lifestyle'
    check (category in ('Dietro le quinte', 'Lifestyle', 'Passioni', 'Allenamento', 'Valori')),
  audience text not null default 'pro' check (audience in ('team', 'brand', 'pro')),
  created_at timestamptz not null default now()
);
create index if not exists idx_bs_posts_player on public.bs_posts(player_id, created_at desc);

create table if not exists public.bs_access (
  id uuid primary key default gen_random_uuid(),
  player_id bigint not null,
  requester_id uuid not null default auth.uid(),
  requester_role text,
  requester_name text,
  requester_org text,
  reason text,
  message text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'revoked')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (player_id, requester_id)
);

create table if not exists public.bs_views (
  id uuid primary key default gen_random_uuid(),
  player_id bigint not null,
  viewer_id uuid not null,
  post_id uuid references public.bs_posts(id) on delete cascade,
  incognito boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_bs_views_player on public.bs_views(player_id, created_at desc);

create table if not exists public.bs_signals (
  post_id uuid not null references public.bs_posts(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  kind text not null check (kind in ('save', 'interest')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, kind)
);

create table if not exists public.bs_viewer_settings (
  user_id uuid primary key default auth.uid(),
  incognito boolean not null default false
);

alter table public.bs_profiles enable row level security;
alter table public.bs_posts enable row level security;
alter table public.bs_access enable row level security;
alter table public.bs_views enable row level security;
alter table public.bs_signals enable row level security;
alter table public.bs_viewer_settings enable row level security;

-- chi "possiede" il Backstage: l'atleta, AUVI, e il suo team (che vede tutto)
create or replace function public.bs_is_owner(p_player bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select current_crm_role() in ('admin', 'creator')
      or (current_crm_role() = 'player' and current_player_api_id() = p_player);
$$;
create or replace function public.bs_is_inner(p_player bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select bs_is_owner(p_player) or crm_team_sees(p_player);
$$;
-- accesso approvato per un esterno
create or replace function public.bs_access_role(p_player bigint)
returns text language sql stable security definer set search_path = public as $$
  select requester_role from bs_access
   where player_id = p_player and requester_id = auth.uid() and status = 'approved';
$$;
create or replace function public.bs_can_see_post(p_post uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from bs_posts p where p.id = p_post and (
      bs_is_inner(p.player_id)
      or (p.audience = 'pro' and bs_access_role(p.player_id) is not null)
      or (p.audience = 'brand' and bs_access_role(p.player_id) = 'brand')));
$$;

drop policy if exists p_bs_profiles_read on public.bs_profiles;
create policy p_bs_profiles_read on public.bs_profiles for select to authenticated using (true);
drop policy if exists p_bs_profiles_write on public.bs_profiles;
create policy p_bs_profiles_write on public.bs_profiles for all to authenticated
  using (bs_is_owner(player_id)) with check (bs_is_owner(player_id));

drop policy if exists p_bs_posts_read on public.bs_posts;
create policy p_bs_posts_read on public.bs_posts for select to authenticated using (bs_can_see_post(id));
drop policy if exists p_bs_posts_write on public.bs_posts;
create policy p_bs_posts_write on public.bs_posts for all to authenticated
  using (bs_is_owner(player_id)) with check (bs_is_owner(player_id));

drop policy if exists p_bs_access_read on public.bs_access;
create policy p_bs_access_read on public.bs_access for select to authenticated
  using (requester_id = auth.uid() or bs_is_inner(player_id));

drop policy if exists p_bs_viewer_settings_own on public.bs_viewer_settings;
create policy p_bs_viewer_settings_own on public.bs_viewer_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- bs_views e bs_signals: solo tramite le funzioni qui sotto (nessuna policy diretta)

-- nome e organizzazione di chi guarda/chiede
create or replace function public.bs_who(p_user uuid)
returns table (role text, name text, org text) language sql stable security definer set search_path = public as $$
  select p.role::text,
         coalesce(nullif(p.full_name, ''), split_part(p.email, '@', 1)),
         coalesce((select b.name from crm_brands b where b.owner_id = p_user limit 1),
                  (select a.agency_name from crm_agent_profile a where a.agent_id = p_user))
    from crm_profiles p where p.id = p_user;
$$;

-- elenco degli atleti con il Backstage (per i brand): dati di presentazione + stato dell'accesso
create or replace function public.bs_directory()
returns table (player_id bigint, name text, photo_url text, team_name text, pos text,
               bio text, passions text[], posts int, my_status text)
language sql stable security definer set search_path = public as $$
  select pl.api_player_id, pl.name, pl.photo_url, pl.team_name, pl."position",
         bp.bio, coalesce(bp.passions, '{}'),
         (select count(*)::int from bs_posts x where x.player_id = pl.api_player_id),
         (select a.status from bs_access a where a.player_id = pl.api_player_id and a.requester_id = auth.uid())
    from player pl left join bs_profiles bp on bp.player_id = pl.api_player_id
   where pl.api_player_id is not null and auth.uid() is not null
   order by pl.name;
$$;

-- richiesta di accesso (non per tifosi: solo utenti del Player Hub, che sono invitati da AUVI)
create or replace function public.bs_request_access(p_player bigint, p_reason text, p_message text default null)
returns text language plpgsql security definer set search_path = public as $$
declare w record; v_status text;
begin
  if auth.uid() is null or current_crm_role() = 'player' then raise exception 'Non autorizzato'; end if;
  if bs_is_inner(p_player) then return 'approved'; end if;
  select * into w from bs_who(auth.uid());
  select status into v_status from bs_access where player_id = p_player and requester_id = auth.uid();
  if v_status in ('approved', 'pending') then return v_status; end if;
  if v_status = 'declined' then raise exception 'Richiesta non accettata'; end if;
  insert into bs_access (player_id, requester_id, requester_role, requester_name, requester_org, reason, message)
  values (p_player, auth.uid(), w.role, w.name, w.org, nullif(trim(p_reason), ''), nullif(trim(coalesce(p_message, '')), ''))
  on conflict (player_id, requester_id) do update set status = 'pending', reason = excluded.reason,
    message = excluded.message, created_at = now(), decided_at = null;
  insert into crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
  values ('player', 'Nuova richiesta per il tuo Backstage',
          coalesce(w.org, w.name, 'Un professionista') || ' vorrebbe vedere il tuo Backstage',
          'backstage?tab=reqs', p_player, auth.uid());
  return 'pending';
end $$;

-- l'atleta (o AUVI) accetta, rifiuta o revoca
create or replace function public.bs_decide(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if p_status not in ('approved', 'declined', 'revoked') then raise exception 'Stato non valido'; end if;
  select * into r from bs_access where id = p_id;
  if r is null or not bs_is_owner(r.player_id) then raise exception 'Non autorizzato'; end if;
  update bs_access set status = p_status, decided_at = now() where id = p_id;
end $$;

-- incognito di chi guarda
create or replace function public.bs_set_incognito(p_on boolean)
returns void language sql security definer set search_path = public as $$
  insert into bs_viewer_settings (user_id, incognito) values (auth.uid(), p_on)
  on conflict (user_id) do update set incognito = excluded.incognito;
$$;

-- registra una visita (profilo o momento); il team e l'atleta non contano; max 1 ogni 30 minuti
create or replace function public.bs_log_view(p_player bigint, p_post uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or bs_is_inner(p_player) then return; end if;
  if bs_access_role(p_player) is null and p_post is not null then return; end if;
  if exists (select 1 from bs_views where player_id = p_player and viewer_id = auth.uid()
               and post_id is not distinct from p_post and created_at > now() - interval '30 minutes') then return; end if;
  insert into bs_views (player_id, viewer_id, post_id, incognito)
  values (p_player, auth.uid(), p_post,
          coalesce((select incognito from bs_viewer_settings where user_id = auth.uid()), false));
end $$;

-- salva / mi interessa (toggle); "mi interessa" avvisa l'atleta
create or replace function public.bs_signal(p_post uuid, p_kind text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_player bigint; w record;
begin
  if p_kind not in ('save', 'interest') or not bs_can_see_post(p_post) then raise exception 'Non autorizzato'; end if;
  select player_id into v_player from bs_posts where id = p_post;
  if bs_is_inner(v_player) then raise exception 'Non serve: è il tuo team'; end if;
  if exists (select 1 from bs_signals where post_id = p_post and user_id = auth.uid() and kind = p_kind) then
    delete from bs_signals where post_id = p_post and user_id = auth.uid() and kind = p_kind;
    return false;
  end if;
  insert into bs_signals (post_id, user_id, kind) values (p_post, auth.uid(), p_kind);
  if p_kind = 'interest' then
    select * into w from bs_who(auth.uid());
    insert into crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('player', 'Un brand è interessato', coalesce(w.org, w.name, 'Un professionista') || ' è interessato a un tuo momento',
            'backstage?tab=ins', v_player, auth.uid());
    insert into crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('admin', 'Interesse dal Backstage', coalesce(w.org, w.name, 'Un professionista') || ' è interessato a un momento dell''atleta',
            'backstage?tab=ins', v_player, auth.uid());
  end if;
  return true;
end $$;

-- i miei segnali su un atleta (per colorare i pulsanti)
create or replace function public.bs_my_signals(p_player bigint)
returns table (post_id uuid, kind text) language sql stable security definer set search_path = public as $$
  select s.post_id, s.kind from bs_signals s join bs_posts p on p.id = s.post_id
   where p.player_id = p_player and s.user_id = auth.uid();
$$;

-- per l'atleta e il team: visite (aggregate per persona, incognito anonimi)
create or replace function public.bs_visits(p_player bigint, p_days int default 30)
returns table (viewer_key text, name text, org text, role text, incognito boolean,
               profile_views int, posts_seen int, last_at timestamptz)
language sql stable security definer set search_path = public as $$
  select case when bool_or(v.incognito) then md5(v.viewer_id::text) else v.viewer_id::text end,
         case when bool_or(v.incognito) then null else (select name from bs_who(v.viewer_id)) end,
         case when bool_or(v.incognito) then null else (select org from bs_who(v.viewer_id)) end,
         (select role from bs_who(v.viewer_id)),
         bool_or(v.incognito),
         count(*) filter (where v.post_id is null)::int,
         count(distinct v.post_id)::int,
         max(v.created_at)
    from bs_views v
   where v.player_id = p_player and v.created_at > now() - make_interval(days => p_days)
     and bs_is_inner(p_player)
   group by v.viewer_id
   order by max(v.created_at) desc;
$$;

-- visite per giorno (grafico 7 giorni)
create or replace function public.bs_visits_daily(p_player bigint)
returns table (d date, n int) language sql stable security definer set search_path = public as $$
  select g::date, (select count(distinct viewer_id)::int from bs_views v
                    where v.player_id = p_player and v.created_at::date = g::date)
    from generate_series(current_date - 6, current_date, interval '1 day') g
   where bs_is_inner(p_player);
$$;

-- per l'atleta e il team: salvataggi, interesse e visualizzazioni per momento
create or replace function public.bs_post_stats(p_player bigint)
returns table (post_id uuid, saves int, interests int, views int, who text[])
language sql stable security definer set search_path = public as $$
  select p.id,
         (select count(*)::int from bs_signals s where s.post_id = p.id and s.kind = 'save'),
         (select count(*)::int from bs_signals s where s.post_id = p.id and s.kind = 'interest'),
         (select count(distinct v.viewer_id)::int from bs_views v where v.post_id = p.id),
         (select array_agg(distinct coalesce((select org from bs_who(s.user_id)), (select name from bs_who(s.user_id))))
            from bs_signals s where s.post_id = p.id)
    from bs_posts p where p.player_id = p_player and bs_is_inner(p_player);
$$;

do $$ declare f text; begin
  foreach f in array array['bs_directory()', 'bs_request_access(bigint,text,text)', 'bs_decide(uuid,text)',
    'bs_set_incognito(boolean)', 'bs_log_view(bigint,uuid)', 'bs_signal(uuid,text)', 'bs_my_signals(bigint)',
    'bs_visits(bigint,integer)', 'bs_visits_daily(bigint)', 'bs_post_stats(bigint)', 'bs_who(uuid)',
    'bs_is_owner(bigint)', 'bs_is_inner(bigint)', 'bs_access_role(bigint)', 'bs_can_see_post(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- foto dei momenti: bucket privato, cartella = id dell'atleta
insert into storage.buckets (id, name, public, file_size_limit)
values ('backstage', 'backstage', false, 15728640)
on conflict (id) do update set public = false;

-- la cartella è l'id dell'atleta: controllo numerico prima del cast (le policy valgono su tutto storage.objects)
create or replace function public.bs_owns_path(p_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare f text := split_part(p_name, '/', 1);
begin
  if f !~ '^[0-9]{1,18}$' then return false; end if;
  return bs_is_owner(f::bigint);
end $$;
revoke execute on function public.bs_owns_path(text) from public, anon;
grant execute on function public.bs_owns_path(text) to authenticated;

drop policy if exists p_backstage_insert on storage.objects;
create policy p_backstage_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'backstage' and public.bs_owns_path(objects.name));
drop policy if exists p_backstage_delete on storage.objects;
create policy p_backstage_delete on storage.objects for delete to authenticated using (
  bucket_id = 'backstage' and public.bs_owns_path(objects.name));
drop policy if exists p_backstage_read on storage.objects;
create policy p_backstage_read on storage.objects for select to authenticated using (
  bucket_id = 'backstage' and exists (
    select 1 from public.bs_posts p where p.image_path = objects.name and public.bs_can_see_post(p.id)));
