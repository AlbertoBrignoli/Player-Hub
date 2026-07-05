-- Casa 2026/27: OAKA (Karaiskakis in ristrutturazione).
alter table public.player add column if not exists stadium_photo_url text;
update public.player set
  stadium_name = 'OAKA — Stadio Olimpico Spyros Louis',
  stadium_capacity = 69618,
  stadium_photo_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Panathinaikos_Inter_CL2008_09_b.jpg/960px-Panathinaikos_Inter_CL2008_09_b.jpg';
