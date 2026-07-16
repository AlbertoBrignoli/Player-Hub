-- 0020 — TAB "PARTNERSHIP" NEL MEDIA KIT
-- Il brand deve poter vedere le SCELTE commerciali dell'atleta (valori, stile,
-- interessi, categorie gradite/escluse, disponibilità, territori e lingue) —
-- ma NON il resto di cp_profiles (fee minima, sponsor attivi, esclusività,
-- audience, media kit). Esponiamo quindi una vista con le sole colonne sicure.
--
-- La vista gira con i privilegi del proprietario (postgres) e quindi bypassa
-- la RLS di cp_profiles: il perimetro di sicurezza è l'elenco esplicito delle
-- colonne selezionate. Non aggiungere qui colonne sensibili.

create or replace view public.cp_preferences_public as
select
  player_id,
  identity,               -- valori, stile, interessi, frase di posizionamento
  categories_liked,
  categories_excluded,
  availability,
  territories,            -- mercati, lingue, disponibilità a viaggiare
  onboarding_completed,
  updated_at
from public.cp_profiles;

revoke all on public.cp_preferences_public from anon, public;
grant select on public.cp_preferences_public to authenticated;

-- Le categorie brand sono una tassonomia pubblica: aprirle anche al ruolo brand
-- (servono per mostrare i nomi delle categorie nel tab Partnership).
drop policy if exists p_cp_cats_read on public.cp_brand_categories;
create policy p_cp_cats_read on public.cp_brand_categories
  for select to authenticated using (true);
