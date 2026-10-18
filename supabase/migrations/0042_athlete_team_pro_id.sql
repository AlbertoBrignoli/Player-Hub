-- "Il mio team": ogni professionista porta il suo id, così dalla card si apre il suo profilo
-- (18/10/2026). Colonna aggiunta in fondo alla vista; il filtro di visibilità resta identico.
create or replace view public.crm_athlete_team as
 with members as (
   select a.player_id, 'agente'::text as role, 1 as sort, pr.name, pr.title, pr.photo_url, pr.email, pr.phone, pr.whatsapp, pr.agency_name, a.agent_id as pro_id
     from crm_agent_athletes a join crm_agent_profile pr on pr.agent_id = a.agent_id
   union all
   select t.player_id, 'preparatore'::text, 2, pr.name, pr.headline, pr.photo_url, pr.contacts ->> 'email', pr.contacts ->> 'phone', pr.contacts ->> 'whatsapp', null::text, t.trainer_id
     from fitness_trainer_athletes t join fitness_coach_profile pr on pr.trainer_id = t.trainer_id
   union all
   select i.player_id, 'assicuratore'::text, 3, pr.name, pr.title, pr.photo_url, pr.email, pr.phone, pr.whatsapp, pr.agency_name, i.insurer_id
     from crm_insurer_athletes i join crm_insurer_profile pr on pr.insurer_id = i.insurer_id
   union all
   select x.player_id, 'commercialista'::text, 4, pr.name, pr.title, pr.photo_url, pr.email, pr.phone, pr.whatsapp, pr.agency_name, x.advisor_id
     from crm_tax_athletes x join crm_tax_profile pr on pr.advisor_id = x.advisor_id
   union all
   select f.player_id, 'fisioterapista'::text, 5, pr.name, pr.title, pr.photo_url, pr.email, pr.phone, pr.whatsapp, pr.clinic_name, f.physio_id
     from crm_physio_athletes f join crm_physio_profile pr on pr.physio_id = f.physio_id
   union all
   select n.player_id, 'nutrizionista'::text, 6, pr.name, pr.title, pr.photo_url, pr.email, pr.phone, pr.whatsapp, null::text, n.nutri_id
     from crm_nutri_athletes n join crm_nutri_profile pr on pr.nutri_id = n.nutri_id
 )
 select player_id, role, sort, name, title, photo_url, email, phone, whatsapp, agency_name, pro_id
   from members m
  where exists (select 1 from crm_profiles me where me.id = auth.uid() and me.role = 'admin')
     or exists (select 1 from crm_profiles me where me.id = auth.uid() and me.player_api_id = m.player_id)
     or exists (select 1 from crm_agent_athletes z where z.agent_id = auth.uid() and z.player_id = m.player_id)
     or exists (select 1 from fitness_trainer_athletes z where z.trainer_id = auth.uid() and z.player_id = m.player_id)
     or exists (select 1 from crm_insurer_athletes z where z.insurer_id = auth.uid() and z.player_id = m.player_id)
     or exists (select 1 from crm_tax_athletes z where z.advisor_id = auth.uid() and z.player_id = m.player_id)
     or exists (select 1 from crm_physio_athletes z where z.physio_id = auth.uid() and z.player_id = m.player_id)
     or exists (select 1 from crm_nutri_athletes z where z.nutri_id = auth.uid() and z.player_id = m.player_id);
