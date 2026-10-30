-- CiaoGym gifting: un'offerta per atleta. Pirola vede solo la sua, Zortea solo la sua
-- (nessun nome o id dell'altro nella descrizione né nei destinatari).
update public.crm_gift_offers
   set recipients = array[134431]::bigint[],
       description = 'Una selezione di capi CiaoGym in omaggio, riservata a Lorenzo Pirola. Scopri la selezione, scegli i capi e indica le taglie. AUVI confermerà la disponibilità e organizzerà la spedizione.'
 where title = 'CiaoGym — Gifting dedicato' and 134431 = any (recipients);

insert into public.crm_gift_offers (deal_id, brand_name, title, description, recipients, deadline, deadline_tz)
select deal_id, brand_name, title,
       'Una selezione di capi CiaoGym in omaggio, riservata a Nadir Zortea. Scopri la selezione, scegli i capi e indica le taglie. AUVI confermerà la disponibilità e organizzerà la spedizione.',
       array[128461]::bigint[], deadline, deadline_tz
  from public.crm_gift_offers
 where title = 'CiaoGym — Gifting dedicato' and recipients = array[134431]::bigint[]
   and not exists (select 1 from public.crm_gift_offers where 128461 = any (recipients));

insert into public.crm_gift_items (offer_id, sort, name, color, url, image_url, sizes, needs_confirm, admin_note)
select z.id, i.sort, i.name, i.color, i.url, i.image_url, i.sizes, i.needs_confirm, i.admin_note
  from public.crm_gift_items i
  join public.crm_gift_offers p on p.id = i.offer_id and p.recipients = array[134431]::bigint[]
  join public.crm_gift_offers z on z.recipients = array[128461]::bigint[] and z.title = p.title
on conflict (offer_id, url) do nothing;
