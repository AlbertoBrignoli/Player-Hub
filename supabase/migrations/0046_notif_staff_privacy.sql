-- Notifiche della chat staff (19/10/2026): il procuratore vedeva tutte le notifiche dei suoi
-- atleti, quindi anche "X ha scritto nel gruppo «…»" di chat di cui non fa parte.
-- Ora le notifiche della chat staff le vede solo il ruolo a cui sono indirizzate.
drop policy if exists p_notif_select on public.crm_notifications;
create policy p_notif_select on public.crm_notifications for select to authenticated using (
  (current_crm_role() = any (array['admin', 'creator']))
  or (recipient_role = 'player' and player_id = current_player_api_id())
  or (recipient_role = 'preparatore' and current_crm_role() = 'preparatore' and fitness_can_manage(player_id))
  or (current_crm_role() = 'agente' and crm_agent_sees(player_id)
      and (coalesce(route, '') not like 'messages?staff=%' or recipient_role = 'agente'))
  or (recipient_role = 'assicuratore' and current_crm_role() = 'assicuratore' and crm_insurer_sees(player_id))
  or (recipient_role = 'commercialista' and current_crm_role() = 'commercialista' and crm_tax_sees(player_id))
  or (recipient_role = 'fisioterapista' and current_crm_role() = 'fisioterapista' and crm_physio_sees(player_id))
  or (recipient_role = 'nutrizionista' and current_crm_role() = 'nutrizionista' and crm_nutri_sees(player_id))
  or (recipient_role = 'brand' and crm_brand_sees(player_id))
  or (recipient_role = 'partner' and route like 'partner-home?req=%' and
      case when route ~ 'req=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
           then crm_is_request_partner((substring(route, 'req=([0-9a-f-]{36})'))::uuid)
           else false end));
