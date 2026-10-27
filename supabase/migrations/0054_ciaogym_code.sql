-- CiaoGym: codice sconto unico CIAOAUVI, 10% online e in negozio.
update public.crm_brand_deals set code = 'CIAOAUVI', discount_label = '-10%',
  terms = '10% di sconto online e in negozio. Online: inserisci il codice nel carrello, prima del pagamento. In negozio: mostra il codice alla cassa.',
  i18n = jsonb_set(i18n, '{en,terms}', '"10% off online and in store. Online: enter the code in your cart before paying. In store: show the code at the checkout."')
where brand_name = 'CiaoGym';
