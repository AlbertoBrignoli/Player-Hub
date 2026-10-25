-- "Collega Instagram" con un tocco (25/10/2026): l'atleta accede a Instagram e autorizza,
-- senza Pagina Facebook né pannello sviluppatori (Instagram API with Instagram Login).
-- Un'unica app Meta di AUVI: App ID e Secret li inserisce AUVI dall'app e restano in cp_secrets.
-- Il codice di ritorno lo scambia la Edge Function ig-oauth-callback; la sincronizzazione
-- notturna (sync-instagram) tiene i numeri sempre aggiornati e rinnova il token.

alter table public.cp_social_accounts add column if not exists auth_type text not null default 'facebook';
do $$ begin
  alter table public.cp_social_accounts add constraint cp_social_accounts_auth_type_chk check (auth_type in ('facebook', 'instagram_login'));
exception when duplicate_object then null; end $$;

-- stato temporaneo del login (15 minuti): lega il ritorno da Instagram all'atleta giusto
create table if not exists public.crm_ig_oauth_states (
  state text primary key,
  player_id bigint not null,
  user_id uuid not null,
  created_at timestamptz not null default now()
);
alter table public.crm_ig_oauth_states enable row level security;   -- nessuna policy: solo funzioni

-- AUVI: imposta l'app Instagram (App ID e Secret)
create or replace function public.crm_set_ig_app(p_app_id text, p_secret text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if current_crm_role() <> 'admin' then raise exception 'Solo AUVI'; end if;
  if nullif(trim(p_app_id), '') is not null then
    insert into cp_secrets (key, value) values ('ig_app_id', trim(p_app_id))
    on conflict (key) do update set value = excluded.value;
  end if;
  if nullif(trim(p_secret), '') is not null then
    insert into cp_secrets (key, value) values ('ig_app_secret', trim(p_secret))
    on conflict (key) do update set value = excluded.value;
  end if;
end $$;

create or replace function public.crm_ig_app_status()
returns json language sql stable security definer set search_path = public as $$
  select case when current_crm_role() <> 'admin' then null else json_build_object(
    'app_id', (select value from cp_secrets where key = 'ig_app_id'),
    'has_secret', exists (select 1 from cp_secrets where key = 'ig_app_secret')) end;
$$;

-- avvio del collegamento: crea lo stato e restituisce l'App ID per aprire il login Instagram
create or replace function public.crm_ig_oauth_start(p_player bigint)
returns json language plpgsql security definer set search_path = public as $$
declare v_app text; v_state text;
begin
  if not crm_manages_player(p_player) then raise exception 'Non autorizzato'; end if;
  select value into v_app from cp_secrets where key = 'ig_app_id';
  if v_app is null or not exists (select 1 from cp_secrets where key = 'ig_app_secret') then
    raise exception 'Instagram non è ancora configurato: AUVI deve inserire l''app Instagram';
  end if;
  delete from crm_ig_oauth_states where created_at < now() - interval '1 day';
  v_state := encode(extensions.gen_random_bytes(24), 'hex');
  insert into crm_ig_oauth_states (state, player_id, user_id) values (v_state, p_player, auth.uid());
  return json_build_object('state', v_state, 'app_id', v_app);
end $$;

-- stato del collegamento visibile all'atleta e al suo team (senza token)
create or replace function public.crm_ig_status(p_player bigint)
returns json language sql stable security definer set search_path = public as $$
  select case when not (crm_manages_player(p_player) or crm_team_sees(p_player)) then null else (
    select json_build_object(
      'connected', s.access_token is not null,
      'auth_type', s.auth_type, 'username', s.ig_username,
      'last_sync_at', s.last_sync_at, 'last_sync_status', s.last_sync_status, 'last_sync_error', s.last_sync_error,
      'token_expires_at', s.token_expires_at,
      'followers', p.instagram_followers, 'engagement', p.instagram_engagement, 'reach', p.instagram_reach)
    from (select 1) one
    left join cp_social_accounts s on s.player_id = p_player and s.platform = 'instagram'
    left join player p on p.api_player_id = p_player) end;
$$;

-- scollega (l'atleta o chi lo gestisce)
create or replace function public.crm_ig_disconnect(p_player bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not crm_manages_player(p_player) then raise exception 'Non autorizzato'; end if;
  delete from cp_social_accounts where player_id = p_player and platform = 'instagram';
  update player set instagram_connected = false where api_player_id = p_player;
end $$;

revoke execute on function public.crm_set_ig_app(text, text) from public, anon;
revoke execute on function public.crm_ig_app_status() from public, anon;
revoke execute on function public.crm_ig_oauth_start(bigint) from public, anon;
revoke execute on function public.crm_ig_status(bigint) from public, anon;
revoke execute on function public.crm_ig_disconnect(bigint) from public, anon;
grant execute on function public.crm_set_ig_app(text, text) to authenticated;
grant execute on function public.crm_ig_app_status() to authenticated;
grant execute on function public.crm_ig_oauth_start(bigint) to authenticated;
grant execute on function public.crm_ig_status(bigint) to authenticated;
grant execute on function public.crm_ig_disconnect(bigint) to authenticated;
