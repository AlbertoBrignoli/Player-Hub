-- Allegati in chat e archivio personale "I miei file" (20/10/2026).
-- Nelle chat (dirette e dello staff) si allegano foto e documenti. Ogni file ricevuto si salva
-- da solo nella cartella "Ricevuti in chat" di chi lo riceve (professionisti e AUVI), che poi
-- può creare cartelle sue e spostarci i file. I file sono privati: bucket chat-files, li apre
-- solo chi può leggere il messaggio o chi li ha nel proprio archivio.

alter table public.crm_messages add column if not exists file_path text;
alter table public.crm_messages add column if not exists file_name text;
alter table public.crm_messages add column if not exists file_mime text;
alter table public.crm_messages add column if not exists file_size bigint;
alter table public.crm_staff_messages add column if not exists file_path text;
alter table public.crm_staff_messages add column if not exists file_name text;
alter table public.crm_staff_messages add column if not exists file_mime text;
alter table public.crm_staff_messages add column if not exists file_size bigint;

create table if not exists public.crm_file_folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  name text not null,
  system_key text,                       -- 'chat' = "Ricevuti in chat" (creata dal sistema)
  created_at timestamptz not null default now()
);
create unique index if not exists uq_file_folders_system on public.crm_file_folders(owner_id, system_key) where system_key is not null;

create table if not exists public.crm_my_files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  folder_id uuid references public.crm_file_folders(id) on delete set null,
  name text not null,
  file_path text not null,
  mime text,
  size bigint,
  from_user uuid,
  from_name text,
  from_role text,
  player_id bigint,
  source text not null default 'upload',   -- 'chat' | 'staff' | 'upload'
  created_at timestamptz not null default now()
);
create index if not exists idx_my_files_owner on public.crm_my_files(owner_id, created_at desc);
create index if not exists idx_my_files_path on public.crm_my_files(file_path);

alter table public.crm_file_folders enable row level security;
alter table public.crm_my_files enable row level security;
drop policy if exists p_file_folders_own on public.crm_file_folders;
create policy p_file_folders_own on public.crm_file_folders for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid() and system_key is null);
drop policy if exists p_my_files_own on public.crm_my_files;
create policy p_my_files_own on public.crm_my_files for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and split_part(file_path, '/', 1) = auth.uid()::text);
-- spostare un file ricevuto (percorso di chi l'ha mandato) nelle proprie cartelle
drop policy if exists p_my_files_update on public.crm_my_files;
create policy p_my_files_update on public.crm_my_files for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- cartella "Ricevuti in chat" (la crea al primo file)
create or replace function public.crm_chat_folder(p_owner uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  select id into v from crm_file_folders where owner_id = p_owner and system_key = 'chat';
  if v is null then
    insert into crm_file_folders (owner_id, name, system_key) values (p_owner, 'Ricevuti in chat', 'chat')
    on conflict do nothing returning id into v;
    if v is null then select id into v from crm_file_folders where owner_id = p_owner and system_key = 'chat'; end if;
  end if;
  return v;
end $$;
revoke execute on function public.crm_chat_folder(uuid) from public, anon, authenticated;

-- chi riceve un messaggio della chat diretta (atleta ↔ professionista / AUVI / brand)
create or replace function public.crm_direct_recipients(p_channel text, p_player bigint, p_sender uuid, p_sender_role text)
returns setof uuid language sql stable security definer set search_path = public as $$
  select x from (
    -- scrive l'atleta: riceve chi segue quel canale
    select id as x from crm_profiles where p_sender_role = 'player' and coalesce(p_channel, 'team') = 'team' and role = 'admin'
    union select agent_id from crm_agent_athletes where p_sender_role = 'player' and p_channel = 'agente' and player_id = p_player
    union select insurer_id from crm_insurer_athletes where p_sender_role = 'player' and p_channel = 'assicuratore' and player_id = p_player
    union select advisor_id from crm_tax_athletes where p_sender_role = 'player' and p_channel = 'commercialista' and player_id = p_player
    union select trainer_id from fitness_trainer_athletes where p_sender_role = 'player' and p_channel = 'fitness' and player_id = p_player
    union select physio_id from crm_physio_athletes where p_sender_role = 'player' and p_channel = 'fisioterapista' and player_id = p_player
    union select nutri_id from crm_nutri_athletes where p_sender_role = 'player' and p_channel = 'nutrizionista' and player_id = p_player
    union select owner_id from crm_brands where p_sender_role = 'player' and p_channel = 'brand:' || id::text
    -- scrive un professionista / AUVI / brand: riceve l'atleta (il suo archivio resta la chat)
    -- e, nel canale management, anche AUVI se scrive il procuratore
    union select id from crm_profiles where p_sender_role = 'agente' and coalesce(p_channel, 'team') = 'team' and role = 'admin'
  ) r where x is not null and x <> p_sender;
$$;
revoke execute on function public.crm_direct_recipients(text, bigint, uuid, text) from public, anon, authenticated;

-- l'allegato deve stare nella cartella di chi scrive (niente link a file altrui)
create or replace function public.crm_chat_file_check()
returns trigger language plpgsql as $$
begin
  if new.file_path is not null and split_part(new.file_path, '/', 1) <> coalesce(auth.uid()::text, '') then
    raise exception 'Allegato non valido';
  end if;
  return new;
end $$;
drop trigger if exists trg_messages_file_check on public.crm_messages;
create trigger trg_messages_file_check before insert on public.crm_messages
  for each row execute function public.crm_chat_file_check();
drop trigger if exists trg_staff_messages_file_check on public.crm_staff_messages;
create trigger trg_staff_messages_file_check before insert on public.crm_staff_messages
  for each row execute function public.crm_chat_file_check();

-- salvataggio automatico nell'archivio di chi riceve (solo professionisti e AUVI)
create or replace function public.crm_chat_file_save()
returns trigger language plpgsql security definer set search_path = public as $$
declare u uuid; v_player bigint; v_src text;
begin
  if new.file_path is null then return new; end if;
  if tg_table_name = 'crm_staff_messages' then
    select player_id into v_player from crm_staff_threads where id = new.thread_id;
    v_src := 'staff';
    for u in select user_id from crm_staff_members where thread_id = new.thread_id and user_id <> new.sender_id loop
      insert into crm_my_files (owner_id, folder_id, name, file_path, mime, size, from_user, from_name, from_role, player_id, source)
      values (u, crm_chat_folder(u), coalesce(new.file_name, 'file'), new.file_path, new.file_mime, new.file_size,
              new.sender_id, new.sender_name, new.sender_role, v_player, v_src);
    end loop;
  else
    for u in select r from crm_direct_recipients(new.channel, new.player_id, new.sender_id, new.sender_role) r
               join crm_profiles p on p.id = r where p.role <> 'player' loop
      insert into crm_my_files (owner_id, folder_id, name, file_path, mime, size, from_user, from_name, from_role, player_id, source)
      values (u, crm_chat_folder(u), coalesce(new.file_name, 'file'), new.file_path, new.file_mime, new.file_size,
              new.sender_id, new.sender_name, new.sender_role, new.player_id, 'chat');
    end loop;
  end if;
  return new;
end $$;
revoke execute on function public.crm_chat_file_save() from public, anon, authenticated;
drop trigger if exists trg_messages_file_save on public.crm_messages;
create trigger trg_messages_file_save after insert on public.crm_messages
  for each row execute function public.crm_chat_file_save();
drop trigger if exists trg_staff_messages_file_save on public.crm_staff_messages;
create trigger trg_staff_messages_file_save after insert on public.crm_staff_messages
  for each row execute function public.crm_chat_file_save();

-- bucket privato e permessi sui file
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-files', 'chat-files', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = 26214400;

drop policy if exists p_chat_files_insert on storage.objects;
create policy p_chat_files_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'chat-files' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists p_chat_files_read on storage.objects;
create policy p_chat_files_read on storage.objects for select to authenticated using (
  bucket_id = 'chat-files' and (
    (storage.foldername(objects.name))[1] = auth.uid()::text
    or exists (select 1 from public.crm_my_files f where f.file_path = objects.name and f.owner_id = auth.uid())
    or exists (select 1 from public.crm_messages m where m.file_path = objects.name)            -- RLS della chat
    or exists (select 1 from public.crm_staff_messages s where s.file_path = objects.name)));   -- RLS della chat staff
drop policy if exists p_chat_files_delete on storage.objects;
create policy p_chat_files_delete on storage.objects for delete to authenticated using (
  bucket_id = 'chat-files' and (storage.foldername(objects.name))[1] = auth.uid()::text
  and not exists (select 1 from public.crm_messages m where m.file_path = objects.name)
  and not exists (select 1 from public.crm_staff_messages s where s.file_path = objects.name));
