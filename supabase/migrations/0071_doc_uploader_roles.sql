-- Archivio dell'atleta diviso per professionista: per ogni documento visibile, il ruolo di chi l'ha caricato.
create or replace function public.crm_doc_uploader_roles(p_player bigint)
returns table (id uuid, role text) language sql stable security definer set search_path to 'public' as $$
  select d.id, p.role from public.crm_documents d left join public.crm_profiles p on p.id = d.uploaded_by
   where d.player_id = p_player and crm_manages_player(p_player);
$$;
grant execute on function public.crm_doc_uploader_roles(bigint) to authenticated;
