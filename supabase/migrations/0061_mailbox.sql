-- Casella di posta dell'atleta dentro l'app (es. albertobrignoli@hub.auviagency.com).
-- Tutte le mail che riguardano la gestione dell'atleta arrivano lì: le riceve Resend
-- sul sottodominio hub.auviagency.com (MX dedicato, la posta Aruba di auviagency.com
-- resta com'è) e la funzione mail-inbound le salva qui. Le risposte partono da mail-send.
-- Le legge solo l'atleta titolare e AUVI (admin): non lo staff, che ci scrive da fuori.

create table if not exists public.crm_mailboxes (
  player_id bigint primary key,
  address text not null unique,
  display_name text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_mail_messages (
  id uuid primary key default gen_random_uuid(),
  player_id bigint not null references public.crm_mailboxes(player_id) on delete cascade,
  thread_id uuid not null,
  direction text not null check (direction in ('in', 'out')),
  provider_id text unique,
  message_id text,
  in_reply_to text,
  from_addr text,
  from_name text,
  to_addrs text[] not null default '{}',
  cc_addrs text[] not null default '{}',
  subject text,
  text_body text,
  html_body text,
  attachments jsonb not null default '[]',
  read_at timestamptz,
  archived_at timestamptz,
  sent_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists crm_mail_messages_player_idx on public.crm_mail_messages (player_id, created_at desc);
create index if not exists crm_mail_messages_thread_idx on public.crm_mail_messages (thread_id, created_at);
create index if not exists crm_mail_messages_msgid_idx on public.crm_mail_messages (message_id);

create or replace function public.crm_mail_access(p_api bigint)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select current_crm_role() = 'admin'
      or (current_crm_role() = 'player' and p_api = current_player_api_id());
$$;

alter table public.crm_mailboxes enable row level security;
alter table public.crm_mail_messages enable row level security;

create policy p_mailboxes_read on public.crm_mailboxes
  for select using (crm_mail_access(player_id));
create policy p_mailboxes_admin on public.crm_mailboxes
  for all using (current_crm_role() = 'admin') with check (current_crm_role() = 'admin');

-- lettura e stato (letto / archiviato); l'inserimento passa solo dalle funzioni (service role)
create policy p_mail_read on public.crm_mail_messages
  for select using (crm_mail_access(player_id));
create policy p_mail_state on public.crm_mail_messages
  for update using (crm_mail_access(player_id)) with check (crm_mail_access(player_id));

-- allegati: mail-files/<player_id>/<cartella>/<file>
insert into storage.buckets (id, name, public, file_size_limit)
values ('mail-files', 'mail-files', false, 26214400)
on conflict (id) do nothing;

-- controllo sul percorso senza cast diretto nella policy: le policy di storage.objects
-- valgono per tutti i bucket e un cast a bigint su cartelle non numeriche farebbe errore
create or replace function public.crm_mail_path_ok(p_name text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9]+$'
              then crm_mail_access(split_part(p_name, '/', 1)::bigint) else false end;
$$;

create policy p_mail_files_read on storage.objects for select using (
  bucket_id = 'mail-files' and public.crm_mail_path_ok(name));
create policy p_mail_files_upload on storage.objects for insert with check (
  bucket_id = 'mail-files' and public.crm_mail_path_ok(name));

-- Alberto Brignoli (AEK) per primo, per provarla
insert into public.crm_mailboxes (player_id, address, display_name)
values (31538, 'albertobrignoli@hub.auviagency.com', 'Alberto Brignoli')
on conflict (player_id) do nothing;
