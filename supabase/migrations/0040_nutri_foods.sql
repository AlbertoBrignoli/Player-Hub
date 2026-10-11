-- Menu del nutrizionista per momenti della giornata (11/10/2026)
-- Il nutrizionista prepara una volta (a mano o caricando il suo file, letto dall'AI) gli alimenti
-- di ogni momento - colazione, pranzo, merenda, cena, prima di dormire, pre/post allenamento -
-- e gli integratori per momento. Sul calendario dell'atleta li sceglie da un menu a tendina.
-- Momenti (category): colazione, pranzo, merenda, cena, prima_di_dormire,
--                     pre_allenamento, durante_allenamento, post_allenamento

alter table public.crm_nutri_library drop constraint if exists crm_nutri_library_kind_check;
alter table public.crm_nutri_library add constraint crm_nutri_library_kind_check check (kind in ('cibo','pasto','integratore'));
-- lo stesso alimento può stare in più momenti (es. yogurt a colazione e a merenda)
drop index if exists uq_nutri_library_name;
create unique index if not exists uq_nutri_library_slot_name on public.crm_nutri_library (owner_id, kind, coalesce(category, ''), lower(name));

-- integratori gia' presenti: dalla vecchia categoria al momento della giornata
update public.crm_nutri_library set category = case timing
    when 'Al risveglio' then 'colazione'
    when 'Ai pasti' then 'pranzo'
    when 'Prima di dormire' then 'prima_di_dormire'
    when 'Prima' then 'pre_allenamento'
    when 'Durante' then 'durante_allenamento'
    when 'Dopo' then 'post_allenamento'
    else 'colazione' end
  where kind = 'integratore' and coalesce(category, '') not in ('colazione','pranzo','merenda','cena','prima_di_dormire','pre_allenamento','durante_allenamento','post_allenamento');
-- i "pasti completi" della base iniziale non servono piu' (restano quelli gia' usati)
delete from public.crm_nutri_library where kind = 'pasto' and usage_count = 0;

create or replace function public.crm_nutri_library_seed()
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; m int;
begin
  if auth.uid() is null or coalesce(current_crm_role(), '') not in ('nutrizionista','admin','creator') then return 0; end if;
  if not exists (select 1 from crm_nutri_library where owner_id = auth.uid() and kind = 'cibo') then
    insert into crm_nutri_library (owner_id, kind, category, name, details) values
      (auth.uid(),'cibo','colazione','Avena','80 g'), (auth.uid(),'cibo','colazione','Yogurt greco','170 g'),
      (auth.uid(),'cibo','colazione','Frutti rossi','100 g'), (auth.uid(),'cibo','colazione','Uova','2'),
      (auth.uid(),'cibo','colazione','Pane integrale','80 g'), (auth.uid(),'cibo','colazione','Ricotta','100 g'),
      (auth.uid(),'cibo','colazione','Miele','1 cucchiaino'), (auth.uid(),'cibo','colazione','Spremuta d''arancia','200 ml'),
      (auth.uid(),'cibo','colazione','Banana','1'), (auth.uid(),'cibo','colazione','Burro di arachidi','15 g'),
      (auth.uid(),'cibo','pranzo','Pasta','100 g'), (auth.uid(),'cibo','pranzo','Riso basmati','90 g'),
      (auth.uid(),'cibo','pranzo','Petto di pollo','150 g'), (auth.uid(),'cibo','pranzo','Salmone','150 g'),
      (auth.uid(),'cibo','pranzo','Verdure di stagione',null), (auth.uid(),'cibo','pranzo','Insalata mista',null),
      (auth.uid(),'cibo','pranzo','Olio EVO','1 cucchiaio'), (auth.uid(),'cibo','pranzo','Legumi','150 g'),
      (auth.uid(),'cibo','merenda','Yogurt greco','170 g'), (auth.uid(),'cibo','merenda','Frutta secca','30 g'),
      (auth.uid(),'cibo','merenda','Frutta fresca','1 porzione'), (auth.uid(),'cibo','merenda','Gallette di riso','3'),
      (auth.uid(),'cibo','merenda','Barretta proteica','1'),
      (auth.uid(),'cibo','cena','Pesce bianco','200 g'), (auth.uid(),'cibo','cena','Carne magra','180 g'),
      (auth.uid(),'cibo','cena','Patate','300 g'), (auth.uid(),'cibo','cena','Verdure cotte',null),
      (auth.uid(),'cibo','cena','Pane integrale','60 g'), (auth.uid(),'cibo','cena','Olio EVO','1 cucchiaio'),
      (auth.uid(),'cibo','prima_di_dormire','Fiocchi di latte','150 g'), (auth.uid(),'cibo','prima_di_dormire','Kefir','200 ml'),
      (auth.uid(),'cibo','prima_di_dormire','Tisana',null),
      (auth.uid(),'cibo','pre_allenamento','Banana','1'), (auth.uid(),'cibo','pre_allenamento','Fette biscottate e marmellata','4'),
      (auth.uid(),'cibo','pre_allenamento','Pasta o riso in bianco','120 g'), (auth.uid(),'cibo','pre_allenamento','Bresaola','80 g'),
      (auth.uid(),'cibo','post_allenamento','Frullato latte e banana',null), (auth.uid(),'cibo','post_allenamento','Riso','100 g'),
      (auth.uid(),'cibo','post_allenamento','Tonno','1 scatoletta');
    get diagnostics m = row_count; n := n + m;
  end if;
  if not exists (select 1 from crm_nutri_library where owner_id = auth.uid() and kind = 'integratore') then
    insert into crm_nutri_library (owner_id, kind, category, name, dose) values
      (auth.uid(),'integratore','colazione','Vitamina D','2000 UI'), (auth.uid(),'integratore','colazione','Probiotici','1 capsula'),
      (auth.uid(),'integratore','pranzo','Omega 3','2 g'), (auth.uid(),'integratore','pranzo','Beta-alanina','3 g'),
      (auth.uid(),'integratore','pre_allenamento','Caffeina','3 mg/kg'), (auth.uid(),'integratore','pre_allenamento','Collagene + vitamina C','15 g'),
      (auth.uid(),'integratore','durante_allenamento','Elettroliti','1 bustina in 500 ml'), (auth.uid(),'integratore','durante_allenamento','Gel di carboidrati','1 gel'),
      (auth.uid(),'integratore','post_allenamento','Proteine whey','30 g'), (auth.uid(),'integratore','post_allenamento','Creatina','5 g'),
      (auth.uid(),'integratore','prima_di_dormire','Magnesio','300 mg'), (auth.uid(),'integratore','prima_di_dormire','Caseine','30 g'),
      (auth.uid(),'integratore','prima_di_dormire','Melatonina (viaggi)','1 mg');
    get diagnostics m = row_count; n := n + m;
  end if;
  return n;
end $$;
revoke execute on function public.crm_nutri_library_seed() from public, anon;
grant execute on function public.crm_nutri_library_seed() to authenticated;

-- momento della giornata dal nome/tipo dell'impegno
create or replace function public.crm_meal_category(p_title text, p_type text)
returns text language sql immutable as $$
  select case
    when p_title ~* 'colazion|breakfast' then 'colazione'
    when p_title ~* 'pranzo|lunch' then 'pranzo'
    when p_title ~* 'merend|spuntin|snack' then 'merenda'
    when p_title ~* 'cena|dinner' then 'cena'
    when p_title ~* 'dormir|notte|sleep' then 'prima_di_dormire'
    when p_type in ('partita','allenamento') or p_title ~* 'partita|gara|match|allenament' then 'pre_allenamento'
    else null end;
$$;

-- salvataggio: nutrition = {slot, foods:[{name,qty}], menu, supplements:[{name,dose,when}], note, by, by_name, updated_at}
-- memoria: alimenti e integratori nuovi entrano nel menu del nutrizionista, nel momento scelto
create or replace function public.crm_set_event_nutrition(p_event uuid, p_nutrition jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare e record; v_role text := current_crm_role(); v_who text; v_new jsonb; v_tz text; s jsonb;
        v_slot text; v_foods jsonb; v_menu text;
begin
  select * into e from crm_events where id = p_event;
  if e is null then raise exception 'Impegno non trovato'; end if;
  if not (crm_nutri_sees(e.player_id) or v_role in ('admin','creator')) then
    raise exception 'Solo il nutrizionista dell''atleta puo'' integrare il piano alimentare';
  end if;
  if not crm_event_visible(p_event) then raise exception 'Impegno non visibile'; end if;
  v_who := coalesce(nullif(trim(coalesce(crm_pro_display_name(auth.uid(), v_role), '')), ''),
                    (select full_name from crm_profiles where id = auth.uid()), 'Il nutrizionista');
  v_slot := coalesce(nullif(p_nutrition->>'slot', ''), crm_meal_category(e.title, e.type));
  v_foods := coalesce((select jsonb_agg(jsonb_build_object('name', trim(f->>'name'), 'qty', nullif(trim(coalesce(f->>'qty', '')), '')))
                         from jsonb_array_elements(case when jsonb_typeof(p_nutrition->'foods') = 'array' then p_nutrition->'foods' else '[]'::jsonb end) f
                        where coalesce(trim(f->>'name'), '') <> ''), '[]'::jsonb);
  -- testo leggibile del pasto: alimenti scelti + eventuale testo libero
  v_menu := nullif(concat_ws(E'\n',
              nullif((select string_agg(f->>'name' || coalesce(' ' || (f->>'qty'), ''), ', ') from jsonb_array_elements(v_foods) f), ''),
              nullif(trim(coalesce(p_nutrition->>'menu', '')), '')), '');
  if p_nutrition is null or (v_menu is null and coalesce(trim(p_nutrition->>'note'), '') = ''
       and coalesce(jsonb_array_length(case when jsonb_typeof(p_nutrition->'supplements') = 'array' then p_nutrition->'supplements' end), 0) = 0) then
    v_new := null;
  else
    v_new := jsonb_build_object(
      'slot', v_slot, 'foods', v_foods,
      'menu', v_menu,
      'free', nullif(trim(coalesce(p_nutrition->>'menu', '')), ''),
      'note', nullif(trim(coalesce(p_nutrition->>'note', '')), ''),
      'supplements', coalesce((select jsonb_agg(jsonb_build_object(
          'name', trim(x->>'name'), 'dose', nullif(trim(coalesce(x->>'dose', '')), ''), 'when', nullif(trim(coalesce(x->>'when', '')), '')))
        from jsonb_array_elements(case when jsonb_typeof(p_nutrition->'supplements') = 'array' then p_nutrition->'supplements' else '[]'::jsonb end) x
        where coalesce(trim(x->>'name'), '') <> ''), '[]'::jsonb),
      'by', auth.uid(), 'by_name', v_who, 'updated_at', now());
  end if;
  update crm_events set nutrition = v_new where id = p_event;
  if v_new is null then return; end if;

  for s in select * from jsonb_array_elements(v_new->'foods') loop
    insert into crm_nutri_library as l (owner_id, kind, category, name, details, usage_count, last_used_at)
    values (auth.uid(), 'cibo', coalesce(v_slot, 'pranzo'), s->>'name', s->>'qty', 1, now())
    on conflict (owner_id, kind, coalesce(category, ''), lower(name)) do update
      set usage_count = l.usage_count + 1, last_used_at = now(), details = coalesce(l.details, excluded.details);
  end loop;
  for s in select * from jsonb_array_elements(v_new->'supplements') loop
    update crm_nutri_library set usage_count = usage_count + 1, last_used_at = now()
     where owner_id = auth.uid() and kind = 'integratore' and lower(name) = lower(s->>'name');
    if not found then
      insert into crm_nutri_library (owner_id, kind, category, name, dose, usage_count, last_used_at)
      values (auth.uid(), 'integratore', coalesce(v_slot, 'colazione'), s->>'name', s->>'dose', 1, now())
      on conflict do nothing;
    end if;
  end loop;

  select coalesce(timezone, 'Europe/Rome') into v_tz from player where api_player_id = e.player_id;
  insert into crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
  values ('player', v_who || ': piano alimentare per ' || lower(e.title),
          to_char(e.start_at at time zone coalesce(v_tz, 'Europe/Rome'), 'DD/MM HH24:MI')
            || coalesce(' · ' || left(replace(v_menu, E'\n', ' · '), 90), '')
            || case jsonb_array_length(v_new->'supplements') when 0 then '' when 1 then ' · 1 integratore' else ' · ' || jsonb_array_length(v_new->'supplements') || ' integratori' end,
          'agenda?event=' || e.id, e.player_id, auth.uid());
end $$;
revoke execute on function public.crm_set_event_nutrition(uuid, jsonb) from public, anon;
grant execute on function public.crm_set_event_nutrition(uuid, jsonb) to authenticated;

-- import in blocco (dal file letto dall'AI o da un elenco incollato): aggiunge senza doppioni
-- p_items: [{kind:'cibo'|'integratore', slot, name, qty}]
create or replace function public.crm_nutri_library_import(p_items jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare it jsonb; n int := 0; v_slot text;
begin
  if auth.uid() is null or coalesce(current_crm_role(), '') not in ('nutrizionista','admin','creator') then
    raise exception 'Solo il nutrizionista puo'' importare il menu';
  end if;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    if coalesce(trim(it->>'name'), '') = '' or coalesce(it->>'kind', '') not in ('cibo','integratore') then continue; end if;
    v_slot := case when it->>'slot' in ('colazione','pranzo','merenda','cena','prima_di_dormire','pre_allenamento','durante_allenamento','post_allenamento')
                   then it->>'slot' else (case when it->>'kind' = 'cibo' then 'pranzo' else 'colazione' end) end;
    insert into crm_nutri_library (owner_id, kind, category, name, details, dose)
    values (auth.uid(), it->>'kind', v_slot, left(trim(it->>'name'), 80),
            case when it->>'kind' = 'cibo' then nullif(trim(coalesce(it->>'qty', '')), '') end,
            case when it->>'kind' = 'integratore' then nullif(trim(coalesce(it->>'qty', '')), '') end)
    on conflict do nothing;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke execute on function public.crm_nutri_library_import(jsonb) from public, anon;
grant execute on function public.crm_nutri_library_import(jsonb) to authenticated;
