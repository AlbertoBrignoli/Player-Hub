-- Brand: sconto personale per atleta (es. Brignoli -15% su CiaoGym, gli altri -10%).
-- Il badge personale si vede prima di attivare il codice, il codice resta nascosto fino all'attivazione.
alter table public.crm_brand_deal_codes add column if not exists discount_label text;

create or replace function public.crm_brand_deal_labels_for(p_player bigint)
returns table(deal_id uuid, discount_label text)
language sql stable security definer set search_path to 'public' as $$
  select c.deal_id, c.discount_label
    from crm_brand_deal_codes c
   where c.player_id = p_player and c.discount_label is not null
     and (crm_manages_player(p_player) or crm_team_sees(p_player));
$$;
grant execute on function public.crm_brand_deal_labels_for(bigint) to authenticated;

update public.crm_brand_deal_codes set discount_label = '-15%'
 where player_id = 31538 and code = 'CIAOBRIGNO15';

-- la percentuale sta nel badge: le istruzioni restano uguali per tutti
update public.crm_brand_deals set
  terms = 'Valido online e in negozio. Online: inserisci il codice nel carrello, prima del pagamento. In negozio: mostra il codice alla cassa.',
  i18n = jsonb_set(i18n, '{en,terms}', '"Valid online and in store. Online: enter the code in your cart before paying. In store: show the code at the checkout."')
where brand_name = 'CiaoGym';
