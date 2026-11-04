-- Sicurezza: le funzioni SECURITY DEFINER non devono essere chiamabili da chi non ha fatto login.
-- Restano aperte solo le due che servono PRIMA dell'accesso (Login.tsx):
--   crm_check_email_allowed (email ammessa?) e crm_redeem_invite (registrazione con codice invito).
-- Le funzioni nuove nascono già chiuse a chi non è loggato (default privileges).
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and p.prokind = 'f'
      and p.prorettype <> 'trigger'::regtype
      and p.proname not in ('crm_check_email_allowed', 'crm_redeem_invite')
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end $$;

alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges in schema public grant execute on functions to authenticated, service_role;

-- percorso di ricerca fisso (avviso "function_search_path_mutable")
alter function public.crm_chat_file_check() set search_path = public;
alter function public.crm_meal_category(text, text) set search_path = public;
