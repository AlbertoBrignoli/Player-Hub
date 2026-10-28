-- Il wealth manager compare nel team dell'atleta (vista crm_athlete_team: chat, "Il mio team")
-- e vede il team degli atleti che segue.
do $$
declare d text;
begin
  d := pg_get_viewdef('public.crm_athlete_team'::regclass, true);
  d := replace(d, E'           FROM crm_nutri_athletes n\n             JOIN crm_nutri_profile pr ON pr.nutri_id = n.nutri_id\n        )',
    E'           FROM crm_nutri_athletes n\n             JOIN crm_nutri_profile pr ON pr.nutri_id = n.nutri_id\n'
    || E'        UNION ALL\n'
    || E'         SELECT w.player_id, ''wealth''::text, 7, pr.name, pr.title, pr.photo_url,\n'
    || E'            coalesce(pr.email, pr.agency_email), coalesce(pr.phone, pr.agency_phone), pr.whatsapp, pr.agency_name, w.advisor_id, pr.agency_logo_url\n'
    || E'           FROM crm_wealth_athletes w\n             JOIN crm_wealth_profile pr ON pr.advisor_id = w.advisor_id\n        )');
  d := rtrim(rtrim(d), ';') || E' OR (EXISTS ( SELECT 1 FROM crm_wealth_athletes z WHERE z.advisor_id = auth.uid() AND z.player_id = m.player_id))';
  if position('crm_wealth_profile' in d) = 0 then raise exception 'view patch failed'; end if;
  execute 'create or replace view public.crm_athlete_team as ' || d;
end $$;
