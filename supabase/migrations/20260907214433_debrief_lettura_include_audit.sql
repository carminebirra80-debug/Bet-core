-- Estende il canale di sola lettura per includere le tabelle di audit.
--
-- Perche' esiste. Da qui in poi, oltre a picks/versamenti/impostazioni,
-- serve vedere anche cio' che ha creato il tracciamento di controllo:
--   - betcore_pick_history: il journal con prima e dopo di ogni modifica
--     alle giocate (chi, quando, cosa e' cambiato).
--   - betcore_snapshots: le fotografie di analisi (fase blind, mercato,
--     decisione, risultato) del protocollo di tracciabilita'.
-- Sono tabelle create da supabase/traceability.sql, non da una migrazione
-- di questo repository: vedi CLAUDE.md, sezione "Non siamo soli sul
-- progetto".
--
-- Stessa logica di prima, nessun principio nuovo: stessa funzione, stesso
-- segreto, sola lettura, nessuna scrittura possibile, revocabile in
-- qualsiasi momento con lo stesso drop function di sempre.
--
-- ISTRUZIONI PRIMA DI ESEGUIRE
--   Sostituire SEGRETO-DA-SCEGLIERE con LO STESSO segreto gia' in uso
--   (quello impostato in BETCORE_DEBRIEF_SECRET) — non uno nuovo, altrimenti
--   il canale esistente smette di funzionare finche' non si aggiorna anche
--   la variabile d'ambiente.

create or replace function public.debrief_lettura(segreto text)
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'picks',            (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) from public.picks p),
    'versamenti',       (select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) from public.versamenti v),
    'impostazioni',     (select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) from public.impostazioni i),
    'storico_giocate',  (select coalesce(jsonb_agg(to_jsonb(h)), '[]'::jsonb) from public.betcore_pick_history h),
    'snapshot_analisi', (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from public.betcore_snapshots s)
  )
  where segreto = 'SEGRETO-DA-SCEGLIERE';
$$;

comment on function public.debrief_lettura(text) is
  'Sola lettura per il debrief automatico: picks, versamenti, impostazioni, '
  'e le tabelle di audit (storico modifiche, snapshot di analisi). Protetta '
  'da segreto, nessuna scrittura possibile. Revocabile con drop function.';

revoke all on function public.debrief_lettura(text) from public;
grant execute on function public.debrief_lettura(text) to anon;
