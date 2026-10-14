-- Origine di ogni giocata: da dove arriva la scelta, tenuta separata dalla
-- classificazione del protocollo. Decisa da Carmine il 14/10/2026:
--   VEGGENTE  = dalle analisi del Veggente (giocate Sportbet)
--   BET_CORE  = dal protocollo BET Core
--   LIBERA    = spinta da Carmine fuori da entrambi
-- Il default LIBERA copre le versioni vecchie dell'app, che non mandano il
-- campo: sugli upsert di righe esistenti la colonna resta com'e'.
alter table public.picks
  add column if not exists origine text not null default 'LIBERA'
  check (origine in ('VEGGENTE','BET_CORE','LIBERA'));

comment on column public.picks.origine is
  'Origine della scelta: VEGGENTE, BET_CORE o LIBERA. Separata da classificazione.';

-- Storico: dal 15/09/2026 le giocate reali vengono dal Veggente (Sportbet),
-- per decisione di Carmine anche le poche Sportium. Prima: le osservate e le
-- BET PILOT sono del protocollo, il resto e' libero.
update public.picks set origine = case
  when tipo = 'reale' and data >= date '2026-09-15' then 'VEGGENTE'
  when tipo = 'osservata' or classificazione in ('BET CORE','BET PILOT')
       or tipster ilike 'bet core%' then 'BET_CORE'
  else 'LIBERA'
end;
