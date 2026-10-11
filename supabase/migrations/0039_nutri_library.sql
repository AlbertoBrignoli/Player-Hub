-- Menu del nutrizionista (11/10/2026)
-- Libreria personale di pasti e integratori: parte con una base già pronta, si modifica dalla
-- sua area ("Il mio menu") e si arricchisce da sola: ogni pasto o integratore scritto a mano
-- su un impegno dell'atleta resta in memoria (crm_set_event_nutrition) per la volta dopo.

create table if not exists public.crm_nutri_library (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('pasto','integratore')),
  name text not null,
  category text,
  details text,          -- pasto: cosa mangiare
  dose text,             -- integratore
  timing text,           -- integratore: quando (Prima, Dopo, Ai pasti…)
  usage_count int not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_nutri_library_name on public.crm_nutri_library (owner_id, kind, lower(name));
alter table public.crm_nutri_library enable row level security;
drop policy if exists p_nutrilib_own on public.crm_nutri_library;
create policy p_nutrilib_own on public.crm_nutri_library for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke all on public.crm_nutri_library from anon;

-- base di partenza: si carica una volta sola, quando il menu è vuoto
create or replace function public.crm_nutri_library_seed()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null or coalesce(current_crm_role(), '') not in ('nutrizionista','admin','creator') then return 0; end if;
  if exists (select 1 from crm_nutri_library where owner_id = auth.uid()) then return 0; end if;
  insert into crm_nutri_library (owner_id, kind, name, category, details) values
    (auth.uid(), 'pasto', 'Colazione proteica', 'colazione', 'Avena 80 g, yogurt greco 170 g, frutti rossi, 2 uova'),
    (auth.uid(), 'pasto', 'Colazione classica', 'colazione', 'Pane integrale 80 g, marmellata, ricotta 100 g, spremuta d''arancia'),
    (auth.uid(), 'pasto', 'Colazione pre-allenamento', 'colazione', 'Fette biscottate 4, miele, banana, tè'),
    (auth.uid(), 'pasto', 'Pranzo da allenamento', 'pranzo', 'Pasta 100 g al pomodoro, petto di pollo 150 g, verdure, olio EVO'),
    (auth.uid(), 'pasto', 'Pranzo leggero', 'pranzo', 'Riso basmati 90 g, salmone 150 g, insalata mista'),
    (auth.uid(), 'pasto', 'Cena di recupero', 'cena', 'Patate 300 g, pesce bianco 200 g, verdure cotte'),
    (auth.uid(), 'pasto', 'Cena proteica', 'cena', 'Carne magra 180 g, verdure, pane integrale 60 g'),
    (auth.uid(), 'pasto', 'Spuntino pomeridiano', 'spuntino', 'Yogurt greco, frutta secca 30 g'),
    (auth.uid(), 'pasto', 'Spuntino veloce', 'spuntino', 'Banana e barretta proteica'),
    (auth.uid(), 'pasto', 'Pasto pre-gara (3-4 h prima)', 'pre-gara', 'Pasta o riso 120 g in bianco, bresaola 80 g, crostata'),
    (auth.uid(), 'pasto', 'Snack pre-gara (1 h prima)', 'pre-gara', 'Banana, gel di carboidrati'),
    (auth.uid(), 'pasto', 'Recupero post-gara', 'post-gara', 'Frullato: latte, banana, proteine 30 g · pasto completo entro 2 ore');
  insert into crm_nutri_library (owner_id, kind, name, category, dose, timing) values
    (auth.uid(), 'integratore', 'Creatina', 'performance', '5 g', 'Dopo'),
    (auth.uid(), 'integratore', 'Proteine whey', 'recupero', '30 g', 'Dopo'),
    (auth.uid(), 'integratore', 'Caseine', 'recupero', '30 g', 'Prima di dormire'),
    (auth.uid(), 'integratore', 'Magnesio', 'recupero', '300 mg', 'Prima di dormire'),
    (auth.uid(), 'integratore', 'Omega 3', 'salute', '2 g', 'Ai pasti'),
    (auth.uid(), 'integratore', 'Vitamina D', 'salute', '2000 UI', 'Al risveglio'),
    (auth.uid(), 'integratore', 'Probiotici', 'salute', '1 capsula', 'Al risveglio'),
    (auth.uid(), 'integratore', 'Elettroliti', 'idratazione', '1 bustina in 500 ml', 'Durante'),
    (auth.uid(), 'integratore', 'Gel di carboidrati', 'energia', '1 gel', 'Durante'),
    (auth.uid(), 'integratore', 'Caffeina', 'energia', '3 mg/kg', 'Prima'),
    (auth.uid(), 'integratore', 'Beta-alanina', 'performance', '3 g', 'Ai pasti'),
    (auth.uid(), 'integratore', 'Collagene + vitamina C', 'articolazioni', '15 g', 'Prima'),
    (auth.uid(), 'integratore', 'Melatonina (viaggi)', 'sonno', '1 mg', 'Prima di dormire');
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.crm_nutri_library_seed() from public, anon;
grant execute on function public.crm_nutri_library_seed() to authenticated;

-- categoria del pasto dal nome dell'impegno (Colazione, Pranzo, Cena, Spuntino, partita…)
create or replace function public.crm_meal_category(p_title text, p_type text)
returns text language sql immutable as $$
  select case
    when p_title ~* 'colazion|breakfast' then 'colazione'
    when p_title ~* 'pranzo|lunch' then 'pranzo'
    when p_title ~* 'cena|dinner' then 'cena'
    when p_title ~* 'spuntin|snack|merend' then 'spuntino'
    when p_type = 'partita' or p_title ~* 'partita|gara|match' then 'pre-gara'
    else null end;
$$;

-- salvataggio delle indicazioni + memoria automatica nel menu di chi le scrive
create or replace function public.crm_set_event_nutrition(p_event uuid, p_nutrition jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare e record; v_role text := current_crm_role(); v_who text; v_new jsonb; v_tz text; s jsonb; v_menu text;
begin
  select * into e from crm_events where id = p_event;
  if e is null then raise exception 'Impegno non trovato'; end if;
  if not (crm_nutri_sees(e.player_id) or v_role in ('admin','creator')) then
    raise exception 'Solo il nutrizionista dell''atleta puo'' integrare il piano alimentare';
  end if;
  if not crm_event_visible(p_event) then raise exception 'Impegno non visibile'; end if;
  v_who := coalesce(nullif(trim(coalesce(crm_pro_display_name(auth.uid(), v_role), '')), ''),
                    (select full_name from crm_profiles where id = auth.uid()), 'Il nutrizionista');
  if p_nutrition is null or (coalesce(trim(p_nutrition->>'menu'), '') = '' and coalesce(trim(p_nutrition->>'note'), '') = ''
       and coalesce(jsonb_array_length(case when jsonb_typeof(p_nutrition->'supplements') = 'array' then p_nutrition->'supplements' end), 0) = 0) then
    v_new := null;
  else
    v_new := jsonb_build_object(
      'menu', nullif(trim(coalesce(p_nutrition->>'menu', '')), ''),
      'note', nullif(trim(coalesce(p_nutrition->>'note', '')), ''),
      'supplements', coalesce((select jsonb_agg(jsonb_build_object(
          'name', trim(x->>'name'), 'dose', nullif(trim(coalesce(x->>'dose', '')), ''), 'when', nullif(trim(coalesce(x->>'when', '')), '')))
        from jsonb_array_elements(case when jsonb_typeof(p_nutrition->'supplements') = 'array' then p_nutrition->'supplements' else '[]'::jsonb end) x
        where coalesce(trim(x->>'name'), '') <> ''), '[]'::jsonb),
      'by', auth.uid(), 'by_name', v_who, 'updated_at', now());
  end if;
  update crm_events set nutrition = v_new where id = p_event;
  if v_new is null then return; end if;

  -- memoria: integratori e pasto finiscono (o si rinfrescano) nel menu di chi scrive
  for s in select * from jsonb_array_elements(v_new->'supplements') loop
    insert into crm_nutri_library as l (owner_id, kind, name, category, dose, timing, usage_count, last_used_at)
    values (auth.uid(), 'integratore', s->>'name', 'altro', s->>'dose', s->>'when', 1, now())
    on conflict (owner_id, kind, lower(name)) do update
      set usage_count = l.usage_count + 1, last_used_at = now(),
          dose = coalesce(l.dose, excluded.dose), timing = coalesce(l.timing, excluded.timing);
  end loop;
  v_menu := v_new->>'menu';
  if v_menu is not null then
    update crm_nutri_library set usage_count = usage_count + 1, last_used_at = now()
     where owner_id = auth.uid() and kind = 'pasto' and lower(trim(details)) = lower(v_menu);
    if not found then
      insert into crm_nutri_library as l (owner_id, kind, name, category, details, usage_count, last_used_at)
      values (auth.uid(), 'pasto',
              case when length(v_menu) > 48 then left(v_menu, 46) || '…' else v_menu end,
              coalesce(crm_meal_category(e.title, e.type), 'spuntino'), v_menu, 1, now())
      on conflict (owner_id, kind, lower(name)) do update
        set usage_count = l.usage_count + 1, last_used_at = now(), details = excluded.details;
    end if;
  end if;

  select coalesce(timezone, 'Europe/Rome') into v_tz from player where api_player_id = e.player_id;
  insert into crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
  values ('player', v_who || ': piano alimentare per ' || lower(e.title),
          to_char(e.start_at at time zone coalesce(v_tz, 'Europe/Rome'), 'DD/MM HH24:MI')
            || coalesce(' · ' || left(v_new->>'menu', 90), '')
            || case jsonb_array_length(v_new->'supplements') when 0 then '' when 1 then ' · 1 integratore' else ' · ' || jsonb_array_length(v_new->'supplements') || ' integratori' end,
          'agenda?event=' || e.id, e.player_id, auth.uid());
end $$;
revoke execute on function public.crm_set_event_nutrition(uuid, jsonb) from public, anon;
grant execute on function public.crm_set_event_nutrition(uuid, jsonb) to authenticated;
