-- Il team dell'atleta vede l'indirizzo della sua casella AUVI (dove mandare documenti e
-- comunicazioni), non le mail: la casella resta leggibile solo da atleta e AUVI.
create or replace function public.crm_athlete_mail_addresses(p_players bigint[])
returns table (player_id bigint, address text)
language sql stable security definer set search_path to 'public' as $$
  select m.player_id, m.address from public.crm_mailboxes m
   where m.active and m.player_id = any (p_players)
     and (crm_manages_player(m.player_id) or crm_team_sees(m.player_id));
$$;
