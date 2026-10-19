-- Chat dello staff (19/10/2026): i professionisti di uno stesso atleta si scrivono tra loro,
-- a due o in gruppi creati da loro. Legge solo chi fa parte della conversazione (il nutrizionista
-- non vede la chat commercialista–assicuratore). L'atleta può leggere tutte le conversazioni che
-- lo riguardano (trasparenza) ma non scrive, e decide lui se ricevere le notifiche (spente di base).
-- AUVI vede e può scrivere ovunque. In più: chat diretta atleta ↔ fisioterapista / nutrizionista.

create table if not exists public.crm_staff_threads (
  id uuid primary key default gen_random_uuid(),
  player_id bigint not null,
  title text,                         -- nome del gruppo (null = chat a due)
  created_by uuid,
  created_at timestamptz not null default now(),
  last_at timestamptz not null default now()
);
create index if not exists idx_staff_threads_player on public.crm_staff_threads(player_id, last_at desc);

create table if not exists public.crm_staff_members (
  thread_id uuid not null references public.crm_staff_threads(id) on delete cascade,
  user_id uuid not null,
  role text,
  name text,
  primary key (thread_id, user_id)
);
create index if not exists idx_staff_members_user on public.crm_staff_members(user_id);

create table if not exists public.crm_staff_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.crm_staff_threads(id) on delete cascade,
  sender_id uuid not null default auth.uid(),
  sender_name text,
  sender_role text,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_staff_messages_thread on public.crm_staff_messages(thread_id, created_at);

-- preferenze dell'atleta (notifiche dello staff spente di base)
create table if not exists public.crm_athlete_prefs (
  player_id bigint primary key,
  staff_notify boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.crm_staff_threads enable row level security;
alter table public.crm_staff_members enable row level security;
alter table public.crm_staff_messages enable row level security;
alter table public.crm_athlete_prefs enable row level security;

create or replace function public.crm_staff_is_member(p_thread uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from crm_staff_members where thread_id = p_thread and user_id = auth.uid());
$$;

create or replace function public.crm_staff_can_read(p_thread uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select current_crm_role() in ('admin', 'creator')
      or crm_staff_is_member(p_thread)
      or exists (select 1 from crm_staff_threads t where t.id = p_thread
                  and current_crm_role() = 'player' and t.player_id = current_player_api_id());
$$;

drop policy if exists p_staff_threads_read on public.crm_staff_threads;
create policy p_staff_threads_read on public.crm_staff_threads for select to authenticated using (crm_staff_can_read(id));
drop policy if exists p_staff_members_read on public.crm_staff_members;
create policy p_staff_members_read on public.crm_staff_members for select to authenticated using (crm_staff_can_read(thread_id));
drop policy if exists p_staff_messages_read on public.crm_staff_messages;
create policy p_staff_messages_read on public.crm_staff_messages for select to authenticated using (crm_staff_can_read(thread_id));
drop policy if exists p_staff_messages_insert on public.crm_staff_messages;
create policy p_staff_messages_insert on public.crm_staff_messages for insert to authenticated with check (
  sender_id = auth.uid() and (crm_staff_is_member(thread_id) or current_crm_role() = 'admin'));
drop policy if exists p_staff_messages_delete on public.crm_staff_messages;
create policy p_staff_messages_delete on public.crm_staff_messages for delete to authenticated using (
  sender_id = auth.uid() or current_crm_role() = 'admin');
drop policy if exists p_athlete_prefs_read on public.crm_athlete_prefs;
create policy p_athlete_prefs_read on public.crm_athlete_prefs for select to authenticated using (crm_manages_player(player_id));

-- apre (o ritrova) una conversazione: p_members = altri partecipanti, il chiamante si aggiunge da solo.
-- Si può invitare solo chi lavora per quell'atleta (o AUVI).
create or replace function public.crm_staff_open(p_player bigint, p_members uuid[], p_title text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_role text := current_crm_role(); v_all uuid[]; v_id uuid; u uuid; v_name text; v_r text;
begin
  if v_me is null then raise exception 'Non autorizzato'; end if;
  if not (v_role in ('admin', 'creator') or crm_team_sees(p_player)) then raise exception 'Non lavori per questo atleta'; end if;
  select array_agg(distinct x) into v_all from unnest(coalesce(p_members, '{}') || v_me) x;
  if coalesce(array_length(v_all, 1), 0) < 2 then raise exception 'Scegli almeno un professionista'; end if;

  foreach u in array v_all loop
    if u <> v_me
       and not exists (select 1 from crm_athlete_team w where w.player_id = p_player and w.pro_id = u)
       and not exists (select 1 from crm_profiles pf where pf.id = u and pf.role = 'admin') then
      raise exception 'Uno dei partecipanti non lavora per questo atleta';
    end if;
  end loop;

  -- chat a due già esistente: la riapre
  if array_length(v_all, 1) = 2 and nullif(trim(coalesce(p_title, '')), '') is null then
    select t.id into v_id from crm_staff_threads t
     where t.player_id = p_player and t.title is null
       and (select array_agg(m.user_id order by m.user_id) from crm_staff_members m where m.thread_id = t.id)
           = (select array_agg(x order by x) from unnest(v_all) x)
     limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  insert into crm_staff_threads (player_id, title, created_by)
  values (p_player, nullif(trim(coalesce(p_title, '')), ''), v_me) returning id into v_id;

  foreach u in array v_all loop
    select w.role, w.name into v_r, v_name from crm_athlete_team w where w.player_id = p_player and w.pro_id = u limit 1;
    if v_r is null then
      select pf.role::text, coalesce(nullif(pf.full_name, ''), 'AUVI') into v_r, v_name from crm_profiles pf where pf.id = u;
      if v_r in ('admin', 'creator') then v_name := 'AUVI · ' || v_name; end if;
    end if;
    insert into crm_staff_members (thread_id, user_id, role, name) values (v_id, u, v_r, v_name);
    v_r := null; v_name := null;
  end loop;
  return v_id;
end $$;

-- l'atleta accende o spegne le notifiche dello staff
create or replace function public.crm_set_staff_notify(p_player bigint, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not ((current_crm_role() = 'player' and p_player = current_player_api_id()) or current_crm_role() = 'admin') then
    raise exception 'Solo l''atleta può decidere le sue notifiche';
  end if;
  insert into crm_athlete_prefs (player_id, staff_notify, updated_at) values (p_player, p_on, now())
  on conflict (player_id) do update set staff_notify = excluded.staff_notify, updated_at = now();
end $$;

-- nuovo messaggio: aggiorna la conversazione e avvisa gli altri partecipanti (e l'atleta se lo vuole).
-- Nella notifica non c'è il testo del messaggio.
create or replace function public.crm_staff_message_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare t record; r text; v_where text;
begin
  update crm_staff_threads set last_at = new.created_at where id = new.thread_id returning * into t;
  v_where := coalesce('nel gruppo «' || t.title || '»', 'in chat');
  for r in select distinct m.role from crm_staff_members m
            where m.thread_id = new.thread_id and m.user_id <> new.sender_id and m.role is not null
              and m.role is distinct from new.sender_role loop
    insert into crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values (case when r = 'creator' then 'admin' else r end, 'Nuovo messaggio dallo staff',
            coalesce(new.sender_name, 'Un professionista') || ' ti ha scritto ' || v_where,
            'messages?staff=' || new.thread_id, t.player_id, new.sender_id);
  end loop;
  if exists (select 1 from crm_athlete_prefs p where p.player_id = t.player_id and p.staff_notify) then
    insert into crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('player', 'Il tuo staff', coalesce(new.sender_name, 'Un professionista') || ' ha scritto ' || v_where,
            'messages?staff=' || new.thread_id, t.player_id, new.sender_id);
  end if;
  return new;
end $$;
drop trigger if exists trg_staff_message_after on public.crm_staff_messages;
create trigger trg_staff_message_after after insert on public.crm_staff_messages
  for each row execute function public.crm_staff_message_after();

revoke execute on function public.crm_staff_open(bigint, uuid[], text) from public, anon;
revoke execute on function public.crm_set_staff_notify(bigint, boolean) from public, anon;
grant execute on function public.crm_staff_open(bigint, uuid[], text) to authenticated;
grant execute on function public.crm_set_staff_notify(bigint, boolean) to authenticated;
revoke execute on function public.crm_staff_message_after() from public, anon, authenticated;

do $$ begin
  alter publication supabase_realtime add table public.crm_staff_messages;
exception when others then null; end $$;

-- chat diretta atleta ↔ fisioterapista / nutrizionista
drop policy if exists p_messages_read on public.crm_messages;
create policy p_messages_read on public.crm_messages for select to authenticated using (
  crm_is_admin()
  or (current_crm_role() = 'player' and player_id = current_player_api_id())
  or (current_crm_role() = 'preparatore' and channel = 'fitness' and fitness_can_manage(player_id))
  or (current_crm_role() = 'agente' and crm_agent_sees(player_id) and coalesce(channel, 'team') = any (array['team', 'agente']))
  or (current_crm_role() = 'assicuratore' and crm_insurer_sees(player_id) and channel = 'assicuratore')
  or (current_crm_role() = 'commercialista' and crm_tax_sees(player_id) and channel = 'commercialista')
  or (current_crm_role() = 'fisioterapista' and crm_physio_sees(player_id) and channel = 'fisioterapista')
  or (current_crm_role() = 'nutrizionista' and crm_nutri_sees(player_id) and channel = 'nutrizionista')
  or (channel = 'brand:' || crm_my_brand_id()::text and crm_brand_partner(player_id)));

drop policy if exists p_messages_insert on public.crm_messages;
create policy p_messages_insert on public.crm_messages for insert to authenticated with check (
  sender_id = auth.uid() and (
    crm_is_admin()
    or (current_crm_role() = 'player' and player_id = current_player_api_id()
        and (coalesce(channel, 'team') = any (array['team', 'fitness', 'agente', 'assicuratore', 'commercialista', 'fisioterapista', 'nutrizionista'])
             or channel like 'brand:%'))
    or (current_crm_role() = 'preparatore' and channel = 'fitness' and fitness_can_manage(player_id))
    or (current_crm_role() = 'agente' and crm_agent_sees(player_id) and coalesce(channel, 'team') = any (array['team', 'agente']))
    or (current_crm_role() = 'assicuratore' and crm_insurer_sees(player_id) and channel = 'assicuratore')
    or (current_crm_role() = 'commercialista' and crm_tax_sees(player_id) and channel = 'commercialista')
    or (current_crm_role() = 'fisioterapista' and crm_physio_sees(player_id) and channel = 'fisioterapista')
    or (current_crm_role() = 'nutrizionista' and crm_nutri_sees(player_id) and channel = 'nutrizionista')
    or (channel = 'brand:' || crm_my_brand_id()::text and crm_brand_partner(player_id))));
