-- AUVI (a.brignoli@auviagency.com) può entrare come wealth manager dal selettore dei profili,
-- come per gli altri professionisti.
insert into public.crm_user_roles (user_id, role, label)
values ('e1da53d4-5c6e-4ebd-a8c3-6987afde0a97', 'wealth', 'Wealth manager')
on conflict do nothing;
