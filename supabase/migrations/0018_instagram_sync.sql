-- 0018 — SYNC INSTAGRAM (Graph API Meta, senza servizi terzi)
-- Credenziali e stato del collegamento per atleta. Tabella ADMIN-ONLY:
-- token e app secret non devono mai essere leggibili da player/creator/brand.
-- La Edge Function `sync-instagram` (service role) legge qui, chiama la Graph API
-- e aggiorna player.instagram_* + cp_profiles.audience → il Commercial Score
-- si tiene aggiornato da solo.

create table if not exists public.cp_social_accounts (
  id uuid primary key default gen_random_uuid(),
  player_id bigint not null,
  platform text not null default 'instagram' check (platform in ('instagram')),
  app_id text,                -- App Meta (developers.facebook.com)
  app_secret text,
  access_token text,          -- user token; la function lo scambia/rinnova long-lived (60gg)
  token_expires_at timestamptz,
  ig_user_id text,            -- scoperto automaticamente dalla function al primo sync
  ig_username text,
  page_id text,
  history jsonb not null default '[]'::jsonb,  -- [{d:'2026-07-16', f: 67000}] per la crescita 30/90gg
  last_sync_at timestamptz,
  last_sync_status text,      -- ok | error
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_id, platform)
);

alter table public.cp_social_accounts enable row level security;
drop policy if exists p_cp_social_admin on public.cp_social_accounts;
create policy p_cp_social_admin on public.cp_social_accounts
  for all to authenticated using (public.crm_is_admin()) with check (public.crm_is_admin());

drop trigger if exists trg_cp_social_touch on public.cp_social_accounts;
create trigger trg_cp_social_touch before update on public.cp_social_accounts
  for each row execute function public.cp_touch_updated_at();

-- Secret di autenticazione del cron: generato PER-ISTANZA e custodito solo nel DB.
-- Tabella con RLS attiva e nessuna policy → invisibile via API; la legge solo il
-- service role (Edge Function) e il job pg_cron qui sotto.
create table if not exists public.cp_secrets (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now()
);
alter table public.cp_secrets enable row level security;

insert into public.cp_secrets (key, value)
values ('sync_secret', gen_random_uuid()::text || gen_random_uuid()::text)
on conflict (key) do nothing;

-- Cron notturno: sincronizza tutti gli account collegati alle 04:30 UTC.
-- NB per nuove istanze: sostituire l'URL con quello del progetto Supabase dell'atleta.
select cron.unschedule('sync-instagram') where exists (select 1 from cron.job where jobname = 'sync-instagram');
select cron.schedule(
  'sync-instagram',
  '30 4 * * *',
  $$select net.http_post(
      url := 'https://irdphiphumxsymttvfzq.supabase.co/functions/v1/sync-instagram',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-sync-secret',(select value from public.cp_secrets where key = 'sync_secret')
      ),
      body := '{}'::jsonb
  )$$
);
