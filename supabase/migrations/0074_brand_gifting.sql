-- Brand › Gifting dedicato (30/10/2026): un brand partner regala una selezione di capi a
-- giocatori precisi. Il giocatore apre Brand → CiaoGym, sceglie capi e taglie, controlla
-- l'indirizzo (Profilo → Spedizioni) e invia: la richiesta arriva al suo AUVI Advisor,
-- che conferma la disponibilità e aggiorna lo stato. Nulla parte in automatico verso il brand.

-- AUVI Advisor assegnato all'atleta (gli advisor sono account admin).
-- Un admin che segue qualche atleta vede solo le richieste dei suoi; un admin senza
-- atleti assegnati è amministratore e le vede tutte. Senza advisor la richiesta resta
-- visibile a tutti gli admin, segnata "da assegnare".
create table if not exists public.crm_player_advisors (
  player_id bigint primary key,
  advisor_id uuid not null references public.crm_profiles(id) on delete cascade,
  assigned_at timestamptz not null default now()
);

create table if not exists public.crm_gift_offers (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references public.crm_brand_deals(id) on delete set null,
  brand_name text not null,
  title text not null,
  description text,
  recipients bigint[] not null default '{}',
  deadline timestamptz,                         -- ultimo istante utile per inviare (null = nessuna scadenza)
  deadline_tz text not null default 'Europe/Rome',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_gift_items (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.crm_gift_offers(id) on delete cascade,
  sort int not null default 0,
  name text not null,
  color text,
  url text not null,
  image_url text,                               -- foto ufficiale salvata all'inserimento (null = da recuperare)
  sizes text[] not null default '{}',           -- taglie lette dalla pagina prodotto (vuoto = taglia libera, da confermare)
  needs_confirm boolean not null default false, -- "Disponibilità per questo gifting da confermare con AUVI"
  admin_note text,                              -- problemi visibili solo ad AUVI (foto, colore…)
  unique (offer_id, url)
);

create table if not exists public.crm_gift_requests (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.crm_gift_offers(id) on delete cascade,
  player_id bigint not null,
  items jsonb not null,                         -- copia dei capi scelti: id, nome, colore, link, foto, taglia
  notes text,
  address jsonb not null,                       -- copia dell'indirizzo confermato all'invio
  status text not null default 'da_verificare'
    check (status in ('da_verificare', 'confermata', 'spedita', 'completata')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (offer_id, player_id)                  -- una sola richiesta per giocatore: niente doppioni
);

alter table public.crm_player_advisors enable row level security;
alter table public.crm_gift_offers enable row level security;
alter table public.crm_gift_items enable row level security;
alter table public.crm_gift_requests enable row level security;

-- l'admin vede le richieste di questo atleta?
create or replace function public.crm_gift_admin_sees(p_player bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select current_crm_role() = 'admin' and (
       not exists (select 1 from crm_player_advisors where advisor_id = auth.uid())
    or exists (select 1 from crm_player_advisors where player_id = p_player and advisor_id = auth.uid())
    or not exists (select 1 from crm_player_advisors where player_id = p_player));
$$;

create or replace function public.crm_gift_sees_offer(p_offer uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from crm_gift_offers o where o.id = p_offer and (
    current_crm_role() = 'admin'
    or (current_crm_role() = 'player' and o.active and current_player_api_id() = any (o.recipients))));
$$;

drop policy if exists p_player_advisors_admin on public.crm_player_advisors;
create policy p_player_advisors_admin on public.crm_player_advisors for all to authenticated
  using (current_crm_role() = 'admin') with check (current_crm_role() = 'admin');

drop policy if exists p_gift_offers_read on public.crm_gift_offers;
create policy p_gift_offers_read on public.crm_gift_offers for select to authenticated
  using (crm_gift_sees_offer(id));
drop policy if exists p_gift_offers_admin on public.crm_gift_offers;
create policy p_gift_offers_admin on public.crm_gift_offers for all to authenticated
  using (current_crm_role() = 'admin') with check (current_crm_role() = 'admin');

drop policy if exists p_gift_items_read on public.crm_gift_items;
create policy p_gift_items_read on public.crm_gift_items for select to authenticated
  using (crm_gift_sees_offer(offer_id));
drop policy if exists p_gift_items_admin on public.crm_gift_items;
create policy p_gift_items_admin on public.crm_gift_items for all to authenticated
  using (current_crm_role() = 'admin') with check (current_crm_role() = 'admin');

-- richieste: solo lettura diretta (giocatore interessato e advisor competente);
-- invio e cambi di stato passano dalle funzioni qui sotto
drop policy if exists p_gift_requests_read on public.crm_gift_requests;
create policy p_gift_requests_read on public.crm_gift_requests for select to authenticated
  using ((current_crm_role() = 'player' and player_id = current_player_api_id()) or crm_gift_admin_sees(player_id));

-- "Invia la tua scelta": controlla destinatario, scadenza, capi, taglie e indirizzo
-- (letto dal profilo, non dal browser) e salva una copia di tutto nella richiesta.
create or replace function public.crm_gift_submit(p_offer uuid, p_player bigint, p_items jsonb, p_notes text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  o record; v_ship jsonb; v_items jsonb := '[]'::jsonb; e jsonb; it record; v_id uuid;
  v_name text; v_adv text; v_missing text[] := '{}'; v_size text;
begin
  if not ((current_crm_role() = 'player' and p_player = current_player_api_id()) or current_crm_role() = 'admin') then
    raise exception 'Non autorizzato';
  end if;
  select * into o from crm_gift_offers where id = p_offer and active;
  if o is null or not (p_player = any (o.recipients)) then raise exception 'Offerta non disponibile'; end if;
  if o.deadline is not null and now() > o.deadline then raise exception 'Offerta scaduta'; end if;
  if exists (select 1 from crm_gift_requests where offer_id = p_offer and player_id = p_player) then
    raise exception 'Hai già inviato la tua scelta';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Seleziona almeno un capo'; end if;
  for e in select * from jsonb_array_elements(p_items) loop
    select * into it from crm_gift_items where id = (e->>'id')::uuid and offer_id = p_offer;
    if it is null then raise exception 'Capo non valido'; end if;
    if v_items @> jsonb_build_array(jsonb_build_object('id', it.id)) then continue; end if;
    v_size := nullif(btrim(coalesce(e->>'size', '')), '');
    if v_size is null then raise exception 'Indica la taglia per %', it.name; end if;
    if cardinality(it.sizes) > 0 and not (v_size = any (it.sizes)) then raise exception 'Taglia non valida per %', it.name; end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'id', it.id, 'name', it.name, 'color', it.color, 'url', it.url, 'image_url', it.image_url,
      'size', v_size, 'size_to_confirm', cardinality(it.sizes) = 0, 'needs_confirm', it.needs_confirm));
  end loop;

  select coalesce(shipping, '{}'::jsonb), name into v_ship, v_name from player where api_player_id = p_player;
  if coalesce(btrim(v_ship->>'recipient_name'), '') = '' then v_missing := v_missing || 'nome e cognome del destinatario'::text; end if;
  if coalesce(btrim(v_ship->>'address'), '') = '' then v_missing := v_missing || 'via e numero civico'::text; end if;
  if coalesce(btrim(v_ship->>'cap'), '') = '' then v_missing := v_missing || 'CAP'::text; end if;
  if coalesce(btrim(v_ship->>'city'), '') = '' then v_missing := v_missing || 'città'::text; end if;
  if coalesce(btrim(v_ship->>'country'), '') = '' then v_missing := v_missing || 'paese'::text; end if;
  if lower(btrim(coalesce(v_ship->>'country', ''))) in ('italia', 'italy', 'it')
     and coalesce(btrim(v_ship->>'province'), '') = '' then v_missing := v_missing || 'provincia'::text; end if;
  if coalesce(btrim(v_ship->>'phone'), '') = '' then v_missing := v_missing || 'telefono per la consegna'::text; end if;
  if cardinality(v_missing) > 0 then raise exception 'Completa l''indirizzo: %', array_to_string(v_missing, ', '); end if;

  insert into crm_gift_requests (offer_id, player_id, items, notes, address, created_by)
  values (p_offer, p_player, v_items, nullif(btrim(coalesce(p_notes, '')), ''),
          jsonb_strip_nulls(jsonb_build_object(
            'recipient_name', v_ship->>'recipient_name', 'address', v_ship->>'address', 'address2', v_ship->>'address2',
            'cap', v_ship->>'cap', 'city', v_ship->>'city', 'province', v_ship->>'province', 'country', v_ship->>'country',
            'phone', v_ship->>'phone', 'delivery_notes', v_ship->>'delivery_notes')),
          auth.uid())
  returning id into v_id;

  select coalesce(nullif(p.full_name, ''), 'Advisor') into v_adv
    from crm_player_advisors a join crm_profiles p on p.id = a.advisor_id where a.player_id = p_player;
  insert into crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
  values ('admin', 'Nuova richiesta ' || o.brand_name || coalesce(' · per ' || v_adv, ' · Advisor da assegnare'),
          coalesce(v_name, 'Un atleta') || ' ha scelto ' || jsonb_array_length(v_items) || ' capi (' || o.title || ')',
          'services?gift_req=' || v_id, p_player, auth.uid());
  return v_id;
end $$;

-- l'advisor aggiorna lo stato; il giocatore riceve la notifica
create or replace function public.crm_gift_set_status(p_req uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_l text;
begin
  select q.*, o.brand_name into r from crm_gift_requests q join crm_gift_offers o on o.id = q.offer_id where q.id = p_req;
  if r is null or not crm_gift_admin_sees(r.player_id) then raise exception 'Non autorizzato'; end if;
  if p_status not in ('da_verificare', 'confermata', 'spedita', 'completata') then raise exception 'Stato non valido'; end if;
  if p_status = r.status then return; end if;
  update crm_gift_requests set status = p_status, updated_at = now() where id = p_req;
  v_l := case p_status when 'confermata' then 'confermata' when 'spedita' then 'spedita' when 'completata' then 'completata' else 'da verificare' end;
  insert into crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
  values ('player', r.brand_name || ': richiesta ' || v_l,
          case p_status when 'confermata' then 'AUVI ha confermato la disponibilità dei tuoi capi.'
                        when 'spedita' then 'I tuoi capi sono in viaggio verso l''indirizzo indicato.'
                        when 'completata' then 'Consegna completata. Buon allenamento!'
                        else 'La tua richiesta è di nuovo in verifica.' end,
          'services?gift_req=' || p_req, r.player_id, auth.uid());
end $$;

revoke execute on function public.crm_gift_submit(uuid, bigint, jsonb, text) from public, anon;
revoke execute on function public.crm_gift_set_status(uuid, text) from public, anon;
grant execute on function public.crm_gift_submit(uuid, bigint, jsonb, text) to authenticated;
grant execute on function public.crm_gift_set_status(uuid, text) to authenticated;

-- nomi degli advisor (per il riquadro richiesta, anche lato giocatore)
create or replace function public.crm_gift_advisors(p_players bigint[])
returns table(player_id bigint, advisor_id uuid, advisor_name text)
language sql stable security definer set search_path = public as $$
  select a.player_id, a.advisor_id, coalesce(nullif(p.full_name, ''), 'AUVI Advisor')
    from crm_player_advisors a join crm_profiles p on p.id = a.advisor_id
   where a.player_id = any (p_players)
     and (current_crm_role() = 'admin' or (current_crm_role() = 'player' and a.player_id = current_player_api_id()));
$$;
grant execute on function public.crm_gift_advisors(bigint[]) to authenticated;

-- CiaoGym — Gifting dedicato per Lorenzo Pirola (134431) e Nadir Zortea (128461).
-- Scadenza: 15/11/2026 23:59 Europe/Rome (dal 16/11 00:00 gli invii sono bloccati).
insert into public.crm_gift_offers (deal_id, brand_name, title, description, recipients, deadline, deadline_tz)
select d.id, 'CiaoGym', 'CiaoGym — Gifting dedicato',
       'Una selezione di capi CiaoGym in omaggio, riservata a Lorenzo Pirola e Nadir Zortea. Scopri la selezione, scegli i capi e indica le taglie. AUVI confermerà la disponibilità e organizzerà la spedizione.',
       array[134431, 128461]::bigint[], timestamptz '2026-11-15 23:59:59.999 Europe/Rome', 'Europe/Rome'
  from public.crm_brand_deals d
 where d.brand_name = 'CiaoGym'
   and not exists (select 1 from public.crm_gift_offers where title = 'CiaoGym — Gifting dedicato');

-- 8 capi: foto principale e taglie lette dalle pagine prodotto ciaogym.com il 30/10/2026
insert into public.crm_gift_items (offer_id, sort, name, color, url, image_url, sizes, needs_confirm, admin_note)
select o.id, v.sort, v.name, v.color, v.url, v.img, array['S','M','L','XL','XXL'], v.nc, v.note
  from public.crm_gift_offers o,
  (values
    (1, 'Piping Trousers', 'Black', 'https://ciaogym.com/it/piping-relaxed-fit-trousers-black.html',
        'https://ciaogym.com/media/catalog/product/cache/88dcd7e56296aac895b998c5c283502e/b/o/bottom_front_1_1__1_1.jpg', false, null),
    (2, 'Piping Zip Hoodie', 'Black', 'https://ciaogym.com/it/piping-zip-hoodie-black-men.html',
        'https://ciaogym.com/media/catalog/product/cache/88dcd7e56296aac895b998c5c283502e/t/o/top_front_1_1__1_1.jpg', false, null),
    (3, 'Piping Crewneck Sweatshirt', 'Black', 'https://ciaogym.com/it/piping-crewneck-sweatshirt-black-men.html',
        'https://ciaogym.com/media/catalog/product/cache/88dcd7e56296aac895b998c5c283502e/t/o/top_front_2_1__1_1.jpg', false, null),
    (4, 'Energy Sweatshirt', 'Green', 'https://ciaogym.com/it/energy-sweatshirt-green.html',
        'https://ciaogym.com/media/catalog/product/cache/88dcd7e56296aac895b998c5c283502e/2/5/25_09_03_ciaogym_lookbook_3257top_1.jpg', true, null),
    (5, 'Energy Joggers', 'Green', 'https://ciaogym.com/it/energy-joggers-green.html',
        'https://ciaogym.com/media/catalog/product/cache/88dcd7e56296aac895b998c5c283502e/2/5/25_09_03_ciaogym_lookbook_3252bottom_front_1.jpg', true, null),
    (6, 'Daring Sweater', 'Light Grey', 'https://ciaogym.com/it/daring-sweater-grigio-chiaro-21sw001bn-u-light-grey.html',
        'https://ciaogym.com/media/catalog/product/cache/88dcd7e56296aac895b998c5c283502e/c/i/ciaogym_4785_top_01_1.jpg', true, null),
    (7, 'Daring Joggers', 'Grey', 'https://ciaogym.com/it/daring-joggers-nero-21jg001bn-u-black-21.html',
        'https://ciaogym.com/media/catalog/product/cache/88dcd7e56296aac895b998c5c283502e/c/i/ciaogym_4792_01_1_1_1.jpg', true,
        'Colore da verificare: la proposta indica Black, ma questo link apre "Daring Joggers Grigio" (foto e colore mostrati sono quelli della pagina). La versione nera è su https://ciaogym.com/it/daring-joggers-nero-21jg001bn-u-black-1.html'),
    (8, 'Interlock T-shirt', 'Grey', 'https://ciaogym.com/it/interlock-t-shirt-grey.html',
        'https://ciaogym.com/media/catalog/product/cache/88dcd7e56296aac895b998c5c283502e/3/0/30-1_1.jpg', true, null)
  ) as v(sort, name, color, url, img, nc, note)
 where o.title = 'CiaoGym — Gifting dedicato'
on conflict (offer_id, url) do nothing;
