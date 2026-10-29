-- Persone coinvolte e conversazione su TUTTE le aree dei professionisti (29/10/2026).
-- Stesso schema del patrimonio (0067), reso unico per ogni tipo di voce:
--   wealth    = crm_wealth_items        (wealth manager)
--   tax       = crm_tax_items           (commercialista)
--   insurance = crm_insurance_policies  (assicuratore)
--   contract  = crm_contracts           (procuratore)
--   event     = crm_events              (impegni in agenda: preparatore, fisioterapista, nutrizionista…)
-- Chi vede la voce può taggare altri membri del team dell'atleta: ricevono la notifica, vedono SOLO
-- quella voce e partecipano alla sua conversazione (per gli impegni: i commenti dell'impegno).

create table if not exists public.crm_item_people (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('wealth', 'tax', 'insurance', 'contract', 'event')),
  item_id uuid not null,
  user_id uuid,                 -- null = AUVI (tutto lo staff admin)
  role text not null,
  name text,
  added_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index if not exists crm_item_people_uq
  on public.crm_item_people (kind, item_id, role, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists crm_item_people_user_idx on public.crm_item_people (user_id);

create table if not exists public.crm_item_comments (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('wealth', 'tax', 'insurance', 'contract', 'event')),
  item_id uuid not null,
  author_id uuid default auth.uid(),
  author_name text,
  author_role text,
  body text,
  attachments jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index if not exists crm_item_comments_item_idx on public.crm_item_comments (kind, item_id, created_at);

-- dati già creati sul patrimonio
insert into public.crm_item_people (id, kind, item_id, user_id, role, name, added_by, created_at)
select id, 'wealth', item_id, user_id, role, name, added_by, created_at from public.crm_wealth_item_people
on conflict do nothing;
insert into public.crm_item_comments (id, kind, item_id, author_id, author_name, author_role, body, attachments, created_at)
select id, 'wealth', item_id, author_id, author_name, author_role, body, attachments, created_at from public.crm_wealth_item_comments
on conflict do nothing;

create or replace function public.crm_item_tagged(p_kind text, p_item uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.crm_item_people t
                  where t.kind = p_kind and t.item_id = p_item and t.user_id = auth.uid());
$$;

-- visibile = la riga si legge con i permessi di chi chiede (security invoker: valgono le RLS)
create or replace function public.crm_item_visible(p_kind text, p_item uuid)
returns boolean language sql stable security invoker set search_path to 'public' as $$
  select case p_kind
    when 'wealth' then exists (select 1 from public.crm_wealth_items where id = p_item)
    when 'tax' then exists (select 1 from public.crm_tax_items where id = p_item)
    when 'insurance' then exists (select 1 from public.crm_insurance_policies where id = p_item)
    when 'contract' then exists (select 1 from public.crm_contracts where id = p_item)
    when 'event' then exists (select 1 from public.crm_events where id = p_item)
    else false end;
$$;

-- atleta, titolo e ruoli "titolari" di una voce (per notifiche e liste)
create or replace function public.crm_item_meta(p_kind text, p_item uuid)
returns table (player_id bigint, title text, due date, owners text[])
language sql stable security definer set search_path to 'public' as $$
  select i.player_id, i.title, i.due_date, array['player', 'wealth'] from crm_wealth_items i where p_kind = 'wealth' and i.id = p_item
  union all select i.player_id, i.title, i.due_date, array['player', 'commercialista'] from crm_tax_items i where p_kind = 'tax' and i.id = p_item
  union all select i.player_id, i.title, i.expiry_date, array['player', 'assicuratore'] from crm_insurance_policies i where p_kind = 'insurance' and i.id = p_item
  union all select i.player_id, i.title, i.end_date, array['player', 'agente'] from crm_contracts i where p_kind = 'contract' and i.id = p_item
  union all select e.player_id, e.title, (e.start_at at time zone 'Europe/Rome')::date,
      array_remove(array['player', case when e.proposed_by_role in ('preparatore','assicuratore','commercialista','fisioterapista','nutrizionista','agente','wealth') then e.proposed_by_role end], null)
    from crm_events e where p_kind = 'event' and e.id = p_item;
$$;

-- chi è taggato legge la voce
create policy p_tax_items_tagged on public.crm_tax_items for select to authenticated using (crm_item_tagged('tax', id));
create policy p_policies_tagged on public.crm_insurance_policies for select to authenticated using (crm_item_tagged('insurance', id));
create policy p_contracts_tagged on public.crm_contracts for select to authenticated using (crm_item_tagged('contract', id));
create policy p_events_tagged on public.crm_events for select to authenticated using (crm_item_tagged('event', id));
drop policy if exists p_wealth_items_tagged on public.crm_wealth_items;
create policy p_wealth_items_tagged on public.crm_wealth_items for select to authenticated using (crm_item_tagged('wealth', id));

-- …e i commenti dell'impegno
create or replace function public.crm_event_visible(p_event uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from crm_events e where e.id = p_event and (
    crm_manages_player(e.player_id)
    or (crm_team_sees(e.player_id) and (e.visibility = 'team' or e.created_by = auth.uid()))
    or (e.service_request_id is not null and crm_is_request_partner(e.service_request_id))
    or crm_item_tagged('event', e.id)));
$$;

alter table public.crm_item_people enable row level security;
create policy p_ip_read on public.crm_item_people for select to authenticated using (crm_item_visible(kind, item_id));
create policy p_ip_add on public.crm_item_people for insert to authenticated with check (crm_item_visible(kind, item_id));
create policy p_ip_del on public.crm_item_people for delete to authenticated using (crm_item_visible(kind, item_id));

alter table public.crm_item_comments enable row level security;
create policy p_ic_read on public.crm_item_comments for select to authenticated using (crm_item_visible(kind, item_id));
create policy p_ic_add on public.crm_item_comments for insert to authenticated
  with check (author_id = auth.uid() and crm_item_visible(kind, item_id));
create policy p_ic_del on public.crm_item_comments for delete to authenticated
  using (author_id = auth.uid() or current_crm_role() = 'admin');

-- file della conversazione: item-files/<kind>/<item_id>/<file>
insert into storage.buckets (id, name, public, file_size_limit)
values ('item-files', 'item-files', false, 52428800) on conflict (id) do nothing;
create or replace function public.crm_item_path_ok(p_name text)
returns boolean language sql stable security invoker set search_path to 'public' as $$
  select case when split_part(p_name, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then crm_item_visible(split_part(p_name, '/', 1), split_part(p_name, '/', 2)::uuid) else false end;
$$;
create policy p_itemfiles_read on storage.objects for select using (bucket_id = 'item-files' and public.crm_item_path_ok(name));
create policy p_itemfiles_write on storage.objects for insert with check (bucket_id = 'item-files' and public.crm_item_path_ok(name));

-- chi è taggato apre anche gli allegati della voce (fisco e polizze)
create or replace function public.crm_item_file_tagged(p_kind text, p_name text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select case p_kind
    when 'tax' then exists (select 1 from crm_tax_items i where crm_item_tagged('tax', i.id)
      and (i.attachments @> jsonb_build_array(jsonb_build_object('path', p_name))
           or i.response_attachments @> jsonb_build_array(jsonb_build_object('path', p_name))))
    when 'insurance' then exists (select 1 from crm_insurance_policies i where crm_item_tagged('insurance', i.id)
      and i.attachments @> jsonb_build_array(jsonb_build_object('path', p_name)))
    else false end;
$$;
create policy p_taxdoc_tagged on storage.objects for select using (bucket_id = 'tax-docs' and public.crm_item_file_tagged('tax', name));
create policy p_insdoc_tagged on storage.objects for select using (bucket_id = 'insurance-docs' and public.crm_item_file_tagged('insurance', name));

-- patrimonio: il vecchio schema passa a quello unico
create or replace function public.crm_wealth_tagged(p_item uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.crm_item_tagged('wealth', p_item);
$$;
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
  end;
$$;
drop table if exists public.crm_wealth_item_comments;
drop table if exists public.crm_wealth_item_people;
drop function if exists public.crm_wealth_people_notify();
drop function if exists public.crm_wealth_comment_notify();
drop function if exists public.crm_wealth_item_visible(uuid);
drop function if exists public.crm_wealth_item_manage(uuid);

-- notifiche
create or replace function public.crm_item_people_notify()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare m record; v_who text;
begin
  select * into m from public.crm_item_meta(new.kind, new.item_id);
  if m.player_id is null then return new; end if;
  v_who := coalesce(nullif(trim(coalesce(public.crm_pro_display_name(auth.uid(), current_crm_role()), '')), ''),
                    (select full_name from public.crm_profiles where id = auth.uid()), 'AUVI');
  insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
  values (new.role, v_who || ' ti ha coinvolto: ' || coalesce(m.title, ''),
          coalesce('entro il ' || to_char(m.due, 'DD/MM/YYYY'), ''),
          'item?k=' || new.kind || '&id=' || new.item_id, m.player_id, auth.uid());
  return new;
end $$;
create trigger trg_item_people_notify after insert on public.crm_item_people
  for each row execute function crm_item_people_notify();

-- a ogni messaggio: titolari della voce + taggati, tranne chi scrive
create or replace function public.crm_item_notify_thread(p_kind text, p_item uuid, p_author uuid, p_author_role text,
                                                         p_author_name text, p_body text, p_skip_owners boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m record; v_role text;
begin
  select * into m from public.crm_item_meta(p_kind, p_item);
  if m.player_id is null then return; end if;
  for v_role in
    select distinct r from (
      select unnest(case when p_skip_owners then '{}'::text[] else m.owners end) as r
      union all select role from public.crm_item_people where kind = p_kind and item_id = p_item
    ) x where r is distinct from p_author_role
  loop
    insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values (v_role, coalesce(p_author_name, 'Nuovo messaggio') || ' · ' || coalesce(m.title, ''),
            left(coalesce(nullif(p_body, ''), 'Nuovo documento'), 140),
            'item?k=' || p_kind || '&id=' || p_item, m.player_id, p_author);
  end loop;
end $$;

create or replace function public.crm_item_comment_notify()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  perform public.crm_item_notify_thread(new.kind, new.item_id, new.author_id,
    coalesce(new.author_role, current_crm_role()), new.author_name, new.body, false);
  return new;
end $$;
create trigger trg_item_comment_notify after insert on public.crm_item_comments
  for each row execute function crm_item_comment_notify();

-- commenti degli impegni: l'avviso a atleta/proponente c'è già; qui si avvisano i taggati
create or replace function public.crm_event_comment_tagged_notify()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_role text; v_who text;
begin
  if not exists (select 1 from public.crm_item_people where kind = 'event' and item_id = new.event_id) then return new; end if;
  v_role := coalesce(new.author_role, current_crm_role());
  v_who := coalesce(nullif(trim(coalesce(public.crm_pro_display_name(new.author_id, v_role), '')), ''),
                    (select full_name from public.crm_profiles where id = new.author_id), 'AUVI');
  perform public.crm_item_notify_thread('event', new.event_id, new.author_id, v_role, v_who, new.body, true);
  return new;
end $$;
create trigger trg_event_comment_tagged_notify after insert on public.crm_event_comments
  for each row execute function crm_event_comment_tagged_notify();

-- voci in cui sono coinvolto (home del professionista)
create or replace function public.crm_my_tagged_items()
returns table (kind text, item_id uuid, player_id bigint, title text, due date)
language sql stable security definer set search_path to 'public' as $$
  select t.kind, t.item_id, m.player_id, m.title, m.due
    from public.crm_item_people t, lateral public.crm_item_meta(t.kind, t.item_id) m
   where t.user_id = auth.uid();
$$;

-- notifiche delle voci condivise ("item?…"): solo ai destinatari, all'atleta e ad AUVI
do $$
declare d text;
begin
  select qual into d from pg_policies where tablename = 'crm_notifications' and policyname = 'p_notif_select';
  execute format('alter policy p_notif_select on public.crm_notifications using ((%s) and ((coalesce(route, '''') !~~ ''item?%%'') or (current_crm_role() = any (array[''admin'', ''player''])) or (recipient_role = current_crm_role())))', d);
end $$;
