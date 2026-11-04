-- Spunte di lettura nelle chat dirette (come WhatsApp): read_at = quando il destinatario l'ha letto.
-- crm_messages_mark_read segna come letti i messaggi degli ALTRI in una conversazione, solo se chi
-- chiama quella conversazione la può vedere (stessa regola della lettura, p_messages_read).
alter table public.crm_messages add column if not exists read_at timestamptz;

create or replace function public.crm_messages_mark_read(p_player bigint, p_channel text)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare n integer;
begin
  update public.crm_messages m set read_at = now()
   where m.player_id = p_player
     and coalesce(m.channel, 'team') = coalesce(p_channel, 'team')
     and m.sender_id is distinct from auth.uid()
     and m.read_at is null
     and (crm_is_admin()
       or (current_crm_role() = 'player' and m.player_id = current_player_api_id())
       or (current_crm_role() = 'preparatore' and m.channel = 'fitness' and fitness_can_manage(m.player_id))
       or (current_crm_role() = 'agente' and crm_agent_sees(m.player_id) and coalesce(m.channel, 'team') in ('team', 'agente'))
       or (current_crm_role() = 'assicuratore' and crm_insurer_sees(m.player_id) and m.channel = 'assicuratore')
       or (current_crm_role() = 'commercialista' and crm_tax_sees(m.player_id) and m.channel = 'commercialista')
       or (current_crm_role() = 'fisioterapista' and crm_physio_sees(m.player_id) and m.channel = 'fisioterapista')
       or (current_crm_role() = 'nutrizionista' and crm_nutri_sees(m.player_id) and m.channel = 'nutrizionista')
       or (m.channel = 'brand:' || crm_my_brand_id()::text and crm_brand_partner(m.player_id))
       or (current_crm_role() = 'wealth' and crm_wealth_sees(m.player_id) and m.channel = 'wealth'));
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.crm_messages_mark_read(bigint, text) to authenticated;
