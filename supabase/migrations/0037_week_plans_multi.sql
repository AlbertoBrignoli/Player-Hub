-- Programma su più settimane (11/10/2026)
-- Il club spesso manda un unico PDF/foto con 2+ settimane: l'AI le legge tutte, l'atleta spunta
-- e salva una volta sola. Ogni settimana diventa il suo programma (stesso file) e rimpiazza quello
-- salvato prima per la stessa settimana, così gli impegni non si duplicano. Una sola notifica al team.
create or replace function public.crm_save_week_plans(p_plan uuid, p_items jsonb, p_weeks date[] default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare w record; v_tz text; v_name text; it jsonb; v_week date; v_pid uuid; v_first boolean := true;
        n int := 0; nw int := 0; v_start timestamptz; v_end timestamptz; v_weeks date[]; v_old uuid;
begin
  select * into w from crm_week_plans where id = p_plan;
  if w is null or not crm_manages_player(w.player_id) then raise exception 'Programma non tuo'; end if;
  select coalesce(timezone, 'Europe/Rome'), name into v_tz, v_name from player where api_player_id = w.player_id;

  -- settimane toccate: quelle degli impegni + quelle indicate dall'app (anche vuote = tutto riposo)
  select coalesce(array_agg(distinct d order by d), '{}') into v_weeks from (
    select date_trunc('week', (x->>'date')::date)::date d from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x
      where coalesce(x->>'date', '') ~ '^\d{4}-\d{2}-\d{2}$'
    union select unnest(coalesce(p_weeks, array[w.week_start]))
  ) s;

  foreach v_week in array v_weeks loop
    v_pid := case when v_week = w.week_start then p_plan else null end;
    -- programmi già salvati per quella settimana: se ne tiene uno, gli altri si tolgono (senza notifiche "ha tolto")
    perform set_config('auvi.week_resave', '1', true);
    for v_old in select id from crm_week_plans
        where player_id = w.player_id and week_start = v_week and id <> coalesce(v_pid, '00000000-0000-0000-0000-000000000000'::uuid)
        order by (status = 'confermato') desc, created_at desc loop
      if exists (select 1 from crm_week_plans where id = v_old and status = 'confermato') then v_first := false; end if;
      delete from crm_events where week_plan_id = v_old;
      delete from crm_week_plans where id = v_old;
    end loop;
    if v_pid is null then
      insert into crm_week_plans (player_id, week_start, file_path, file_name, created_by)
      values (w.player_id, v_week, w.file_path, w.file_name, auth.uid()) returning id into v_pid;
    else
      if w.status = 'confermato' then v_first := false; end if;
      delete from crm_events where week_plan_id = v_pid;
    end if;
    perform set_config('auvi.week_resave', '', true);

    for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
      if coalesce(it->>'date', '') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(it->>'start', '') !~ '^\d{1,2}:\d{2}$' then continue; end if;
      if date_trunc('week', (it->>'date')::date)::date <> v_week then continue; end if;
      v_start := ((it->>'date') || ' ' || (it->>'start'))::timestamp at time zone v_tz;
      v_end := case when coalesce(it->>'end', '') ~ '^\d{1,2}:\d{2}$'
                    then ((it->>'date') || ' ' || (it->>'end'))::timestamp at time zone v_tz end;
      if v_end is not null and v_end <= v_start then v_end := null; end if;
      insert into crm_events (player_id, title, type, start_at, end_at, location, notes, created_by, visibility, week_plan_id)
      values (w.player_id, coalesce(nullif(trim(it->>'title'), ''), 'Allenamento'),
              case when it->>'type' in ('allenamento','partita','viaggio','medico','personale','visita','nutrizione','call') then it->>'type' else 'allenamento' end,
              v_start, v_end, nullif(trim(coalesce(it->>'location', '')), ''), nullif(trim(coalesce(it->>'notes', '')), ''),
              auth.uid(), 'team', v_pid);
      n := n + 1;
    end loop;
    update crm_week_plans set status = 'confermato', confirmed_at = now() where id = v_pid;
    nw := nw + 1;
  end loop;

  perform crm_notify_team(w.player_id,
    coalesce(v_name, 'L''atleta') || case when v_first then ' ha caricato il programma' else ' ha aggiornato il programma' end
      || case when nw > 1 then ' (' || nw || ' settimane)' else ' della settimana' end,
    'Dal ' || to_char(v_weeks[1], 'DD/MM') || ' · ' || n || ' impegni', 'agenda', auth.uid());
  return jsonb_build_object('events', n, 'weeks', nw);
end $$;
revoke execute on function public.crm_save_week_plans(uuid, jsonb, date[]) from public, anon;
grant execute on function public.crm_save_week_plans(uuid, jsonb, date[]) to authenticated;
