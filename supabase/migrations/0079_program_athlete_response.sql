-- Scheda pubblicata: prima della seduta l'atleta risponde al preparatore (v12.4).
--   confermato = "Lo farò" · in_attesa = non sa ancora · online = chiede di farla online.
-- Una sola funzione server: controlla che la scheda sia sua e avvisa il preparatore
-- con una notifica che apre proprio quella scheda (fitness?program=<id>).
alter table public.fitness_programs
  add column if not exists athlete_response text,
  add column if not exists athlete_response_note text,
  add column if not exists athlete_response_at timestamptz;
alter table public.fitness_programs drop constraint if exists fitness_programs_athlete_response_chk;
alter table public.fitness_programs add constraint fitness_programs_athlete_response_chk
  check (athlete_response is null or athlete_response in ('confermato','in_attesa','online'));

create or replace function public.crm_program_respond(p_program uuid, p_response text, p_note text default null)
returns text language plpgsql security definer set search_path = public as $$
declare p fitness_programs; v_atleta text; v_when text; v_title text; v_note text;
begin
  select * into p from fitness_programs where id = p_program;
  if not found or p.deleted_at is not null or p.status <> 'published' then raise exception 'Scheda non trovata'; end if;
  if not (coalesce(p.player_id = current_player_api_id(), false) or coalesce(current_crm_role() in ('admin','creator'), false)) then
    raise exception 'Solo l''atleta può rispondere a questa scheda';
  end if;
  if p_response not in ('confermato','in_attesa','online') then raise exception 'Risposta non valida'; end if;
  v_note := nullif(trim(coalesce(p_note, '')), '');
  update fitness_programs set athlete_response = p_response, athlete_response_note = v_note, athlete_response_at = now()
    where id = p.id;

  select name into v_atleta from player where api_player_id = p.player_id;
  v_atleta := coalesce(v_atleta, 'L''atleta');
  v_when := coalesce(to_char(p.program_date, 'DD/MM'), 'data da definire') || coalesce(' alle ' || to_char(p.start_time, 'HH24:MI'), '');
  v_title := case p_response
    when 'confermato' then v_atleta || ' farà la scheda'
    when 'in_attesa' then v_atleta || ' mette la scheda in attesa'
    else v_atleta || ' chiede di farla online' end;
  insert into crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
  values ('preparatore', v_title, p.name || ' · ' || v_when || coalesce(' · «' || v_note || '»', ''),
          'fitness?program=' || p.id, p.player_id, auth.uid());
  return p_response;
end $$;
revoke execute on function public.crm_program_respond(uuid, text, text) from public, anon;
grant execute on function public.crm_program_respond(uuid, text, text) to authenticated;
