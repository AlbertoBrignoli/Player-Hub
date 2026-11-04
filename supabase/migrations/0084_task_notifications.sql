-- Task: notifiche che mancavano.
--  - task assegnato all'atleta (nuovo o riassegnato a lui) → notifica "Da fare: …" che apre la Home,
--    dove lo trova nella sezione Da fare e lo smarca con un tocco
--  - l'atleta lo smarca → ad AUVI arriva "Fatto: …"
create or replace function public.crm_task_notify()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_atleta text;
begin
  if new.assignee = 'player' and new.status <> 'done'
     and (tg_op = 'INSERT' or old.assignee is distinct from 'player') then
    insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('player', 'Da fare: ' || new.title,
            coalesce('entro il ' || to_char(new.due_date, 'DD/MM/YYYY'), 'Smarcalo dalla Home quando hai fatto'),
            'dashboard', new.player_id, auth.uid());
  end if;
  if tg_op = 'UPDATE' and new.status = 'done' and old.status is distinct from 'done'
     and current_crm_role() = 'player' then
    select name into v_atleta from public.player where api_player_id = new.player_id;
    insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('admin', 'Fatto: ' || new.title, coalesce(v_atleta, 'Atleta'), 'tasks', new.player_id, auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists trg_task_notify on public.crm_tasks;
create trigger trg_task_notify after insert or update on public.crm_tasks
  for each row execute function public.crm_task_notify();
