-- Messa in sicurezza (audit 29/09/2026)
-- 1) crm_profiles: un utente poteva aggiornare la PROPRIA riga su qualsiasi colonna
--    (role -> 'admin', player_api_id -> altro atleta). Ora solo full_name.
--    Il cambio ruolo passa da crm_switch_role() (verifica crm_user_roles),
--    la creazione profilo dal trigger su auth.users.
revoke insert, update on public.crm_profiles from anon, authenticated;
grant update (full_name) on public.crm_profiles to authenticated;

drop policy if exists p_profiles_update_self on public.crm_profiles;
create policy p_profiles_update_self on public.crm_profiles for update to authenticated
  using (id = auth.uid() or crm_is_admin())
  with check (id = auth.uid() or crm_is_admin());

-- 2) Storage: UPDATE (sovrascrittura) solo admin o proprietario del file;
--    crm-documents non scrivibile dal ruolo brand.
drop policy if exists p_crmdoc_update on storage.objects;
create policy p_crmdoc_update on storage.objects for update to authenticated
  using (bucket_id = 'crm-documents' and (crm_is_admin() or owner_id = auth.uid()::text));

drop policy if exists p_crmdoc_insert on storage.objects;
create policy p_crmdoc_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'crm-documents' and coalesce(crm_my_role(), 'brand') <> 'brand');

drop policy if exists p_crmmedia_update on storage.objects;
create policy p_crmmedia_update on storage.objects for update to authenticated
  using (bucket_id = 'crm-media' and (crm_is_admin() or owner_id = auth.uid()::text));

drop policy if exists p_brandlogos_update on storage.objects;
create policy p_brandlogos_update on storage.objects for update to authenticated
  using (bucket_id = 'brand-logos' and (crm_is_admin() or owner_id = auth.uid()::text));

-- 3) Funzioni SECURITY DEFINER: niente esecuzione da anonimi, tranne le due
--    usate dalla pagina di login (verifica email, riscatto invito).
--    Funzioni trigger e job cron: nessuno le chiama via API.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname,
           p.prorettype = 'trigger'::regtype as is_trigger
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    if f.proname in ('crm_check_email_allowed', 'crm_redeem_invite') then
      continue;
    end if;
    execute format('revoke execute on function %s from public, anon', f.sig);
    if f.is_trigger or f.proname in (
      'crm_insurance_expiry_check', 'crm_tax_due_check', 'crm_pre_match_check',
      'sync_matches_to_stats', 'crm_policy_agenda_cleanup', 'crm_tax_agenda_cleanup'
    ) then
      execute format('revoke execute on function %s from authenticated', f.sig);
    else
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;

-- 4) Viste SECURITY DEFINER: mai leggibili da anonimi.
revoke all on public.crm_athlete_team, public.cp_preferences_public, public.cp_roster_public,
  public.crm_services_public, public.auvi_ops_feed from anon;

-- 5) search_path fisso
alter function public.crm_policy_annual_cost set search_path = public;
alter function public.crm_gen_access_code set search_path = public;
