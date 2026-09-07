-- Canale di sola lettura per il debrief automatico.
--
-- Perche' esiste. Il debrief richiede i dati veri del registro: giocate,
-- esiti, puntate, versamenti. Finora arrivavano a mano, via export CSV o
-- screenshot. Leggerli direttamente non era possibile: la chiave pubblica
-- presente in index.html e' soggetta a Row Level Security, quindi una
-- richiesta non autenticata vede zero righe su tutte e tre le tabelle
-- (verificato il 7 settembre 2026: picks, versamenti e impostazioni
-- rispondono tutte []). E' il comportamento corretto e non va indebolito:
-- quella chiave la legge chiunque apra la pagina.
--
-- La soluzione NON e' passare la service_role key, che legge, scrive e
-- cancella tutto ignorando ogni policy. Per leggere non serve.
--
-- Qui invece: una funzione di sola lettura, protetta da un segreto scelto
-- dall'utente, che restituisce i tre insiemi di dati in un solo jsonb. Se il
-- segreto non corrisponde la funzione non restituisce nulla — non solleva un
-- errore diverso, cosi' non si presta a distinguere "segreto sbagliato" da
-- "nessun dato" per tentativi ripetuti.
--
-- ISTRUZIONI PRIMA DI ESEGUIRE
--   1. Sostituire SEGRETO-DA-SCEGLIERE con una stringa lunga e casuale.
--      Non riusare password esistenti: questa vive in una variabile
--      d'ambiente, non in un gestore di password.
--   2. Eseguire nell'SQL Editor di Supabase.
--   3. Impostare la stessa stringa come variabile d'ambiente
--      BETCORE_DEBRIEF_SECRET nelle impostazioni dell'ambiente Claude Code.
--      Non incollarla in chat: la cronologia della conversazione e'
--      permanente quanto quella di git.
--
-- Per revocare l'accesso in qualsiasi momento:
--   drop function if exists public.debrief_lettura(text);

create or replace function public.debrief_lettura(segreto text)
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'picks',        (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) from public.picks p),
    'versamenti',   (select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) from public.versamenti v),
    'impostazioni', (select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) from public.impostazioni i)
  )
  where segreto = 'SEGRETO-DA-SCEGLIERE';
$$;

comment on function public.debrief_lettura(text) is
  'Sola lettura per il debrief automatico. Protetta da segreto, nessuna '
  'scrittura possibile. Revocabile con drop function.';

-- Nessun altro deve poterla eseguire oltre al ruolo anonimo usato dal
-- client: la protezione vera e' il segreto, ma il grant resta minimo.
revoke all on function public.debrief_lettura(text) from public;
grant execute on function public.debrief_lettura(text) to anon;
