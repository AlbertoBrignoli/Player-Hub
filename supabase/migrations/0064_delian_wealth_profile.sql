-- Delian & Co. (Zurigo) come wealth manager: profilo preparato da AUVI prima che entrino,
-- collegato ad Alberto Brignoli (31538) per provarlo. All'accesso con info@delianco.com
-- profilo e collegamenti passano al loro account (profile_seed.pending_wealth_id).
insert into public.crm_wealth_profile (advisor_id, name, title, email, agency_name, agency_website, agency_email,
  agency_address, agency_logo_url, instagram_url, notes, updated_at)
select '8d2e6b4a-31f7-4c59-9e0d-5a7c1b3f6e24'::uuid, 'Delian & Co.', 'Wealth manager · Multi-Family Office',
  'info@delianco.com', 'Delian & Co.', 'https://www.delianco.com', 'info@delianco.com', 'Zurigo, Svizzera',
  '/agenzie/delian-logo.png', 'https://www.instagram.com/delian_co/',
  'Multi-Family Office indipendente con sede a Zurigo, costruito esclusivamente per atleti professionisti. Un atleta ha una carriera breve, un reddito che cambia di anno in anno e spesso più paesi in cui vive e paga le tasse: decisioni che gli altri prendono in quarant''anni vanno prese in pochi. Delian lavora fee-only: nessuna commissione, retrocessione o fee di referral da banche, gestori o assicurazioni. È pagato solo dall''atleta, quindi il consiglio non cambia se investi o disinvesti.',
  now()
where not exists (select 1 from public.crm_wealth_profile where advisor_id = '8d2e6b4a-31f7-4c59-9e0d-5a7c1b3f6e24');

insert into public.crm_wealth_athletes (advisor_id, player_id)
values ('8d2e6b4a-31f7-4c59-9e0d-5a7c1b3f6e24', 31538) on conflict do nothing;

insert into public.crm_allowed_emails (email, role, note, player_api_id, profile_seed)
values ('info@delianco.com', 'wealth', 'Delian & Co. · Wealth manager', 31538,
        '{"pending_wealth_id": "8d2e6b4a-31f7-4c59-9e0d-5a7c1b3f6e24"}'::jsonb)
on conflict (email) do update set role = excluded.role, note = excluded.note,
  player_api_id = excluded.player_api_id, profile_seed = excluded.profile_seed;
