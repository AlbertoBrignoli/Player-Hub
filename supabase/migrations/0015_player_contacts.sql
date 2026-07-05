-- Dati anagrafici/contatto del giocatore per la scheda in Dashboard.
alter table public.player add column if not exists birth_date date;
alter table public.player add column if not exists instagram_url text;
alter table public.player add column if not exists contact_email text;

update public.player set
  birth_date = '2002-01-20',
  instagram_url = 'https://www.instagram.com/lorenzopirola_6/',
  contact_email = 'lorenzopirola6@gmail.com'
where name ilike '%pirola%' or api_player_id = 134431;
