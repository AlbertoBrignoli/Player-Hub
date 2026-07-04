-- Hardening funzioni (silenzia i linter SECURITY DEFINER esposti via RPC).

-- crm_is_admin: non serve DEFINER, l'utente legge sempre il proprio profilo.
create or replace function public.crm_is_admin()
returns boolean language sql stable security invoker set search_path = public as $$
  select exists (select 1 from public.crm_profiles where id = auth.uid() and role = 'admin');
$$;
revoke execute on function public.crm_is_admin() from anon;

-- handle_new_crm_user: trigger function, non invocabile via RPC.
revoke execute on function public.handle_new_crm_user() from public, anon, authenticated;
