-- Il giocatore può proporre contenuti dal calendario editoriale:
-- tipo (incluso reel), ambiente/tema, brief descrittivo e chi l'ha richiesto.
alter table public.crm_editorial add column if not exists theme text;
alter table public.crm_editorial add column if not exists brief text;
alter table public.crm_editorial add column if not exists requested_by uuid references auth.users(id) on delete set null;

alter table public.crm_editorial drop constraint if exists crm_editorial_type_check;
alter table public.crm_editorial add constraint crm_editorial_type_check
  check (type in ('partita', 'post', 'story', 'carosello', 'reel', 'altro'));
