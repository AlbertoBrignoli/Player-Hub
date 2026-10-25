-- Backstage: foto profilo scelta dall'atleta (25/10/2026). Quella di API-Football resta come
-- riserva. La foto è il biglietto da visita: la vede chiunque sia nel Player Hub (anche i brand
-- non ancora ammessi), i momenti invece restano protetti.
alter table public.bs_profiles add column if not exists avatar_path text;

drop function if exists public.bs_directory();
create function public.bs_directory()
returns table (player_id bigint, name text, photo_url text, team_name text, pos text,
               bio text, passions text[], posts int, my_status text, avatar_path text)
language sql stable security definer set search_path = public as $$
  select pl.api_player_id, pl.name, pl.photo_url, pl.team_name, pl."position",
         bp.bio, coalesce(bp.passions, '{}'),
         (select count(*)::int from bs_posts x where x.player_id = pl.api_player_id),
         (select a.status from bs_access a where a.player_id = pl.api_player_id and a.requester_id = auth.uid()),
         bp.avatar_path
    from player pl left join bs_profiles bp on bp.player_id = pl.api_player_id
   where pl.api_player_id is not null and auth.uid() is not null
   order by pl.name;
$$;
revoke execute on function public.bs_directory() from public, anon;
grant execute on function public.bs_directory() to authenticated;

drop policy if exists p_backstage_read on storage.objects;
create policy p_backstage_read on storage.objects for select to authenticated using (
  bucket_id = 'backstage' and (
    exists (select 1 from public.bs_profiles bp where bp.avatar_path = objects.name)
    or exists (select 1 from public.bs_posts p where p.image_path = objects.name and public.bs_can_see_post(p.id))));
