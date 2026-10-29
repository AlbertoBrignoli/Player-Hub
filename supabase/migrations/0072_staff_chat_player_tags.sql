-- Chat dello staff: anche l'atleta scrive e apre conversazioni; in ogni messaggio si possono
-- taggare i membri del team (e AUVI). Chi è taggato entra nella conversazione e riceve una notifica.
-- (applicata in produzione via MCP; crm_staff_open e crm_staff_message_after patchate con replace())
alter table public.crm_staff_messages add column if not exists mentions uuid[] not null default '{}';
alter table public.crm_staff_messages add column if not exists mention_auvi boolean not null default false;

drop policy if exists p_staff_messages_insert on public.crm_staff_messages;
create policy p_staff_messages_insert on public.crm_staff_messages for insert to authenticated with check (
  sender_id = auth.uid() and (crm_staff_is_member(thread_id) or current_crm_role() = 'admin'
    or exists (select 1 from crm_staff_threads t where t.id = thread_id
                and current_crm_role() = 'player' and t.player_id = current_player_api_id())));

do $$
declare d text;
begin
  d := pg_get_functiondef('public.crm_staff_open(bigint, uuid[], text)'::regprocedure);
  d := replace(d, $x$if not (v_role in ('admin', 'creator') or crm_team_sees(p_player)) then$x$,
                  $x$if not (v_role in ('admin', 'creator') or crm_team_sees(p_player) or (v_role = 'player' and p_player = current_player_api_id())) then$x$);
  execute d;
  d := pg_get_functiondef('public.crm_staff_message_after()'::regprocedure);
  d := replace(d, $x$if exists (select 1 from crm_athlete_prefs p where p.player_id = t.player_id and p.staff_notify) then$x$,
                  $x$if coalesce(new.sender_role, '') <> 'player' and exists (select 1 from crm_athlete_prefs p where p.player_id = t.player_id and p.staff_notify) then$x$);
  execute d;
end $$;

create or replace function public.crm_staff_mentions_after()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare t record; u uuid; v_r text; v_name text; v_where text;
begin
  if coalesce(array_length(new.mentions, 1), 0) = 0 and not new.mention_auvi then return new; end if;
  select * into t from crm_staff_threads where id = new.thread_id;
  v_where := coalesce('nel gruppo «' || t.title || '»', 'in chat');
  foreach u in array new.mentions loop
    if u = new.sender_id then continue; end if;
    select w.role, w.name into v_r, v_name from crm_athlete_team w where w.player_id = t.player_id and w.pro_id = u limit 1;
    if v_r is null then
      select pf.role::text, 'AUVI · ' || coalesce(nullif(pf.full_name, ''), 'AUVI') into v_r, v_name
        from crm_profiles pf where pf.id = u and pf.role = 'admin';
    end if;
    if v_r is null then continue; end if;   -- non lavora per l'atleta: tag ignorato
    insert into crm_staff_members (thread_id, user_id, role, name) values (new.thread_id, u, v_r, v_name)
      on conflict (thread_id, user_id) do nothing;
    insert into crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values (case when v_r = 'creator' then 'admin' else v_r end,
            coalesce(new.sender_name, 'Qualcuno') || ' ti ha taggato',
            left(coalesce(nullif(new.body, ''), 'Nuovo documento'), 140) || ' · ' || v_where,
            'messages?staff=' || new.thread_id, t.player_id, new.sender_id);
    v_r := null; v_name := null;
  end loop;
  if new.mention_auvi and coalesce(new.sender_role, '') not in ('admin', 'creator') then
    insert into crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('admin', coalesce(new.sender_name, 'Qualcuno') || ' ha taggato AUVI',
            left(coalesce(nullif(new.body, ''), 'Nuovo documento'), 140) || ' · ' || v_where,
            'messages?staff=' || new.thread_id, t.player_id, new.sender_id);
  end if;
  return new;
end $$;
drop trigger if exists trg_staff_mentions on public.crm_staff_messages;
create trigger trg_staff_mentions after insert on public.crm_staff_messages
  for each row execute function crm_staff_mentions_after();
