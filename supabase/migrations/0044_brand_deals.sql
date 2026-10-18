-- Vetrina › Brand (18/10/2026): convenzioni con i brand partner. L'atleta apre la scheda,
-- tocca "Attiva il mio codice", riceve il codice sconto (personale se AUVI gliene ha
-- assegnato uno, altrimenti quello del brand) e va allo shop a comprare.
-- Il codice non è leggibile finché l'atleta non lo attiva: la tabella è solo AUVI,
-- gli altri leggono la vista senza codice e lo ottengono dalle funzioni qui sotto.

create table if not exists public.crm_brand_deals (
  id uuid primary key default gen_random_uuid(),
  brand_name text not null,
  tagline text,
  description text,
  discount_label text,            -- es. "-20%"
  code text,                      -- codice valido per tutti gli atleti
  shop_url text not null,
  logo_url text,                  -- logo chiaro, sopra la foto
  cover_url text,
  accent_color text,
  terms text,                     -- condizioni (scadenza, esclusioni…)
  i18n jsonb not null default '{}'::jsonb,   -- {"en": {"tagline": …, "description": …, "terms": …}}
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

-- codici personali (es. BRIGNOLI15): vincono su quello generale
create table if not exists public.crm_brand_deal_codes (
  deal_id uuid not null references public.crm_brand_deals(id) on delete cascade,
  player_id bigint not null,
  code text not null,
  primary key (deal_id, player_id)
);

create table if not exists public.crm_brand_deal_activations (
  deal_id uuid not null references public.crm_brand_deals(id) on delete cascade,
  player_id bigint not null,
  user_id uuid,
  activated_at timestamptz not null default now(),
  shop_opens int not null default 0,
  last_open_at timestamptz,
  primary key (deal_id, player_id)
);

alter table public.crm_brand_deals enable row level security;
alter table public.crm_brand_deal_codes enable row level security;
alter table public.crm_brand_deal_activations enable row level security;

drop policy if exists p_brand_deals_admin on public.crm_brand_deals;
create policy p_brand_deals_admin on public.crm_brand_deals for all to authenticated
  using (current_crm_role() = 'admin') with check (current_crm_role() = 'admin');
drop policy if exists p_brand_deal_codes_admin on public.crm_brand_deal_codes;
create policy p_brand_deal_codes_admin on public.crm_brand_deal_codes for all to authenticated
  using (current_crm_role() = 'admin') with check (current_crm_role() = 'admin');
drop policy if exists p_brand_deal_act_select on public.crm_brand_deal_activations;
create policy p_brand_deal_act_select on public.crm_brand_deal_activations for select to authenticated
  using (current_crm_role() = 'admin' or crm_manages_player(player_id) or crm_team_sees(player_id));

-- vetrina senza codice: le convenzioni attive per tutti, anche quelle spente per AUVI
create or replace view public.crm_brand_deals_public as
  select id, brand_name, tagline, description, discount_label, shop_url, logo_url, cover_url,
         accent_color, terms, i18n, active, sort, (code is not null) as has_code
    from public.crm_brand_deals
   where active or current_crm_role() = 'admin';
grant select on public.crm_brand_deals_public to authenticated;

-- codici già attivati per un atleta (chi lo segue li rivede senza riattivarli)
create or replace function public.crm_brand_deal_codes_for(p_player bigint)
returns table (deal_id uuid, code text, activated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.deal_id, coalesce(c.code, d.code), a.activated_at
    from crm_brand_deal_activations a
    join crm_brand_deals d on d.id = a.deal_id
    left join crm_brand_deal_codes c on c.deal_id = a.deal_id and c.player_id = a.player_id
   where a.player_id = p_player
     and (crm_manages_player(p_player) or crm_team_sees(p_player));
$$;

-- "Attiva il mio codice": registra l'attivazione, avvisa AUVI la prima volta, restituisce il codice
create or replace function public.crm_activate_brand_deal(p_deal uuid, p_player bigint)
returns text language plpgsql security definer set search_path = public as $$
declare d record; v_code text; v_new boolean; v_name text;
begin
  if not crm_manages_player(p_player) then raise exception 'Non autorizzato'; end if;
  select * into d from crm_brand_deals where id = p_deal and active;
  if d is null then raise exception 'Convenzione non disponibile'; end if;
  select code into v_code from crm_brand_deal_codes where deal_id = p_deal and player_id = p_player;
  v_code := coalesce(v_code, d.code);
  if v_code is null then raise exception 'Codice in arrivo: AUVI lo sta preparando'; end if;

  insert into crm_brand_deal_activations (deal_id, player_id, user_id)
  values (p_deal, p_player, auth.uid())
  on conflict (deal_id, player_id) do nothing;
  v_new := found;

  if v_new and current_crm_role() = 'player' then
    select name into v_name from player where api_player_id = p_player;
    insert into crm_notifications (recipient_role, title, body, route, player_id, source_user_id)
    values ('admin', 'Codice sconto attivato',
            coalesce(v_name, 'Un atleta') || ' ha attivato il codice ' || d.brand_name,
            'services?tab=brand', p_player, auth.uid());
  end if;
  return v_code;
end $$;

-- apertura dello shop (statistica per AUVI e per il brand)
create or replace function public.crm_brand_deal_opened(p_deal uuid, p_player bigint)
returns void language sql security definer set search_path = public as $$
  update crm_brand_deal_activations set shop_opens = shop_opens + 1, last_open_at = now()
   where deal_id = p_deal and player_id = p_player and crm_manages_player(p_player);
$$;

revoke execute on function public.crm_brand_deal_codes_for(bigint) from public, anon;
revoke execute on function public.crm_activate_brand_deal(uuid, bigint) from public, anon;
revoke execute on function public.crm_brand_deal_opened(uuid, bigint) from public, anon;
grant execute on function public.crm_brand_deal_codes_for(bigint) to authenticated;
grant execute on function public.crm_activate_brand_deal(uuid, bigint) to authenticated;
grant execute on function public.crm_brand_deal_opened(uuid, bigint) to authenticated;

-- primo brand: CiaoGym (il codice lo inserisce AUVI dalla vetrina)
insert into public.crm_brand_deals (brand_name, tagline, description, shop_url, logo_url, cover_url, accent_color, terms, i18n, sort)
select 'CiaoGym', 'Activewear premium per allenamento e tempo libero',
       'Abbigliamento per l''allenamento e il tempo libero, uomo e donna. Spedizione in tutto il mondo.',
       'https://ciaogym.com/en_global/', '/brand-deals/ciaogym-logo-white.svg', '/brand-deals/ciaogym-cover-2.jpg', '#111111',
       'Inserisci il codice nel carrello, prima del pagamento.',
       '{"en": {"tagline": "Premium activewear for training and everyday", "description": "Training and athleisure apparel for men and women. Worldwide shipping.", "terms": "Enter the code in your cart before paying."}}'::jsonb,
       1
where not exists (select 1 from public.crm_brand_deals where brand_name = 'CiaoGym');
