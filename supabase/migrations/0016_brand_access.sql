-- Accesso BRAND (es. Under Armour): ruolo dedicato, scheda brand, numeri social,
-- chat per-brand isolata. Il brand vede SOLO il media kit (numeri) + la propria scheda
-- + la chat col brand; nulla delle aree interne (contratti, media, editoriale, ecc.).

-- 1) Ruolo brand
alter table public.crm_profiles drop constraint if exists crm_profiles_role_check;
alter table public.crm_profiles add constraint crm_profiles_role_check
  check (role in ('admin', 'player', 'creator', 'brand', 'preparatore'));
alter table public.crm_allowed_emails drop constraint if exists crm_allowed_emails_role_check;
alter table public.crm_allowed_emails add constraint crm_allowed_emails_role_check
  check (role in ('admin', 'player', 'creator', 'brand', 'preparatore'));

-- 2) Numeri social del giocatore (per il media kit). Inserimento manuale;
--    la sync live da Instagram richiede setup Meta (vedi note app).
alter table public.player add column if not exists instagram_followers integer;
alter table public.player add column if not exists instagram_engagement numeric;   -- % engagement medio
alter table public.player add column if not exists instagram_reach integer;          -- reach medio/post
alter table public.player add column if not exists audience_note text;               -- nota pubblico/demografia
alter table public.player add column if not exists instagram_connected boolean not null default false;

-- 3) Scheda brand: compilata dal brand e/o da AUVI
create table if not exists public.crm_brands (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,  -- login del brand
  name text not null,
  contact_name text,
  contact_role text,
  email text,
  phone text,
  website text,
  logo_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.crm_brands enable row level security;
drop policy if exists p_brands_team on public.crm_brands;
create policy p_brands_team on public.crm_brands for all to authenticated
  using (public.crm_my_role() in ('admin', 'player')) with check (public.crm_my_role() in ('admin', 'player'));
drop policy if exists p_brands_own on public.crm_brands;
create policy p_brands_own on public.crm_brands for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create or replace function public.crm_touch_updated_at_brands()
returns trigger language plpgsql security invoker set search_path = public as $$
begin new.updated_at := now(); return new; end; $$;
drop trigger if exists trg_brands_touch on public.crm_brands;
create trigger trg_brands_touch before update on public.crm_brands
  for each row execute function public.crm_touch_updated_at_brands();

-- id del brand posseduto dall'utente corrente
create or replace function public.crm_my_brand_id()
returns uuid language sql stable security invoker set search_path = public as $$
  select id from public.crm_brands where owner_id = auth.uid() limit 1;
$$;
revoke execute on function public.crm_my_brand_id() from anon;

-- 4) Chat: canale sui messaggi. null/'team' = chat interna; 'brand:<uuid>' = chat col brand.
alter table public.crm_messages add column if not exists channel text;

drop policy if exists p_messages_read on public.crm_messages;
create policy p_messages_read on public.crm_messages for select to authenticated using (
  (coalesce(channel, 'team') = 'team' and public.crm_my_role() in ('admin', 'player'))
  or (channel = 'brand:' || public.crm_my_brand_id()::text)
  or (channel like 'brand:%' and public.crm_my_role() in ('admin', 'player'))
);
drop policy if exists p_messages_insert on public.crm_messages;
create policy p_messages_insert on public.crm_messages for insert to authenticated with check (
  sender_id = auth.uid() and (
    (coalesce(channel, 'team') = 'team' and public.crm_my_role() in ('admin', 'player'))
    or (channel = 'brand:' || public.crm_my_brand_id()::text)
    or (channel like 'brand:%' and public.crm_my_role() in ('admin', 'player'))
  )
);

-- 5) Isolamento: il brand NON vede le aree interne (solo player/matches/stats/news = media kit)
drop policy if exists p_contracts_read on public.crm_contracts;
create policy p_contracts_read on public.crm_contracts for select to authenticated using (public.crm_my_role() <> 'brand');
drop policy if exists p_documents_read on public.crm_documents;
create policy p_documents_read on public.crm_documents for select to authenticated using (public.crm_my_role() <> 'brand');
drop policy if exists p_payments_read on public.crm_payments;
create policy p_payments_read on public.crm_payments for select to authenticated using (public.crm_my_role() <> 'brand');
drop policy if exists p_sponsors_read on public.crm_sponsors;
create policy p_sponsors_read on public.crm_sponsors for select to authenticated using (public.crm_my_role() <> 'brand');
drop policy if exists p_events_read on public.crm_events;
create policy p_events_read on public.crm_events for select to authenticated using (public.crm_my_role() <> 'brand');
drop policy if exists p_tasks_read on public.crm_tasks;
create policy p_tasks_read on public.crm_tasks for select to authenticated using (public.crm_my_role() <> 'brand');
drop policy if exists p_editorial_select on public.crm_editorial;
create policy p_editorial_select on public.crm_editorial for select to authenticated using (public.crm_my_role() <> 'brand');
drop policy if exists p_media_select on public.crm_media;
create policy p_media_select on public.crm_media for select to authenticated using (public.crm_my_role() <> 'brand');

-- Storage: file interni non accessibili al brand
drop policy if exists p_crmdoc_read on storage.objects;
create policy p_crmdoc_read on storage.objects for select to authenticated
  using (bucket_id = 'crm-documents' and public.crm_my_role() <> 'brand');
drop policy if exists p_crmmedia_read on storage.objects;
create policy p_crmmedia_read on storage.objects for select to authenticated
  using (bucket_id = 'crm-media' and public.crm_my_role() <> 'brand');
