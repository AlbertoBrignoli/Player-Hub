-- Home del professionista: solo le voci condivise ancora aperte (non chiuse, scadute o passate).
create or replace function public.crm_my_tagged_items()
returns table (kind text, item_id uuid, player_id bigint, title text, due date)
language sql stable security definer set search_path to 'public' as $$
  select t.kind, t.item_id, m.player_id, m.title, m.due
    from public.crm_item_people t, lateral public.crm_item_meta(t.kind, t.item_id) m
   where t.user_id = auth.uid()
     and case t.kind
       when 'wealth' then exists (select 1 from crm_wealth_items i where i.id = t.item_id and i.status = 'aperto')
       when 'tax' then exists (select 1 from crm_tax_items i where i.id = t.item_id and i.status = 'aperto')
       when 'insurance' then exists (select 1 from crm_insurance_policies i where i.id = t.item_id and coalesce(i.status, '') <> 'disdetta')
       when 'contract' then exists (select 1 from crm_contracts i where i.id = t.item_id and coalesce(i.status, '') <> 'expired')
       when 'event' then exists (select 1 from crm_events e where e.id = t.item_id and e.start_at >= now() - interval '1 day')
       else false end;
$$;
