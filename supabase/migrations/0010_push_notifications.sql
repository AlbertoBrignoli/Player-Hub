-- Web Push: sottoscrizioni dispositivo, webhook verso la edge function send-push
-- a ogni notifica in-app, e promemoria pre-match 22 ore prima del kickoff.

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- 1) Sottoscrizioni push per dispositivo
create table if not exists public.crm_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  role text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.crm_push_subscriptions enable row level security;
drop policy if exists p_push_own on public.crm_push_subscriptions;
create policy p_push_own on public.crm_push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 2) Ogni notifica in-app diventa anche push sul dispositivo
create or replace function public.crm_push_webhook()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://irdphiphumxsymttvfzq.supabase.co/functions/v1/send-push',
    body := jsonb_build_object('record', to_jsonb(new)),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', 'ec0d75afddf48f5b0661b309b2396d24a27843e98edd64b1'
    )
  );
  return new;
end;
$$;
revoke execute on function public.crm_push_webhook() from public, anon, authenticated;

drop trigger if exists trg_notifications_push on public.crm_notifications;
create trigger trg_notifications_push after insert on public.crm_notifications
  for each row execute function public.crm_push_webhook();

-- 3) Promemoria pre-match: 22 ore prima del kickoff
alter table public.crm_editorial add column if not exists pre_match_reminded boolean not null default false;

create or replace function public.crm_pre_match_check()
returns void language plpgsql security definer set search_path = public as $$
declare e record;
begin
  for e in
    select id, title, status, (match_info->>'kickoff')::timestamptz as kickoff
    from crm_editorial
    where type = 'partita'
      and pre_match_reminded = false
      and (match_info->>'kickoff') is not null
      and (match_info->>'kickoff')::timestamptz > now()
      and (match_info->>'kickoff')::timestamptz <= now() + interval '22 hours'
  loop
    if e.status in ('grafica_caricata', 'pronto') then
      insert into crm_notifications (recipient_role, title, body, route)
      values ('player', '📣 Grafica pre-match pronta: pubblica!',
        e.title || ' — calcio d''inizio ' || to_char(e.kickoff at time zone 'Europe/Rome', 'DD/MM alle HH24:MI')
        || '. Grafica e copy sono nella box del calendario.', 'editorial');
    else
      insert into crm_notifications (recipient_role, title, body, route)
      values ('team', '⏰ Manca la grafica pre-match',
        e.title || ' si gioca tra meno di 22 ore e la box non ha ancora una grafica pronta.', 'editorial');
    end if;
    update crm_editorial set pre_match_reminded = true where id = e.id;
  end loop;
end;
$$;
revoke execute on function public.crm_pre_match_check() from public, anon, authenticated;

select cron.schedule('pre-match-reminder', '*/30 * * * *', 'select public.crm_pre_match_check()');
