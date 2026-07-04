-- Le funzioni trigger non devono essere invocabili via /rest/v1/rpc.
revoke execute on function public.crm_editorial_from_match() from public, anon, authenticated;
revoke execute on function public.crm_touch_updated_at() from public, anon, authenticated;
