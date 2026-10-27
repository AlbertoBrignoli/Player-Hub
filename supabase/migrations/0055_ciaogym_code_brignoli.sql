-- CiaoGym: codice dedicato CIAOBRIGNO15 solo per Alberto Brignoli (31538); gli altri usano CIAOAUVI.
insert into public.crm_brand_deal_codes (deal_id, player_id, code)
select id, 31538, 'CIAOBRIGNO15' from public.crm_brand_deals where brand_name = 'CiaoGym'
on conflict (deal_id, player_id) do update set code = excluded.code;
