-- Area "Crea scheda" (29/09/2026): modelli di scheda del preparatore, senza atleta.
-- Un modello (is_template, player_id NULL) si prepara nella libreria e poi si assegna:
-- l'assegnazione crea una copia per ogni atleta (programma normale, con player_id).
alter table public.fitness_programs alter column player_id drop not null;
alter table public.fitness_programs add column if not exists is_template boolean not null default false;
alter table public.fitness_programs drop constraint if exists fitness_programs_template_chk;
alter table public.fitness_programs add constraint fitness_programs_template_chk
  check (is_template or player_id is not null);
create index if not exists idx_fitness_programs_templates on public.fitness_programs (trainer_id) where is_template;

-- chi gestisce un modello: chi l'ha creato (preparatore) oppure AUVI
create or replace function public.fitness_template_owned(p_trainer uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select current_crm_role() in ('admin','creator')
      or (current_crm_role() = 'preparatore' and p_trainer = auth.uid());
$$;
revoke execute on function public.fitness_template_owned(uuid) from public, anon;
grant execute on function public.fitness_template_owned(uuid) to authenticated;

drop policy if exists fp_templates on public.fitness_programs;
create policy fp_templates on public.fitness_programs for all to authenticated
  using (is_template and fitness_template_owned(trainer_id))
  with check (is_template and player_id is null and fitness_template_owned(trainer_id));

create or replace function public.fitness_program_manageable(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.fitness_programs p where p.id = pid and (
    (p.player_id is not null and public.fitness_can_manage(p.player_id))
    or (p.is_template and public.fitness_template_owned(p.trainer_id))))
$$;
create or replace function public.fitness_program_visible(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.fitness_programs p where p.id = pid and (
    (p.player_id is not null and public.fitness_can_manage(p.player_id))
    or (p.player_id = public.current_player_api_id() and p.status = 'published')
    or (p.is_template and public.fitness_template_owned(p.trainer_id))))
$$;

-- i modelli non vanno mai in agenda
create or replace function public.fitness_sync_agenda()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_start timestamptz;
begin
  if new.is_template or new.player_id is null then
    return new;
  end if;
  if new.status = 'published' and new.program_date is not null then
    v_start := (new.program_date + coalesce(new.start_time, '09:00'::time)) at time zone 'Europe/Rome';
    if exists (select 1 from public.crm_events where fitness_program_id = new.id) then
      update public.crm_events set
        title = new.name, type = 'allenamento', start_at = v_start,
        end_at = v_start + make_interval(mins => coalesce(new.duration_min, 60)),
        player_id = new.player_id, notes = new.focus
      where fitness_program_id = new.id;
    else
      insert into public.crm_events (title, type, start_at, end_at, player_id, notes, fitness_program_id)
      values (new.name, 'allenamento', v_start,
              v_start + make_interval(mins => coalesce(new.duration_min, 60)),
              new.player_id, new.focus, new.id);
    end if;
  elsif new.status = 'draft' then
    delete from public.crm_events where fitness_program_id = new.id;
  end if;
  return new;
end;
$$;
