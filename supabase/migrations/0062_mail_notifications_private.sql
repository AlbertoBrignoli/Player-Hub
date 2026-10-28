-- Le notifiche della casella di posta (route "mail?...") restano tra atleta e AUVI:
-- procuratore, staff e creator non vedono mittente e oggetto delle mail dell'atleta.
-- (La policy esistente si mantiene identica e le si aggiunge la condizione.)
do $$
declare q text;
begin
  select qual into q from pg_policies where tablename = 'crm_notifications' and policyname = 'p_notif_select';
  execute 'drop policy p_notif_select on public.crm_notifications';
  execute format('create policy p_notif_select on public.crm_notifications for select using ((%s) and (coalesce(route, '''') !~~ ''mail?%%'' or current_crm_role() = any (array[''admin'', ''player''])))', q);
end $$;
