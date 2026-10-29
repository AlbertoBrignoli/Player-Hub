-- Persone coinvolte in una voce del patrimonio (29/10/2026).
-- Chi lavora sulla voce (atleta, AUVI, wealth manager) può taggare altri membri del team
-- dell'atleta (es. il commercialista): ricevono la notifica, vedono SOLO quella voce
-- (titolo, descrizione, file) e possono scrivere e caricare documenti nella sua conversazione.
-- Il resto del patrimonio resta visibile solo ad atleta, AUVI e wealth manager.

create table if not exists public.crm_wealth_item_people (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.crm_wealth_items(id) on delete cascade,
  user_id uuid,                 -- null = AUVI (tutto lo staff admin)
  role text not null,
  name text,
  added_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index if not exists crm_wealth_item_people_uq
  on public.crm_wealth_item_people (item_id, role, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table if not exists public.crm_wealth_item_comments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.crm_wealth_items(id) on delete cascade,
  author_id uuid default auth.uid(),
  author_name text,
  author_role text,
  body text,
  attachments jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index if not exists crm_wealth_item_comments_item_idx on public.crm_wealth_item_comments (item_id, created_at);

-- chi vede una voce: chi vede il patrimonio dell'atleta, oppure chi è taggato
create or replace function public.crm_wealth_tagged(p_item uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.crm_wealth_item_people t where t.item_id = p_item and t.user_id = auth.uid());
$$;
create or replace function public.crm_wealth_item_visible(p_item uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.crm_wealth_items i
                  where i.id = p_item and (crm_wealth_access(i.player_id) or crm_wealth_tagged(i.id)));
$$;
create or replace function public.crm_wealth_item_manage(p_item uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.crm_wealth_items i where i.id = p_item and crm_wealth_access(i.player_id));
$$;

create policy p_wealth_items_tagged on public.crm_wealth_items for select to authenticated
  using (crm_wealth_tagged(id));

alter table public.crm_wealth_item_people enable row level security;
create policy p_wip_read on public.crm_wealth_item_people for select to authenticated
  using (crm_wealth_item_visible(item_id));
create policy p_wip_add on public.crm_wealth_item_people for insert to authenticated
  with check (crm_wealth_item_manage(item_id));
create policy p_wip_del on public.crm_wealth_item_people for delete to authenticated
  using (crm_wealth_item_manage(item_id));

alter table public.crm_wealth_item_comments enable row level security;
create policy p_wic_read on public.crm_wealth_item_comments for select to authenticated
  using (crm_wealth_item_visible(item_id));
create policy p_wic_add on public.crm_wealth_item_comments for insert to authenticated
  with check (author_id = auth.uid() and crm_wealth_item_visible(item_id));
create policy p_wic_del on public.crm_wealth_item_comments for delete to authenticated
  using (author_id = auth.uid() or current_crm_role() = 'admin');

-- file: chi è taggato apre i file della voce e carica in wealth-docs/<player_id>/<item_id>/…
create or replace function public.crm_wealth_path_ok(p_name text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select case when split_part(p_name, '/', 1) !~ '^[0-9]+$' then false
    else crm_wealth_access(split_part(p_name, '/', 1)::bigint)
      or exists (
        select 1 from public.crm_wealth_items i
         where i.player_id = split_part(p_name, '/', 1)::bigint and crm_wealth_tagged(i.id)
           and (split_part(p_name, '/', 2) = i.id::text
                or i.attachments @> jsonb_build_array(jsonb_build_object('path', p_name))
                or i.response_attachments @> jsonb_build_array(jsonb_build_object('path', p_name))))
      or exists (
        select 1 from public.crm_wealth_item_comments c join public.crm_wealth_items i on i.id = c.item_id
         where i.player_id = split_part(p_name, '/', 1)::bigint and crm_wealth_tagged(i.id)
           and c.attachments @> jsonb_build_array(jsonb_build_object('path', p_name)))
  end;
$$;

-- notifiche: chi viene taggato e, a ogni messaggio, tutti i coinvolti tranne chi scrive
create or replace function public.crm_wealth_people_notify()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare i record; v_who text;
begin
  select * into i from public.crm_wealth_items where id = new.item_id;
  v_who := coalesce(nullif(trim(coalesce(public.crm_pro_display_name(auth.uid(), current_crm_role()), '')), ''),
                    (select full_name from public.crm_profiles where id = auth.uid()), 'AUVI');
  insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
  values (case when new.role = 'admin' then 'admin' else new.role end,
          v_who || ' ti ha coinvolto: ' || i.title,
          coalesce(i.description, case when i.due_date is not null then 'entro il ' || to_char(i.due_date, 'DD/MM/YYYY') end, ''),
          'wealth?item=' || i.id, i.player_id, auth.uid());
  return new;
end $$;
create trigger trg_wealth_people_notify after insert on public.crm_wealth_item_people
  for each row execute function crm_wealth_people_notify();

create or replace function public.crm_wealth_comment_notify()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare i record; v_role text; v_title text;
begin
  select * into i from public.crm_wealth_items where id = new.item_id;
  v_title := coalesce(new.author_name, 'Nuovo messaggio') || ' · ' || i.title;
  for v_role in
    select distinct r from (
      select 'player' as r
      union all select 'wealth'
      union all select case when role = 'admin' then 'admin' else role end from public.crm_wealth_item_people where item_id = i.id
    ) x where r is distinct from coalesce(new.author_role, current_crm_role())
  loop
    insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values (v_role, v_title, left(coalesce(nullif(new.body, ''), 'Nuovo documento'), 140), 'wealth?item=' || i.id, i.player_id, new.author_id);
  end loop;
  return new;
end $$;
create trigger trg_wealth_comment_notify after insert on public.crm_wealth_item_comments
  for each row execute function crm_wealth_comment_notify();

-- le notifiche del patrimonio (route "wealth…") le vede solo chi ne è destinatario,
-- l'atleta, AUVI e il wealth manager: non procuratore, staff o creator per conto dell'atleta
do $$
declare d text;
begin
  select qual into d from pg_policies where tablename = 'crm_notifications' and policyname = 'p_notif_select';
  execute format('alter policy p_notif_select on public.crm_notifications using ((%s) and ((coalesce(route, '''') !~~ ''wealth%%'') or (current_crm_role() = any (array[''admin'', ''player'', ''wealth''])) or (recipient_role = current_crm_role())))', d);
end $$;
