-- BET CORE Live (17/10/2026) — gia' applicata al database da Claude il 17/10:
-- questo file e' la traccia nel repository, non va rieseguito.
--
-- La chiave di API-Football NON e' qui: sta nel Vault di Supabase con nome
-- 'api_football_key' (creata con vault.create_secret, fuori dal repository).
-- Nel Vault c'e' anche 'live_prova', un codice casuale con cui le sessioni
-- di Claude provano la funzione "live" lato server senza il login di Carmine.

-- Cache delle risposte della fonte (calendario del giorno con punteggi).
create table if not exists public.live_cache (
  chiave text primary key,
  dati jsonb not null,
  aggiornato timestamptz not null default now()
);
alter table public.live_cache enable row level security;
comment on table public.live_cache is 'BET CORE Live: cache delle risposte API-Football (partite del giorno, punteggi). Solo funzioni server (service_role), nessuna policy per i client.';

-- Lettura della chiave, solo per le funzioni server.
create or replace function public.live_chiave_api_football()
returns text language sql security definer set search_path = ''
as $$ select decrypted_secret from vault.decrypted_secrets where name = 'api_football_key' limit 1; $$;
revoke all on function public.live_chiave_api_football() from public, anon, authenticated;
grant execute on function public.live_chiave_api_football() to service_role;

-- Codice per le prove lato server.
create or replace function public.live_segreto_prova()
returns text language sql security definer set search_path = ''
as $$ select decrypted_secret from vault.decrypted_secrets where name = 'live_prova' limit 1; $$;
revoke all on function public.live_segreto_prova() from public, anon, authenticated;
grant execute on function public.live_segreto_prova() to service_role;
