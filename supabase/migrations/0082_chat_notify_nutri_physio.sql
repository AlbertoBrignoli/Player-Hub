-- Chat dirette con nutrizionista e fisioterapista: la notifica andava ad AUVI invece che a loro.
create or replace function public.crm_message_notify()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_recipient text;
begin
  if new.channel like 'brand:%' then
    v_recipient := case when new.sender_role = 'brand' then 'player' else 'brand' end;
  elsif new.channel = 'fitness' then
    v_recipient := case when new.sender_role = 'preparatore' then 'player' else 'preparatore' end;
  elsif new.channel in ('agente', 'assicuratore', 'wealth', 'commercialista', 'nutrizionista', 'fisioterapista') then
    v_recipient := case when new.sender_role = new.channel then 'player' else new.channel end;
  else
    v_recipient := case when new.sender_role = 'player' then 'admin' else 'player' end;
  end if;

  insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
  values (v_recipient, 'Messaggio da ' || coalesce(new.sender_name, 'AUVI'),
          left(new.body, 140), 'messages', new.player_id, new.sender_id);
  return new;
end $$;
