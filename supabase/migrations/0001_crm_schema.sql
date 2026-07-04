-- CRM di gestione 1:1 (AUVI x Giocatore) - tabelle crm_*
-- Non tocca le tabelle performance (player/matches/player_stats_api/news).

create table if not exists public.crm_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'player' check (role in ('admin','player')),
  created_at timestamptz not null default now()
);

create table if not exists public.crm_allowed_emails (
  email text primary key,
  role text not null default 'player' check (role in ('admin','player')),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_contracts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  counterpart text,
  type text default 'sportivo',
  start_date date,
  end_date date,
  salary_gross numeric,
  currency text default 'EUR',
  clauses jsonb default '[]'::jsonb,
  status text default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_documents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text default 'altro',
  file_path text,
  file_url text,
  size bigint,
  mime text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_payments (
  id uuid primary key default gen_random_uuid(),
  direction text not null default 'in',
  category text default 'altro',
  description text,
  amount numeric not null default 0,
  currency text default 'EUR',
  counterpart text,
  due_date date,
  paid boolean not null default false,
  paid_date date,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_sponsors (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  type text default 'sponsor',
  value numeric,
  currency text default 'EUR',
  start_date date,
  end_date date,
  status text default 'active',
  deliverables jsonb default '[]'::jsonb,
  contact text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type text default 'personale',
  start_at timestamptz not null,
  end_at timestamptz,
  location text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'todo',
  priority text default 'medium',
  assignee text default 'auvi',
  due_date date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references auth.users(id) on delete set null,
  sender_name text,
  sender_role text,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_crm_payments_due on public.crm_payments(due_date);
create index if not exists idx_crm_events_start on public.crm_events(start_at);
create index if not exists idx_crm_tasks_status on public.crm_tasks(status);
create index if not exists idx_crm_messages_created on public.crm_messages(created_at);
