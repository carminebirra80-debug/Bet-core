-- Codici schedina del Veggente (deciso da Carmine il 17/10/2026): giocati su
-- Sportbet con una cassa propria, separata dalla principale (Sportium).

-- Nuova origine CODICI e il codice della schedina sulla giocata.
alter table public.picks drop constraint if exists picks_origine_check;
alter table public.picks add constraint picks_origine_check
  check (origine in ('VEGGENTE','BET_CORE','LIBERA','CODICI'));
alter table public.picks add column if not exists codice_schedina text;

-- Ogni movimento appartiene a una cassa. I movimenti esistenti sono tutti
-- della principale.
alter table public.versamenti
  add column if not exists cassa text not null default 'PRINCIPALE'
  check (cassa in ('PRINCIPALE','CODICI'));
