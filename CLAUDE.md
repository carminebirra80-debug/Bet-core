# Bet Core — istruzioni di progetto

## Orari: controllare sempre, mai stimare

**Prima di scrivere un orario, una durata o un "fra quanto", eseguire il
comando.** Mai dedurre l'ora dal contesto della conversazione.

```bash
TZ=Europe/Rome date "+%H:%M del %d/%m"
```

Non è una precauzione teorica: il 6 settembre 2026 questo errore è stato
commesso due volte nella stessa mattina — "fra circa un'ora" quando mancavano
3h20, e "sei a un'ora dall'analisi" quando mancavano 2h54. In entrambi i casi
la causa era la stessa: stimare a mente invece di leggere l'orologio.

Due trappole specifiche di questo progetto:

- **I promemoria sono in UTC, l'utente ragiona in ora italiana.** Un trigger
  che parte alle `11:30Z` scatta alle **13:30** per Carmine (12:30 in ora
  solare). Leggere `next_run_at` e riportarlo tale e quale è un errore.
- **football-data.co.uk pubblica gli orari in ora UK**, un'ora indietro
  rispetto a quella italiana. `analytics/prepara_giornata.py` converte già e
  lo dichiara nel dossier: non ri-convertire a valle.

Su un protocollo costruito su controlli a T-60 e T-25, un'ora di scarto non è
un dettaglio di forma: sposta il momento in cui una giocata va verificata.

## Conferma prima di ogni analisi

Carmine ha chiesto esplicitamente di **chiedere sempre conferma prima di
lanciare un'analisi**, mai partire in automatico allo scattare di un
promemoria. Vale anche quando il promemoria stesso descrive il lavoro da
fare.

## Metodo: cosa regge e cosa no

- Il modello Poisson interno è stato validato e **bocciato**: log-loss
  peggiore del mercato in tutti i campionati testati, ROI negativo su ogni
  combinazione di peso e soglia. Vedi `analytics/RISULTATI.md`. Serve solo
  per **scartare** o per segnalare dove indagare con le notizie, **mai** come
  base di una selezione.
- Il criterio di ingresso reale è la tesi sulle notizie di formazione,
  verificata a T-60 e T-25.
- Non costruire multiple per raggiungere una quota-obiettivo: se non c'è un
  segnale credibile, dirlo (manuale sez. 15). Il valore di una giornata sta
  anche nelle partite scartate.

## Quote e bookmaker

- **Sportium**, dove le giocate vengono fatte davvero, non è leggibile in
  automatico: `ERR_CONNECTION_RESET` a un browser reale, 403 a curl. È un
  blocco deliberato, non un problema temporaneo — non riprovarci ogni
  sessione. La quota reale va **chiesta a Carmine** e registrata con
  `analytics/sportium_gap.py`.
- **Codere (IT)** è invece coperto da The Odds API con quote live vere: è
  l'unico book ADM italiano coperto (verificati assenti: Sportium, Snai,
  Eurobet, Lottomatica, Sisal, Goldbet).
- La chiave di The Odds API **non va mai scritta in un file** del
  repository: la cronologia git è permanente. Si chiede a Carmine e si
  esporta a mano nella sessione (`export ODDS_API_KEY=...`).
- FBref, Understat, FootyStats e WorldFootball sono dietro Cloudflare e
  restituiscono 403: non riprovarli.

## Segreti

Nessuna credenziale Supabase va gestita da qui. Le migrazioni al database le
esegue Carmine dal SQL Editor, con la query fornita in chat.

## Verifica del lavoro

L'app è un file solo, `index.html`, con JS e CSS inline. Prima di dichiarare
fatta una modifica:

```bash
for t in tests/*.test.js; do node "$t"; done
for t in tests/*.test.py; do python3 "$t"; done
```

E per le modifiche che si vedono, **guardare davvero il risultato** con uno
screenshot reale (Chromium è in `/opt/pw-browsers/`), non fidarsi del codice:
è così che il 6 settembre sono stati trovati un interruttore illeggibile e un
avviso che confrontava grandezze diverse, entrambi invisibili leggendo il
diff.

Quando si aggiunge un test, verificarlo con una **prova di mutazione**: si
rompe di proposito la logica e si controlla che il test fallisca. Sempre il 6
settembre, un test nuovo passava anche con la percentuale sbagliata — perché
cercava una cifra che compariva anche altrove nella pagina.
