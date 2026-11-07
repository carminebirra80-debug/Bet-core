-- BET CORE Notifiche (v4.58, 07/11/2026). Da eseguire una volta dal SQL
-- Editor di Supabase. Crea:
--   push_iscrizioni  i telefoni iscritti (li scrive solo la funzione "notifiche")
--   notifiche        gli avvisi da mandare: chi scrive una riga qui fa
--                    suonare il telefono (user_id vuoto = tutti i telefoni)
--   push_config      le chiavi VAPID, create dalla funzione al primo uso
-- e il trigger che, a ogni riga nuova in notifiche, chiama la funzione.
-- Il codice che autorizza il trigger lo genera il database stesso e resta
-- nel Vault (notifiche_segreto): non passa da chat ne' da GitHub.

create extension if not exists pg_net with schema extensions;

-- Telefoni iscritti.
create table if not exists public.push_iscrizioni (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  dispositivo text,
  creato timestamptz not null default now(),
  ultimo_ok timestamptz,
  errori int not null default 0
);
alter table public.push_iscrizioni enable row level security;
revoke all on public.push_iscrizioni from anon, authenticated;
grant all on public.push_iscrizioni to service_role;
comment on table public.push_iscrizioni is 'BET CORE Notifiche: iscrizioni Web Push dei telefoni. Solo la funzione notifiche (service_role).';

-- Avvisi.
create table if not exists public.notifiche (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  titolo text not null,
  testo text not null default '',
  vista text,          -- scheda da aprire al tocco: registro, live, codici, cassa, dati...
  tag text,            -- stessa etichetta = la nuova sostituisce la vecchia sul telefono
  origine text,        -- chi l'ha scritta: T-60, scandaglio, debrief, prova...
  creato timestamptz not null default now(),
  inviata timestamptz,
  esito text
);
alter table public.notifiche enable row level security;
grant select on public.notifiche to authenticated;
grant all on public.notifiche to service_role;
drop policy if exists notifiche_proprie on public.notifiche;
create policy notifiche_proprie on public.notifiche for select to authenticated
  using (user_id is null or user_id = auth.uid());
comment on table public.notifiche is 'BET CORE Notifiche: ogni riga nuova diventa una notifica sul telefono (trigger notifiche_invia).';

-- Chiavi VAPID (una riga sola).
create table if not exists public.push_config (
  id int primary key default 1 check (id = 1),
  pubblica text not null,
  privata jsonb not null,
  creato timestamptz not null default now()
);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;
grant all on public.push_config to service_role;

-- Codice casuale per il trigger, nel Vault.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'notifiche_segreto') then
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'notifiche_segreto');
  end if;
end $$;

create or replace function public.notifiche_segreto()
returns text language sql security definer set search_path = ''
as $$ select decrypted_secret from vault.decrypted_secrets where name = 'notifiche_segreto' limit 1; $$;
revoke all on function public.notifiche_segreto() from public, anon, authenticated;
grant execute on function public.notifiche_segreto() to service_role;

-- A ogni riga nuova: chiamata alla funzione (asincrona, non blocca l'insert).
create or replace function public.notifiche_invia()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare s text;
begin
  select decrypted_secret into s from vault.decrypted_secrets where name = 'notifiche_segreto' limit 1;
  if s is null or new.inviata is not null then return new; end if;
  perform net.http_post(
    url := 'https://sfcqxlerijeptejryruk.supabase.co/functions/v1/notifiche?azione=invia',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notifiche-segreto', s),
    body := jsonb_build_object('id', new.id)
  );
  return new;
end $$;
revoke all on function public.notifiche_invia() from public, anon, authenticated;

drop trigger if exists notifiche_invia on public.notifiche;
create trigger notifiche_invia after insert on public.notifiche
  for each row execute function public.notifiche_invia();
