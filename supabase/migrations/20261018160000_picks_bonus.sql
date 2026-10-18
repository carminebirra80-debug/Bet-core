-- Bonus del bookmaker sulle giocate (18/10/2026, chiesto da Carmine).
-- Euro in piu' sulla vincita oltre a puntata x quota (bonus multipla di
-- Sportbet). L'app lo somma al profitto solo quando la giocata e' vinta;
-- la quota resta quella vera. Colonna facoltativa: le righe esistenti
-- restano senza bonus. Da eseguire dal SQL Editor di Supabase.
alter table public.picks add column if not exists bonus numeric(10,2);
comment on column public.picks.bonus is 'Bonus del bookmaker in euro, sommato al profitto se la giocata e'' vinta (BET CORE v4.44)';
