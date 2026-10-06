-- 06/10/2026, eseguita da Claude via connettore Supabase con l'ok di Carmine.
-- Le rettifiche di riconciliazione possono servire in negativo (l'app calcola
-- piu' soldi di quelli sul conto, es. dopo aver cancellato le giocate di
-- Rubino e Mercante: rettifica di -50,42 al saldo Sportbet di 85,00).
-- I versamenti restano solo positivi.
alter table public.versamenti drop constraint versamenti_importo_check;
alter table public.versamenti add constraint versamenti_importo_check
  check (importo > 0 or (tipo_movimento = 'rettifica' and importo <> 0));
