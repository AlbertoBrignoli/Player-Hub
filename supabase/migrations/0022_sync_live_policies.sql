-- 0022_sync_live_policies.sql
-- Snapshot delle policy RLS + funzioni di accesso dal DB PLAYER HUB (live).
-- Estratto il 2026-07-23. Allinea il repo alla produzione ed evita che un
-- db push / re-apply faccia regredire il modello di accesso (chat preparatore,
-- agente, assicuratore, commercialista, brand incluse). Idempotente.
-- Esclude i trigger con secret/URL specifici del progetto. Presuppone che le
-- tabelle esistano gia' (istanza live); per un DB nuovo usa prima: supabase db pull.

begin;
set local check_function_bodies = off;

-- ============ FUNZIONI DI ACCESSO (SECURITY DEFINER) ============
CREATE OR REPLACE FUNCTION public.crm_agent_sees(p_api bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select current_crm_role() = 'agente'
     and exists (
       select 1 from public.crm_agent_athletes a
       where a.agent_id = auth.uid() and a.player_id = p_api
     );
$function$
;

CREATE OR REPLACE FUNCTION public.crm_brand_sees(p_api bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select current_crm_role() = 'brand'
     and exists (
       select 1 from public.crm_brand_athletes ba
       where ba.brand_id = public.crm_my_brand_id() and ba.player_id = p_api
     );
$function$
;

CREATE OR REPLACE FUNCTION public.crm_insurer_sees(p_api bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select current_crm_role() = 'assicuratore'
     and exists (
       select 1 from public.crm_insurer_athletes i
       where i.insurer_id = auth.uid() and i.player_id = p_api
     );
$function$
;

CREATE OR REPLACE FUNCTION public.crm_is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.crm_profiles where id = auth.uid() and role = 'admin');
$function$
;

CREATE OR REPLACE FUNCTION public.crm_manages_player(p_api bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select current_crm_role() = any (array['admin','creator'])
      or (current_crm_role() = 'player' and p_api = current_player_api_id())
      or public.crm_agent_sees(p_api);
$function$
;

CREATE OR REPLACE FUNCTION public.crm_my_brand_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select w.brand_id
       from public.crm_allowed_emails w
       join public.crm_profiles p on lower(p.email) = lower(w.email)
      where p.id = auth.uid() and w.brand_id is not null
      limit 1),
    (select b.id from public.crm_brands b where b.owner_id = auth.uid() limit 1)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.crm_my_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select role from public.crm_profiles where id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.crm_tax_sees(p_api bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select current_crm_role() = 'commercialista'
     and exists (select 1 from public.crm_tax_athletes t
                 where t.advisor_id = auth.uid() and t.player_id = p_api);
$function$
;

CREATE OR REPLACE FUNCTION public.current_crm_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select role::text from public.crm_profiles where id = auth.uid()
$function$
;

CREATE OR REPLACE FUNCTION public.current_player_api_id()
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select player_api_id from public.crm_profiles where id = auth.uid()
$function$
;

CREATE OR REPLACE FUNCTION public.fitness_can_manage(p_api bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.current_crm_role() in ('admin','creator')
    or (public.current_crm_role()='preparatore'
        and exists(select 1 from public.fitness_trainer_athletes a
                   where a.trainer_id = auth.uid() and a.player_id = p_api))
$function$
;

CREATE OR REPLACE FUNCTION public.fitness_program_manageable(pid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists(select 1 from public.fitness_programs p where p.id = pid and public.fitness_can_manage(p.player_id))
$function$
;

CREATE OR REPLACE FUNCTION public.fitness_program_visible(pid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists(select 1 from public.fitness_programs p where p.id = pid and (
    public.fitness_can_manage(p.player_id)
    or (p.player_id = public.current_player_api_id() and p.status='published')))
$function$
;

-- ============ ABILITA RLS ============
alter table if exists public.coach_clients enable row level security;
alter table if exists public.coach_ledger enable row level security;
alter table if exists public.coach_sessions enable row level security;
alter table if exists public.cp_brand_categories enable row level security;
alter table if exists public.cp_brand_search enable row level security;
alter table if exists public.cp_collaborations enable row level security;
alter table if exists public.cp_config enable row level security;
alter table if exists public.cp_internal_evals enable row level security;
alter table if exists public.cp_opportunities enable row level security;
alter table if exists public.cp_opportunity_events enable row level security;
alter table if exists public.cp_opportunity_private enable row level security;
alter table if exists public.cp_performance enable row level security;
alter table if exists public.cp_profiles enable row level security;
alter table if exists public.cp_public_teaser enable row level security;
alter table if exists public.cp_score_snapshots enable row level security;
alter table if exists public.cp_social_accounts enable row level security;
alter table if exists public.crm_access_requests enable row level security;
alter table if exists public.crm_agent_athletes enable row level security;
alter table if exists public.crm_agent_profile enable row level security;
alter table if exists public.crm_allowed_emails enable row level security;
alter table if exists public.crm_brand_athletes enable row level security;
alter table if exists public.crm_brands enable row level security;
alter table if exists public.crm_contracts enable row level security;
alter table if exists public.crm_documents enable row level security;
alter table if exists public.crm_editorial enable row level security;
alter table if exists public.crm_events enable row level security;
alter table if exists public.crm_insurance_payments enable row level security;
alter table if exists public.crm_insurance_policies enable row level security;
alter table if exists public.crm_insurance_reminders enable row level security;
alter table if exists public.crm_insurer_athletes enable row level security;
alter table if exists public.crm_insurer_profile enable row level security;
alter table if exists public.crm_media enable row level security;
alter table if exists public.crm_messages enable row level security;
alter table if exists public.crm_notifications enable row level security;
alter table if exists public.crm_payments enable row level security;
alter table if exists public.crm_profiles enable row level security;
alter table if exists public.crm_push_subscriptions enable row level security;
alter table if exists public.crm_sponsors enable row level security;
alter table if exists public.crm_tasks enable row level security;
alter table if exists public.crm_tax_athletes enable row level security;
alter table if exists public.crm_tax_items enable row level security;
alter table if exists public.crm_tax_profile enable row level security;
alter table if exists public.crm_tax_reminders enable row level security;
alter table if exists public.crm_user_roles enable row level security;
alter table if exists public.fitness_coach_profile enable row level security;
alter table if exists public.fitness_exercise_library enable row level security;
alter table if exists public.fitness_exercises enable row level security;
alter table if exists public.fitness_feedback enable row level security;
alter table if exists public.fitness_programs enable row level security;
alter table if exists public.fitness_requests enable row level security;
alter table if exists public.fitness_trainer_athletes enable row level security;
alter table if exists public.matches enable row level security;
alter table if exists public.news enable row level security;
alter table if exists public.player enable row level security;
alter table if exists public.player_stats_api enable row level security;
alter table if exists public.player_stats_match enable row level security;

-- ============ POLICY RLS ============
drop policy if exists "p_coach_clients_own" on public.coach_clients;
create policy "p_coach_clients_own" on public.coach_clients for all to authenticated using ((trainer_id = auth.uid())) with check ((trainer_id = auth.uid()));

drop policy if exists "p_coach_ledger_own" on public.coach_ledger;
create policy "p_coach_ledger_own" on public.coach_ledger for all to authenticated using ((trainer_id = auth.uid())) with check ((trainer_id = auth.uid()));

drop policy if exists "p_coach_sessions_own" on public.coach_sessions;
create policy "p_coach_sessions_own" on public.coach_sessions for all to authenticated using ((trainer_id = auth.uid())) with check ((trainer_id = auth.uid()));

drop policy if exists "p_cp_cats_admin" on public.cp_brand_categories;
create policy "p_cp_cats_admin" on public.cp_brand_categories for all to authenticated using (crm_is_admin()) with check (crm_is_admin());

drop policy if exists "p_cp_cats_read" on public.cp_brand_categories;
create policy "p_cp_cats_read" on public.cp_brand_categories for select to authenticated using (true);

drop policy if exists "p_bsearch_admin" on public.cp_brand_search;
create policy "p_bsearch_admin" on public.cp_brand_search for all to authenticated using (crm_is_admin()) with check (crm_is_admin());

drop policy if exists "p_bsearch_own" on public.cp_brand_search;
create policy "p_bsearch_own" on public.cp_brand_search for all to authenticated using ((brand_id = crm_my_brand_id())) with check ((brand_id = crm_my_brand_id()));

drop policy if exists "p_cp_collab_admin" on public.cp_collaborations;
create policy "p_cp_collab_admin" on public.cp_collaborations for all to authenticated using (crm_is_admin()) with check (crm_is_admin());

drop policy if exists "p_cp_collab_player_update" on public.cp_collaborations;
create policy "p_cp_collab_player_update" on public.cp_collaborations for update to authenticated using ((crm_my_role() = 'player'::text)) with check ((crm_my_role() = 'player'::text));

drop policy if exists "p_cp_collaborations_agent" on public.cp_collaborations;
create policy "p_cp_collaborations_agent" on public.cp_collaborations for all to authenticated using (crm_agent_sees(player_id)) with check (crm_agent_sees(player_id));

drop policy if exists "p_cp_collaborations_scoped" on public.cp_collaborations;
create policy "p_cp_collaborations_scoped" on public.cp_collaborations for select to authenticated using (crm_manages_player(player_id));

drop policy if exists "p_cp_config_admin" on public.cp_config;
create policy "p_cp_config_admin" on public.cp_config for all to authenticated using (crm_is_admin()) with check (crm_is_admin());

drop policy if exists "p_cp_config_read" on public.cp_config;
create policy "p_cp_config_read" on public.cp_config for select to authenticated using ((crm_my_role() <> 'brand'::text));

drop policy if exists "p_cp_evals_admin" on public.cp_internal_evals;
create policy "p_cp_evals_admin" on public.cp_internal_evals for all to authenticated using (crm_is_admin()) with check (crm_is_admin());

drop policy if exists "p_cp_internal_evals_agent" on public.cp_internal_evals;
create policy "p_cp_internal_evals_agent" on public.cp_internal_evals for all to authenticated using (crm_agent_sees(player_id)) with check (crm_agent_sees(player_id));

drop policy if exists "p_cp_internal_evals_scoped" on public.cp_internal_evals;
create policy "p_cp_internal_evals_scoped" on public.cp_internal_evals for select to authenticated using (crm_manages_player(player_id));

drop policy if exists "p_cp_opp_admin" on public.cp_opportunities;
create policy "p_cp_opp_admin" on public.cp_opportunities for all to authenticated using (crm_is_admin()) with check (crm_is_admin());

drop policy if exists "p_cp_opp_player_update" on public.cp_opportunities;
create policy "p_cp_opp_player_update" on public.cp_opportunities for update to authenticated using ((crm_my_role() = 'player'::text)) with check ((crm_my_role() = 'player'::text));

drop policy if exists "p_cp_opportunities_agent" on public.cp_opportunities;
create policy "p_cp_opportunities_agent" on public.cp_opportunities for all to authenticated using (crm_agent_sees(player_id)) with check (crm_agent_sees(player_id));

drop policy if exists "p_cp_opportunities_scoped" on public.cp_opportunities;
create policy "p_cp_opportunities_scoped" on public.cp_opportunities for select to authenticated using (crm_manages_player(player_id));

drop policy if exists "p_cp_oev_insert" on public.cp_opportunity_events;
create policy "p_cp_oev_insert" on public.cp_opportunity_events for insert to authenticated with check ((crm_my_role() = ANY (ARRAY['admin'::text, 'player'::text])));

drop policy if exists "p_cp_oev_read" on public.cp_opportunity_events;
create policy "p_cp_oev_read" on public.cp_opportunity_events for select to authenticated using ((crm_my_role() <> 'brand'::text));

drop policy if exists "p_cp_opp_priv_admin" on public.cp_opportunity_private;
create policy "p_cp_opp_priv_admin" on public.cp_opportunity_private for all to authenticated using (crm_is_admin()) with check (crm_is_admin());

drop policy if exists "p_cp_perf_admin" on public.cp_performance;
create policy "p_cp_perf_admin" on public.cp_performance for all to authenticated using (crm_is_admin()) with check (crm_is_admin());

drop policy if exists "p_cp_perf_read" on public.cp_performance;
create policy "p_cp_perf_read" on public.cp_performance for select to authenticated using ((crm_my_role() <> 'brand'::text));

drop policy if exists "p_cp_performance_agent" on public.cp_performance;
create policy "p_cp_performance_agent" on public.cp_performance for all to authenticated using (crm_agent_sees(player_id)) with check (crm_agent_sees(player_id));

drop policy if exists "p_cp_performance_scoped" on public.cp_performance;
create policy "p_cp_performance_scoped" on public.cp_performance for select to authenticated using (crm_manages_player(player_id));

drop policy if exists "p_cp_prof_update" on public.cp_profiles;
create policy "p_cp_prof_update" on public.cp_profiles for update to authenticated using ((crm_my_role() = ANY (ARRAY['admin'::text, 'player'::text]))) with check ((crm_my_role() = ANY (ARRAY['admin'::text, 'player'::text])));

drop policy if exists "p_cp_prof_write" on public.cp_profiles;
create policy "p_cp_prof_write" on public.cp_profiles for insert to authenticated with check ((crm_my_role() = ANY (ARRAY['admin'::text, 'player'::text])));

drop policy if exists "p_cp_profiles_agent" on public.cp_profiles;
create policy "p_cp_profiles_agent" on public.cp_profiles for all to authenticated using (crm_agent_sees(player_id)) with check (crm_agent_sees(player_id));

drop policy if exists "p_cp_profiles_scoped" on public.cp_profiles;
create policy "p_cp_profiles_scoped" on public.cp_profiles for select to authenticated using (crm_manages_player(player_id));

drop policy if exists "p_cp_teaser_admin" on public.cp_public_teaser;
create policy "p_cp_teaser_admin" on public.cp_public_teaser for all to authenticated using (crm_is_admin()) with check (crm_is_admin());

drop policy if exists "p_cp_teaser_read" on public.cp_public_teaser;
create policy "p_cp_teaser_read" on public.cp_public_teaser for select to authenticated using (((published = true) OR crm_is_admin()));

drop policy if exists "p_cp_teaser_scoped" on public.cp_public_teaser;
create policy "p_cp_teaser_scoped" on public.cp_public_teaser for select to authenticated using ((crm_manages_player(player_id) OR crm_brand_sees(player_id)));

drop policy if exists "p_cp_score_snapshots_agent" on public.cp_score_snapshots;
create policy "p_cp_score_snapshots_agent" on public.cp_score_snapshots for all to authenticated using (crm_agent_sees(player_id)) with check (crm_agent_sees(player_id));

drop policy if exists "p_cp_score_snapshots_scoped" on public.cp_score_snapshots;
create policy "p_cp_score_snapshots_scoped" on public.cp_score_snapshots for select to authenticated using (crm_manages_player(player_id));

drop policy if exists "p_cp_snap_insert" on public.cp_score_snapshots;
create policy "p_cp_snap_insert" on public.cp_score_snapshots for insert to authenticated with check ((crm_my_role() = ANY (ARRAY['admin'::text, 'player'::text, 'creator'::text])));

drop policy if exists "p_cp_snap_read" on public.cp_score_snapshots;
create policy "p_cp_snap_read" on public.cp_score_snapshots for select to authenticated using ((crm_my_role() <> 'brand'::text));

drop policy if exists "p_cp_social_accounts_agent" on public.cp_social_accounts;
create policy "p_cp_social_accounts_agent" on public.cp_social_accounts for all to authenticated using (crm_agent_sees(player_id)) with check (crm_agent_sees(player_id));

drop policy if exists "p_cp_social_accounts_scoped" on public.cp_social_accounts;
create policy "p_cp_social_accounts_scoped" on public.cp_social_accounts for select to authenticated using (crm_manages_player(player_id));

drop policy if exists "p_cp_social_admin" on public.cp_social_accounts;
create policy "p_cp_social_admin" on public.cp_social_accounts for all to authenticated using (crm_is_admin()) with check (crm_is_admin());

drop policy if exists "p_access_req_read" on public.crm_access_requests;
create policy "p_access_req_read" on public.crm_access_requests for select to authenticated using (((current_crm_role() = 'admin'::text) OR ((requester_id = auth.uid()) AND (requester_role = current_crm_role())) OR ((current_crm_role() = 'player'::text) AND (player_id = current_player_api_id()))));

drop policy if exists "p_agent_athletes_admin" on public.crm_agent_athletes;
create policy "p_agent_athletes_admin" on public.crm_agent_athletes for all to authenticated using ((current_crm_role() = 'admin'::text)) with check ((current_crm_role() = 'admin'::text));

drop policy if exists "p_agent_athletes_read" on public.crm_agent_athletes;
create policy "p_agent_athletes_read" on public.crm_agent_athletes for select to authenticated using (((current_crm_role() = ANY (ARRAY['admin'::text, 'creator'::text])) OR (agent_id = auth.uid()) OR (player_id = current_player_api_id())));

drop policy if exists "p_agent_profile_own" on public.crm_agent_profile;
create policy "p_agent_profile_own" on public.crm_agent_profile for all to authenticated using ((agent_id = auth.uid())) with check ((agent_id = auth.uid()));

drop policy if exists "p_agent_profile_read" on public.crm_agent_profile;
create policy "p_agent_profile_read" on public.crm_agent_profile for select to authenticated using (((current_crm_role() = ANY (ARRAY['admin'::text, 'creator'::text])) OR (agent_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM crm_agent_athletes a
  WHERE ((a.agent_id = crm_agent_profile.agent_id) AND (a.player_id = current_player_api_id()))))));

drop policy if exists "p_allowed_admin" on public.crm_allowed_emails;
create policy "p_allowed_admin" on public.crm_allowed_emails for all to authenticated using (crm_is_admin()) with check (crm_is_admin());

drop policy if exists "p_brand_athletes_admin" on public.crm_brand_athletes;
create policy "p_brand_athletes_admin" on public.crm_brand_athletes for all to authenticated using ((current_crm_role() = 'admin'::text)) with check ((current_crm_role() = 'admin'::text));

drop policy if exists "p_brand_athletes_read" on public.crm_brand_athletes;
create policy "p_brand_athletes_read" on public.crm_brand_athletes for select to authenticated using (((current_crm_role() = ANY (ARRAY['admin'::text, 'creator'::text])) OR (EXISTS ( SELECT 1
   FROM crm_brands b
  WHERE ((b.id = crm_brand_athletes.brand_id) AND (b.owner_id = auth.uid())))) OR (player_id = current_player_api_id())));

drop policy if exists "p_brands_own" on public.crm_brands;
create policy "p_brands_own" on public.crm_brands for all to authenticated using (((owner_id = auth.uid()) OR (id = crm_my_brand_id()))) with check (((owner_id = auth.uid()) OR (id = crm_my_brand_id())));

drop policy if exists "p_brands_team" on public.crm_brands;
create policy "p_brands_team" on public.crm_brands for all to authenticated using ((crm_my_role() = ANY (ARRAY['admin'::text, 'player'::text]))) with check ((crm_my_role() = ANY (ARRAY['admin'::text, 'player'::text])));

drop policy if exists "p_contracts_admin" on public.crm_contracts;
create policy "p_contracts_admin" on public.crm_contracts for all to authenticated using (crm_is_admin()) with check (crm_is_admin());

drop policy if exists "p_contracts_agent" on public.crm_contracts;
create policy "p_contracts_agent" on public.crm_contracts for all to authenticated using (crm_agent_sees(player_id)) with check (crm_agent_sees(player_id));

drop policy if exists "p_contracts_read" on public.crm_contracts;
create policy "p_contracts_read" on public.crm_contracts for select to authenticated using (crm_manages_player(player_id));

drop policy if exists "p_documents_agent" on public.crm_documents;
create policy "p_documents_agent" on public.crm_documents for all to authenticated using (crm_agent_sees(player_id)) with check (crm_agent_sees(player_id));

drop policy if exists "p_documents_delete" on public.crm_documents;
create policy "p_documents_delete" on public.crm_documents for delete to authenticated using ((crm_is_admin() OR (uploaded_by = auth.uid())));

drop policy if exists "p_documents_insert" on public.crm_documents;
create policy "p_documents_insert" on public.crm_documents for insert to authenticated with check ((auth.uid() IS NOT NULL));

drop policy if exists "p_documents_mutate" on public.crm_documents;
create policy "p_documents_mutate" on public.crm_documents for update to authenticated using ((crm_is_admin() OR (uploaded_by = auth.uid())));

drop policy if exists "p_documents_pro" on public.crm_documents;
create policy "p_documents_pro" on public.crm_documents for insert to authenticated with check ((crm_insurer_sees(player_id) OR crm_tax_sees(player_id)));

drop policy if exists "p_documents_read" on public.crm_documents;
create policy "p_documents_read" on public.crm_documents for select to authenticated using ((crm_manages_player(player_id) OR crm_insurer_sees(player_id) OR crm_tax_sees(player_id)));

drop policy if exists "p_editorial_delete" on public.crm_editorial;
create policy "p_editorial_delete" on public.crm_editorial for delete to authenticated using (crm_is_admin());

drop policy if exists "p_editorial_select" on public.crm_editorial;
create policy "p_editorial_select" on public.crm_editorial for select to authenticated using ((crm_manages_player(player_id) OR (brand_id = crm_my_brand_id())));

drop policy if exists "p_editorial_update" on public.crm_editorial;
create policy "p_editorial_update" on public.crm_editorial for update to authenticated using ((crm_manages_player(player_id) OR (brand_id = crm_my_brand_id())));

drop policy if exists "p_editorial_write" on public.crm_editorial;
create policy "p_editorial_write" on public.crm_editorial for insert to public with check (((crm_my_role() <> 'brand'::text) OR ((brand_id = crm_my_brand_id()) AND (player_id = current_player_api_id()))));

drop policy if exists "p_events_admin" on public.crm_events;
create policy "p_events_admin" on public.crm_events for all to authenticated using (crm_is_admin()) with check (crm_is_admin());

drop policy if exists "p_events_agent" on public.crm_events;
create policy "p_events_agent" on public.crm_events for all to authenticated using (crm_agent_sees(player_id)) with check (crm_agent_sees(player_id));

drop policy if exists "p_events_player_del" on public.crm_events;
create policy "p_events_player_del" on public.crm_events for delete to authenticated using (((created_by = auth.uid()) AND (player_id = current_player_api_id())));

drop policy if exists "p_events_player_ins" on public.crm_events;
create policy "p_events_player_ins" on public.crm_events for insert to authenticated with check (((player_id = current_player_api_id()) AND (created_by = auth.uid())));

drop policy if exists "p_events_player_upd" on public.crm_events;
create policy "p_events_player_upd" on public.crm_events for update to authenticated using (((created_by = auth.uid()) AND (player_id = current_player_api_id()))) with check (((created_by = auth.uid()) AND (player_id = current_player_api_id())));

drop policy if exists "p_events_read" on public.crm_events;
create policy "p_events_read" on public.crm_events for select to authenticated using ((crm_manages_player(player_id) OR ((current_crm_role() = 'preparatore'::text) AND fitness_can_manage(player_id)) OR crm_insurer_sees(player_id) OR crm_tax_sees(player_id)));

drop policy if exists "p_ins_pay_admin" on public.crm_insurance_payments;
create policy "p_ins_pay_admin" on public.crm_insurance_payments for all to authenticated using ((current_crm_role() = 'admin'::text)) with check ((current_crm_role() = 'admin'::text));

drop policy if exists "p_ins_pay_insurer" on public.crm_insurance_payments;
create policy "p_ins_pay_insurer" on public.crm_insurance_payments for all to authenticated using (crm_insurer_sees(player_id)) with check (crm_insurer_sees(player_id));

drop policy if exists "p_ins_pay_player" on public.crm_insurance_payments;
create policy "p_ins_pay_player" on public.crm_insurance_payments for all to authenticated using (((current_crm_role() = 'player'::text) AND (player_id = current_player_api_id()))) with check (((current_crm_role() = 'player'::text) AND (player_id = current_player_api_id())));

drop policy if exists "p_ins_pay_read" on public.crm_insurance_payments;
create policy "p_ins_pay_read" on public.crm_insurance_payments for select to authenticated using ((crm_manages_player(player_id) OR crm_insurer_sees(player_id)));

drop policy if exists "p_policies_admin" on public.crm_insurance_policies;
create policy "p_policies_admin" on public.crm_insurance_policies for all to authenticated using ((current_crm_role() = 'admin'::text)) with check ((current_crm_role() = 'admin'::text));

drop policy if exists "p_policies_insurer" on public.crm_insurance_policies;
create policy "p_policies_insurer" on public.crm_insurance_policies for all to authenticated using (crm_insurer_sees(player_id)) with check (crm_insurer_sees(player_id));

drop policy if exists "p_policies_player" on public.crm_insurance_policies;
create policy "p_policies_player" on public.crm_insurance_policies for all to authenticated using (((current_crm_role() = 'player'::text) AND (player_id = current_player_api_id()))) with check (((current_crm_role() = 'player'::text) AND (player_id = current_player_api_id())));

drop policy if exists "p_policies_read" on public.crm_insurance_policies;
create policy "p_policies_read" on public.crm_insurance_policies for select to authenticated using ((crm_manages_player(player_id) OR crm_insurer_sees(player_id)));

drop policy if exists "p_ins_rem_admin" on public.crm_insurance_reminders;
create policy "p_ins_rem_admin" on public.crm_insurance_reminders for all to authenticated using ((current_crm_role() = 'admin'::text)) with check ((current_crm_role() = 'admin'::text));

drop policy if exists "p_insurer_athletes_admin" on public.crm_insurer_athletes;
create policy "p_insurer_athletes_admin" on public.crm_insurer_athletes for all to authenticated using ((current_crm_role() = 'admin'::text)) with check ((current_crm_role() = 'admin'::text));

drop policy if exists "p_insurer_athletes_read" on public.crm_insurer_athletes;
create policy "p_insurer_athletes_read" on public.crm_insurer_athletes for select to authenticated using (((current_crm_role() = ANY (ARRAY['admin'::text, 'creator'::text])) OR (insurer_id = auth.uid()) OR (player_id = current_player_api_id())));

drop policy if exists "p_insurer_profile_own" on public.crm_insurer_profile;
create policy "p_insurer_profile_own" on public.crm_insurer_profile for all to authenticated using ((insurer_id = auth.uid())) with check ((insurer_id = auth.uid()));

drop policy if exists "p_insurer_profile_read" on public.crm_insurer_profile;
create policy "p_insurer_profile_read" on public.crm_insurer_profile for select to authenticated using (((current_crm_role() = ANY (ARRAY['admin'::text, 'creator'::text])) OR (insurer_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM crm_insurer_athletes i
  WHERE ((i.insurer_id = crm_insurer_profile.insurer_id) AND (i.player_id = current_player_api_id()))))));

drop policy if exists "p_media_delete" on public.crm_media;
create policy "p_media_delete" on public.crm_media for delete to authenticated using ((crm_is_admin() OR (uploaded_by = auth.uid())));

drop policy if exists "p_media_insert" on public.crm_media;
create policy "p_media_insert" on public.crm_media for insert to authenticated with check ((uploaded_by = auth.uid()));

drop policy if exists "p_media_select" on public.crm_media;
create policy "p_media_select" on public.crm_media for select to authenticated using ((crm_manages_player(player_id) OR (editorial_id IN ( SELECT crm_editorial.id
   FROM crm_editorial
  WHERE (crm_editorial.brand_id = crm_my_brand_id())))));

drop policy if exists "p_media_update" on public.crm_media;
create policy "p_media_update" on public.crm_media for update to authenticated using (true);

drop policy if exists "p_messages_delete" on public.crm_messages;
create policy "p_messages_delete" on public.crm_messages for delete to authenticated using ((crm_is_admin() OR (sender_id = auth.uid())));

drop policy if exists "p_messages_insert" on public.crm_messages;
create policy "p_messages_insert" on public.crm_messages for insert to authenticated with check (((sender_id = auth.uid()) AND (crm_is_admin() OR ((current_crm_role() = 'player'::text) AND (player_id = current_player_api_id()) AND ((COALESCE(channel, 'team'::text) = ANY (ARRAY['team'::text, 'fitness'::text, 'agente'::text, 'assicuratore'::text, 'commercialista'::text])) OR (channel ~~ 'brand:%'::text))) OR ((current_crm_role() = 'preparatore'::text) AND (channel = 'fitness'::text) AND fitness_can_manage(player_id)) OR ((current_crm_role() = 'agente'::text) AND crm_agent_sees(player_id) AND (COALESCE(channel, 'team'::text) = ANY (ARRAY['team'::text, 'agente'::text]))) OR ((current_crm_role() = 'assicuratore'::text) AND crm_insurer_sees(player_id) AND (channel = 'assicuratore'::text)) OR ((current_crm_role() = 'commercialista'::text) AND crm_tax_sees(player_id) AND (channel = 'commercialista'::text)) OR ((channel = ('brand:'::text || (crm_my_brand_id())::text)) AND crm_brand_sees(player_id)))));

drop policy if exists "p_messages_read" on public.crm_messages;
create policy "p_messages_read" on public.crm_messages for select to authenticated using ((crm_is_admin() OR ((current_crm_role() = 'player'::text) AND (player_id = current_player_api_id())) OR ((current_crm_role() = 'preparatore'::text) AND (channel = 'fitness'::text) AND fitness_can_manage(player_id)) OR ((current_crm_role() = 'agente'::text) AND crm_agent_sees(player_id) AND (COALESCE(channel, 'team'::text) = ANY (ARRAY['team'::text, 'agente'::text]))) OR ((current_crm_role() = 'assicuratore'::text) AND crm_insurer_sees(player_id) AND (channel = 'assicuratore'::text)) OR ((current_crm_role() = 'commercialista'::text) AND crm_tax_sees(player_id) AND (channel = 'commercialista'::text)) OR ((channel = ('brand:'::text || (crm_my_brand_id())::text)) AND crm_brand_sees(player_id))));

drop policy if exists "p_notif_insert" on public.crm_notifications;
create policy "p_notif_insert" on public.crm_notifications for insert to authenticated with check (true);

drop policy if exists "p_notif_select" on public.crm_notifications;
create policy "p_notif_select" on public.crm_notifications for select to authenticated using (((current_crm_role() = ANY (ARRAY['admin'::text, 'creator'::text])) OR ((recipient_role = 'player'::text) AND (player_id = current_player_api_id())) OR ((recipient_role = 'preparatore'::text) AND (current_crm_role() = 'preparatore'::text) AND fitness_can_manage(player_id)) OR ((current_crm_role() = 'agente'::text) AND crm_agent_sees(player_id)) OR ((recipient_role = 'brand'::text) AND crm_brand_sees(player_id))));

drop policy if exists "p_notif_update" on public.crm_notifications;
create policy "p_notif_update" on public.crm_notifications for update to authenticated using (((recipient_role = crm_my_role()) OR ((recipient_role = 'team'::text) AND (crm_my_role() = ANY (ARRAY['admin'::text, 'creator'::text])))));

drop policy if exists "p_payments_admin" on public.crm_payments;
create policy "p_payments_admin" on public.crm_payments for all to authenticated using (crm_is_admin()) with check (crm_is_admin());

drop policy if exists "p_payments_read" on public.crm_payments;
create policy "p_payments_read" on public.crm_payments for select to authenticated using ((crm_my_role() <> 'brand'::text));

drop policy if exists "p_profiles_select" on public.crm_profiles;
create policy "p_profiles_select" on public.crm_profiles for select to authenticated using (((id = auth.uid()) OR crm_is_admin()));

drop policy if exists "p_profiles_update_self" on public.crm_profiles;
create policy "p_profiles_update_self" on public.crm_profiles for update to authenticated using (((id = auth.uid()) OR crm_is_admin()));

drop policy if exists "p_push_own" on public.crm_push_subscriptions;
create policy "p_push_own" on public.crm_push_subscriptions for all to authenticated using ((user_id = auth.uid())) with check ((user_id = auth.uid()));

drop policy if exists "p_sponsors_admin" on public.crm_sponsors;
create policy "p_sponsors_admin" on public.crm_sponsors for all to authenticated using (crm_is_admin()) with check (crm_is_admin());

drop policy if exists "p_sponsors_agent" on public.crm_sponsors;
create policy "p_sponsors_agent" on public.crm_sponsors for all to authenticated using (crm_agent_sees(player_id)) with check (crm_agent_sees(player_id));

drop policy if exists "p_sponsors_read" on public.crm_sponsors;
create policy "p_sponsors_read" on public.crm_sponsors for select to authenticated using (crm_manages_player(player_id));

drop policy if exists "p_tasks_admin" on public.crm_tasks;
create policy "p_tasks_admin" on public.crm_tasks for all to authenticated using (crm_is_admin()) with check (crm_is_admin());

drop policy if exists "p_tasks_agent" on public.crm_tasks;
create policy "p_tasks_agent" on public.crm_tasks for all to authenticated using (crm_agent_sees(player_id)) with check (crm_agent_sees(player_id));

drop policy if exists "p_tasks_player_update" on public.crm_tasks;
create policy "p_tasks_player_update" on public.crm_tasks for update to authenticated using ((assignee = 'player'::text)) with check ((assignee = 'player'::text));

drop policy if exists "p_tasks_read" on public.crm_tasks;
create policy "p_tasks_read" on public.crm_tasks for select to authenticated using (crm_manages_player(player_id));

drop policy if exists "p_tax_athletes_admin" on public.crm_tax_athletes;
create policy "p_tax_athletes_admin" on public.crm_tax_athletes for all to authenticated using ((current_crm_role() = 'admin'::text)) with check ((current_crm_role() = 'admin'::text));

drop policy if exists "p_tax_athletes_read" on public.crm_tax_athletes;
create policy "p_tax_athletes_read" on public.crm_tax_athletes for select to authenticated using (((current_crm_role() = ANY (ARRAY['admin'::text, 'creator'::text])) OR (advisor_id = auth.uid()) OR (player_id = current_player_api_id())));

drop policy if exists "p_tax_items_admin" on public.crm_tax_items;
create policy "p_tax_items_admin" on public.crm_tax_items for all to authenticated using ((current_crm_role() = 'admin'::text)) with check ((current_crm_role() = 'admin'::text));

drop policy if exists "p_tax_items_advisor" on public.crm_tax_items;
create policy "p_tax_items_advisor" on public.crm_tax_items for all to authenticated using (crm_tax_sees(player_id)) with check (crm_tax_sees(player_id));

drop policy if exists "p_tax_items_player" on public.crm_tax_items;
create policy "p_tax_items_player" on public.crm_tax_items for all to authenticated using (((current_crm_role() = 'player'::text) AND (player_id = current_player_api_id()))) with check (((current_crm_role() = 'player'::text) AND (player_id = current_player_api_id())));

drop policy if exists "p_tax_items_read" on public.crm_tax_items;
create policy "p_tax_items_read" on public.crm_tax_items for select to authenticated using ((crm_manages_player(player_id) OR crm_tax_sees(player_id)));

drop policy if exists "p_tax_profile_own" on public.crm_tax_profile;
create policy "p_tax_profile_own" on public.crm_tax_profile for all to authenticated using ((advisor_id = auth.uid())) with check ((advisor_id = auth.uid()));

drop policy if exists "p_tax_profile_read" on public.crm_tax_profile;
create policy "p_tax_profile_read" on public.crm_tax_profile for select to authenticated using (((current_crm_role() = ANY (ARRAY['admin'::text, 'creator'::text])) OR (advisor_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM crm_tax_athletes t
  WHERE ((t.advisor_id = crm_tax_profile.advisor_id) AND (t.player_id = current_player_api_id()))))));

drop policy if exists "p_tax_rem_admin" on public.crm_tax_reminders;
create policy "p_tax_rem_admin" on public.crm_tax_reminders for all to authenticated using ((current_crm_role() = 'admin'::text)) with check ((current_crm_role() = 'admin'::text));

drop policy if exists "p_user_roles_admin" on public.crm_user_roles;
create policy "p_user_roles_admin" on public.crm_user_roles for all to authenticated using ((current_crm_role() = 'admin'::text)) with check ((current_crm_role() = 'admin'::text));

drop policy if exists "p_user_roles_own" on public.crm_user_roles;
create policy "p_user_roles_own" on public.crm_user_roles for select to authenticated using (((user_id = auth.uid()) OR (current_crm_role() = 'admin'::text)));

drop policy if exists "fcp_read" on public.fitness_coach_profile;
create policy "fcp_read" on public.fitness_coach_profile for select to authenticated using (((trainer_id = auth.uid()) OR (current_crm_role() = ANY (ARRAY['admin'::text, 'creator'::text])) OR (EXISTS ( SELECT 1
   FROM fitness_trainer_athletes a
  WHERE ((a.trainer_id = fitness_coach_profile.trainer_id) AND (a.player_id = current_player_api_id()))))));

drop policy if exists "fcp_write" on public.fitness_coach_profile;
create policy "fcp_write" on public.fitness_coach_profile for all to authenticated using ((trainer_id = auth.uid())) with check ((trainer_id = auth.uid()));

drop policy if exists "fel_delete" on public.fitness_exercise_library;
create policy "fel_delete" on public.fitness_exercise_library for delete to authenticated using ((current_crm_role() = ANY (ARRAY['admin'::text, 'creator'::text, 'preparatore'::text])));

drop policy if exists "fel_insert" on public.fitness_exercise_library;
create policy "fel_insert" on public.fitness_exercise_library for insert to authenticated with check ((current_crm_role() = ANY (ARRAY['admin'::text, 'creator'::text, 'preparatore'::text])));

drop policy if exists "fel_read" on public.fitness_exercise_library;
create policy "fel_read" on public.fitness_exercise_library for select to authenticated using ((current_crm_role() = ANY (ARRAY['admin'::text, 'creator'::text, 'preparatore'::text])));

drop policy if exists "fel_update" on public.fitness_exercise_library;
create policy "fel_update" on public.fitness_exercise_library for update to authenticated using ((current_crm_role() = ANY (ARRAY['admin'::text, 'creator'::text, 'preparatore'::text])));

drop policy if exists "fe_manage" on public.fitness_exercises;
create policy "fe_manage" on public.fitness_exercises for all to authenticated using (fitness_program_manageable(program_id)) with check (fitness_program_manageable(program_id));

drop policy if exists "fe_read" on public.fitness_exercises;
create policy "fe_read" on public.fitness_exercises for select to authenticated using (fitness_program_visible(program_id));

drop policy if exists "ff_read" on public.fitness_feedback;
create policy "ff_read" on public.fitness_feedback for select to authenticated using ((fitness_can_manage(player_id) OR (player_id = current_player_api_id()) OR crm_agent_sees(player_id)));

drop policy if exists "ff_write" on public.fitness_feedback;
create policy "ff_write" on public.fitness_feedback for all to authenticated using (((player_id = current_player_api_id()) OR fitness_can_manage(player_id))) with check (((player_id = current_player_api_id()) OR fitness_can_manage(player_id)));

drop policy if exists "fp_manage" on public.fitness_programs;
create policy "fp_manage" on public.fitness_programs for all to authenticated using (fitness_can_manage(player_id)) with check (fitness_can_manage(player_id));

drop policy if exists "fp_read" on public.fitness_programs;
create policy "fp_read" on public.fitness_programs for select to authenticated using ((fitness_can_manage(player_id) OR ((player_id = current_player_api_id()) AND (status = 'published'::text)) OR (crm_agent_sees(player_id) AND (status = 'published'::text))));

drop policy if exists "freq_ins" on public.fitness_requests;
create policy "freq_ins" on public.fitness_requests for insert to authenticated with check ((player_id = current_player_api_id()));

drop policy if exists "freq_read" on public.fitness_requests;
create policy "freq_read" on public.fitness_requests for select to authenticated using ((fitness_can_manage(player_id) OR (player_id = current_player_api_id())));

drop policy if exists "freq_upd" on public.fitness_requests;
create policy "freq_upd" on public.fitness_requests for update to authenticated using (fitness_can_manage(player_id)) with check (fitness_can_manage(player_id));

drop policy if exists "fta_read" on public.fitness_trainer_athletes;
create policy "fta_read" on public.fitness_trainer_athletes for select to authenticated using (((current_crm_role() = ANY (ARRAY['admin'::text, 'creator'::text])) OR (trainer_id = auth.uid())));

drop policy if exists "fta_read_player" on public.fitness_trainer_athletes;
create policy "fta_read_player" on public.fitness_trainer_athletes for select to authenticated using ((player_id = current_player_api_id()));

drop policy if exists "fta_write" on public.fitness_trainer_athletes;
create policy "fta_write" on public.fitness_trainer_athletes for all to authenticated using ((current_crm_role() = 'admin'::text)) with check ((current_crm_role() = 'admin'::text));

drop policy if exists "rls_read_scoped" on public.matches;
create policy "rls_read_scoped" on public.matches for select to authenticated using ((crm_manages_player(player_id) OR ((current_crm_role() = 'preparatore'::text) AND fitness_can_manage(player_id)) OR crm_brand_sees(player_id)));

drop policy if exists "rls_read_scoped" on public.news;
create policy "rls_read_scoped" on public.news for select to authenticated using (((current_crm_role() = ANY (ARRAY['admin'::text, 'creator'::text])) OR (player_id = current_player_api_id()) OR crm_agent_sees(player_id)));

drop policy if exists "rls_player_update" on public.player;
create policy "rls_player_update" on public.player for update to authenticated using (((current_crm_role() = ANY (ARRAY['admin'::text, 'creator'::text])) OR crm_agent_sees(api_player_id)));

drop policy if exists "rls_read_scoped" on public.player;
create policy "rls_read_scoped" on public.player for select to authenticated using (((current_crm_role() = ANY (ARRAY['admin'::text, 'creator'::text])) OR ((current_crm_role() = 'player'::text) AND (api_player_id = current_player_api_id())) OR ((current_crm_role() = 'preparatore'::text) AND (EXISTS ( SELECT 1
   FROM fitness_trainer_athletes a
  WHERE ((a.trainer_id = auth.uid()) AND (a.player_id = player.api_player_id))))) OR crm_agent_sees(api_player_id) OR crm_insurer_sees(api_player_id) OR crm_tax_sees(api_player_id) OR crm_brand_sees(api_player_id)));

drop policy if exists "rls_read_scoped" on public.player_stats_api;
create policy "rls_read_scoped" on public.player_stats_api for select to authenticated using ((crm_manages_player(player_id) OR ((current_crm_role() = 'preparatore'::text) AND fitness_can_manage(player_id)) OR crm_brand_sees(player_id)));

drop policy if exists "p_stats_admin" on public.player_stats_match;
create policy "p_stats_admin" on public.player_stats_match for all to authenticated using (crm_is_admin()) with check (crm_is_admin());

drop policy if exists "rls_read_scoped" on public.player_stats_match;
create policy "rls_read_scoped" on public.player_stats_match for select to authenticated using ((crm_manages_player(player_id) OR ((current_crm_role() = 'preparatore'::text) AND fitness_can_manage(player_id)) OR crm_brand_sees(player_id)));

commit;
