-- Fisco (spunti del commercialista, nov 2026)
--  * "Tipo" diventa "Azione": pagamento, documento (condivisione), richiesta (documentale), approvazione (nuova)
--  * categorie fiscali generali, valide anche all'estero
--  * Paese e Anno fiscale facoltativi
--  * richiesta documentale indirizzata all'atleta (assignee_id null) o a un professionista del team
--  * il procuratore può inserire e coordinare le attività dei suoi atleti
--  * un'attività sola per il percorso: risposta, ricevuta di pagamento e approvazione nella stessa voce

alter table public.crm_tax_items
  add column if not exists country text,
  add column if not exists tax_year smallint,
  add column if not exists assignee_id uuid references auth.users(id) on delete set null;

alter table public.crm_tax_items drop constraint if exists crm_tax_kind_check;
alter table public.crm_tax_items add constraint crm_tax_kind_check
  check (kind = any (array['pagamento','documento','richiesta','approvazione']));

-- categorie: dalle vecchie alle nuove
update public.crm_tax_items set category = case category
    when 'Pagamenti' then 'Imposte e versamenti'
    when 'Dichiarativi' then 'Dichiarazioni fiscali'
    when 'Altro' then 'Altri documenti fiscali'
    else category end
  where area = 'fiscale';
-- "Periodo" numerico → Anno fiscale
update public.crm_tax_items set tax_year = period::smallint
  where tax_year is null and period ~ '^\d{4}$';

-- procuratore: coordina le attività fiscali e legali dei suoi atleti
drop policy if exists p_tax_items_agent on public.crm_tax_items;
create policy p_tax_items_agent on public.crm_tax_items for all
  using (public.crm_agent_sees(player_id)) with check (public.crm_agent_sees(player_id));

-- file: anche il procuratore e il professionista a cui è chiesto un documento possono caricare
drop policy if exists p_taxdoc_write_more on storage.objects;
create policy p_taxdoc_write_more on storage.objects for insert to authenticated
  with check (bucket_id = 'tax-docs' and (
    public.crm_agent_sees(((storage.foldername(name))[1])::bigint)
    or exists (select 1 from public.crm_tax_items t
               where t.player_id = ((storage.foldername(name))[1])::bigint
                 and t.assignee_id = auth.uid() and t.status = 'aperto')));

-- Risposta nella stessa voce: consegna documenti, ricevuta di pagamento, approvazione.
-- Chi può: l'atleta, AUVI, il commercialista e il procuratore dell'atleta, il professionista a cui è chiesta.
create or replace function public.crm_tax_respond(p_item uuid, p_status text, p_atts jsonb default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare i record;
begin
  select * into i from public.crm_tax_items where id = p_item;
  if i.id is null then raise exception 'Voce non trovata'; end if;
  if not (current_crm_role() = 'admin'
          or (current_crm_role() = 'player' and i.player_id = current_player_api_id())
          or public.crm_tax_sees(i.player_id) or public.crm_agent_sees(i.player_id)
          or i.assignee_id = auth.uid()) then
    raise exception 'Non autorizzato';
  end if;
  if not (
       (i.kind = 'richiesta' and p_status = 'completato')
    or (i.kind = 'pagamento' and p_status = 'pagato')
    or (i.kind = 'documento' and p_status = 'letto')
    or (i.kind = 'approvazione' and p_status in ('approvato', 'modifiche'))) then
    raise exception 'Azione non valida';
  end if;
  update public.crm_tax_items set
    status = p_status,
    response_attachments = coalesce(p_atts, response_attachments),
    response_note = coalesce(nullif(trim(coalesce(p_note, '')), ''), response_note),
    paid_on = case when p_status = 'pagato' then current_date else paid_on end,
    completed_at = now(), updated_at = now()
  where id = p_item;
end $$;
revoke execute on function public.crm_tax_respond(uuid, text, jsonb, text) from public, anon;
grant execute on function public.crm_tax_respond(uuid, text, jsonb, text) to authenticated, service_role;

-- Notifiche
create or replace function public.crm_tax_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_t text;
begin
  if tg_op = 'INSERT' then
    if current_crm_role() = 'player' then return new; end if;
    -- richiesta a un professionista: lo avvisa il coinvolgimento (crm_item_people), non l'atleta
    if new.kind = 'richiesta' and new.assignee_id is not null then return new; end if;
    v_t := case new.kind
             when 'richiesta' then 'Documento richiesto: '
             when 'pagamento' then 'Da pagare: '
             when 'approvazione' then 'Da approvare: '
             else 'Nuovo documento: ' end;
    insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('player', v_t || new.title,
            coalesce(case when new.amount is not null then new.amount::text || ' € · ' else '' end, '') ||
            coalesce('entro il ' || to_char(new.due_date, 'DD/MM/YYYY'), 'senza scadenza'),
            'legaltax?item=' || new.id, new.player_id, auth.uid());
    return new;
  end if;

  -- la bozza corretta torna all'atleta
  if new.kind = 'approvazione' and old.status = 'modifiche' and new.status = 'aperto' then
    insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('player', 'Da approvare: ' || new.title, 'Versione aggiornata', 'legaltax?item=' || new.id, new.player_id, auth.uid());
  end if;

  if new.status is distinct from old.status and new.status in ('pagato','completato','approvato','modifiche') then
    insert into public.crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('commercialista',
            case new.status when 'pagato' then 'Pagato: ' when 'approvato' then 'Approvato: '
                            when 'modifiche' then 'Modifiche richieste: ' else 'Consegnato: ' end || new.title,
            coalesce(new.response_note, ''), 'legaltax?item=' || new.id, new.player_id, auth.uid());
  end if;
  return new;
end $$;

-- Agenda: etichetta giusta per ogni azione
create or replace function public.crm_tax_to_agenda()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.crm_events
  where player_id = new.player_id and type = 'scadenza' and notes = 'fisco:' || new.id::text;

  if new.due_date is not null and new.status in ('aperto') then
    insert into public.crm_events (title, type, start_at, notes, player_id, created_by)
    values (case new.kind when 'pagamento' then 'Scadenza · ' when 'approvazione' then 'Da approvare · '
                          else 'Da consegnare · ' end || new.title,
            'scadenza', (new.due_date::timestamp + time '09:00') at time zone 'Europe/Rome',
            'fisco:' || new.id::text, new.player_id, null);
  end if;
  return new;
end $$;

-- Le voci condivise "in corso" includono le approvazioni con modifiche richieste
create or replace function public.crm_my_tagged_items()
returns table(kind text, item_id uuid, player_id bigint, title text, due date)
language sql stable security definer set search_path = public as $$
  select t.kind, t.item_id, m.player_id, m.title, m.due
    from public.crm_item_people t, lateral public.crm_item_meta(t.kind, t.item_id) m
   where t.user_id = auth.uid()
     and case t.kind
       when 'wealth' then exists (select 1 from crm_wealth_items i where i.id = t.item_id and i.status = 'aperto')
       when 'tax' then exists (select 1 from crm_tax_items i where i.id = t.item_id and i.status in ('aperto','modifiche'))
       when 'insurance' then exists (select 1 from crm_insurance_policies i where i.id = t.item_id and coalesce(i.status, '') <> 'disdetta')
       when 'contract' then exists (select 1 from crm_contracts i where i.id = t.item_id and coalesce(i.status, '') <> 'expired')
       when 'event' then exists (select 1 from crm_events e where e.id = t.item_id and e.start_at >= now() - interval '1 day')
       else false end;
$$;

-- La raccolta dei documenti fiscali da Banco Mediolanum era finita in Patrimonio:
-- passa in Fiscale come richiesta documentale al wealth manager che l'aveva creata
-- (lui raccoglie le certificazioni bancarie), con persone coinvolte e conversazione.
do $$
declare w record;
begin
  select * into w from public.crm_wealth_items where id = '37a52ae5-7f64-43b8-bc6a-7f12710f1285';
  if w.id is null then return; end if;
  perform set_config('auvi.silent_tag', '1', true);
  insert into public.crm_tax_items (id, player_id, area, kind, category, title, description, amount, due_date,
                                    status, attachments, response_attachments, response_note, created_by, created_at, updated_at,
                                    assignee_id)
  values (w.id, w.player_id, 'fiscale', 'richiesta', 'Certificazioni fiscali', w.title, w.description, null, w.due_date,
          w.status, coalesce(w.attachments, '[]'), coalesce(w.response_attachments, '[]'), w.response_note,
          w.created_by, w.created_at, now(), w.created_by);
  update public.crm_item_people set kind = 'tax' where kind = 'wealth' and item_id = w.id;
  insert into public.crm_item_people (kind, item_id, user_id, role, name, added_by)
  select 'tax', w.id, p.id, p.role, p.full_name, w.created_by from public.crm_profiles p
   where p.id = w.created_by
     and not exists (select 1 from public.crm_item_people x where x.kind = 'tax' and x.item_id = w.id and x.user_id = p.id);
  update public.crm_item_comments set kind = 'tax' where kind = 'wealth' and item_id = w.id;
  delete from public.crm_wealth_items where id = w.id;
end $$;
