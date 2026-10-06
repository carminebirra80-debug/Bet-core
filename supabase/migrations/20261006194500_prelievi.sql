-- 06/10/2026, eseguita da Claude via connettore Supabase con l'ok di Carmine.
-- Nuovo tipo di movimento: prelievo (importo salvato positivo, l'app lo
-- sottrae dalla cassa e lo somma al risultato reale).
alter table public.versamenti drop constraint versamenti_tipo_movimento_check;
alter table public.versamenti add constraint versamenti_tipo_movimento_check
  check (tipo_movimento = any (array['versamento'::text, 'rettifica'::text, 'prelievo'::text]));
