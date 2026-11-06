-- Accordi commerciali (spunti competitor, nov 2026)
--  * lo sponsor diventa l'"Accordo": proposta → trattativa → firmato → consegne → chiuso
--  * rate di pagamento (incassi) e commissione visibili anche all'atleta
--  * collegamento al contratto firmato

alter table public.crm_sponsors
  add column if not exists payments jsonb not null default '[]'::jsonb,
  add column if not exists commission_pct numeric,
  add column if not exists contract_id uuid references public.crm_contracts(id) on delete set null,
  add column if not exists updated_at timestamptz default now();
