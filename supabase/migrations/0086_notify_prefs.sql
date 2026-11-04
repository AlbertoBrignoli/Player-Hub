-- Preferenze notifiche sul telefono, per utente: tipi spenti e silenzio notturno.
-- Valgono solo per il push: in app (campanella) le notifiche restano tutte.
create table if not exists public.crm_notify_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  muted text[] not null default '{}',          -- chat | impegni | task | documenti | servizi | media
  quiet boolean not null default false,        -- silenzio notturno attivo
  quiet_from smallint not null default 23,     -- ora di inizio (0-23)
  quiet_to smallint not null default 7,        -- ora di fine (0-23)
  tz text not null default 'Europe/Rome',
  updated_at timestamptz not null default now()
);
alter table public.crm_notify_prefs enable row level security;
drop policy if exists notify_prefs_own on public.crm_notify_prefs;
create policy notify_prefs_own on public.crm_notify_prefs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
