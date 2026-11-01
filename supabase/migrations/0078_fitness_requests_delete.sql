-- "Da fare" del preparatore: oltre a segnare come fatta, può eliminare una richiesta dell'atleta che segue.
drop policy if exists "freq_del" on public.fitness_requests;
create policy "freq_del" on public.fitness_requests for delete to authenticated using (fitness_can_manage(player_id));
