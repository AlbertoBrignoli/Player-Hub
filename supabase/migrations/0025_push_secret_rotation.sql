-- Rotazione segreti push (audit 29/09/2026): il vecchio x-push-secret era nel
-- codice e in 0010. Ora il segreto vive solo in cp_secrets (service role) e lo
-- genera il DB; le chiavi VAPID le genera send-push al primo avvio.
insert into public.cp_secrets (key, value)
values ('push_secret', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (key) do update set value = excluded.value;
delete from public.cp_secrets where key in ('vapid_public', 'vapid_private');

create or replace function public.crm_push_webhook()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform net.http_post(
    url := 'https://irdphiphumxsymttvfzq.supabase.co/functions/v1/send-push',
    body := jsonb_build_object('record', to_jsonb(new)),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', (select value from public.cp_secrets where key = 'push_secret')
    )
  );
  return new;
end;
$function$;
revoke execute on function public.crm_push_webhook() from public, anon, authenticated;

-- Le iscrizioni esistenti sono legate alle vecchie chiavi VAPID: vanno rifatte
-- dal dispositivo (campanella -> Attiva sul dispositivo).
delete from public.crm_push_subscriptions;
