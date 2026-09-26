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

## Avvisi a Carmine: via email

I promemoria (`send_later`) svegliano la sessione ma **non** fanno suonare il
telefono, e le notifiche push da sessione cloud non gli arrivano (verificato
il 25 settembre 2026). Carmine preferisce l'email: ogni avviso che deve
raggiungerlo mentre non guarda la chat (scatto di un check T-60/T-25,
verdetto finale, richiesta di conferma) va inviato con Gmail a
carmine.birra80@gmail.com, oggetto `Bet Core …` e corpo breve in testo
semplice, oltre che scritto in chat. Nel prompt di ogni promemoria va scritto
di mandare l'email.

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

## Registrare i consigli mentre si danno

Ogni pick proposto va scritto in `claude/consigli.csv` **durante l'analisi**,
non dopo: è l'unica traccia di cosa era stato consigliato prima di sapere
com'è finita, e senza di essa il debrief non può separare il rendimento del
metodo da quello delle giocate fatte per altri motivi. Anche le giornate
senza selezioni vanno registrate, con una riga `NESSUNA_SELEZIONE`: a
posteriori "analizzato, niente da giocare" e "non analizzato" sono
indistinguibili.

Nomi delle partite con separatore spaziato — `Juventus - Milan` — e note che
contengono virgole fra virgolette.

## Registro delle analisi: raccogliere dati per migliorare il metodo

Chiesto da Carmine il 26 settembre 2026. Oltre a `consigli.csv` (solo i
consigli dati), **ogni partita esaminata a T-60/T-25 va in
`claude/analisi.csv`, anche se scartata**, con `analytics/analisi_log.py`:

```bash
python3 analytics/analisi_log.py add --data 2026-09-26 --fascia 20:45 \
  --partita "Inghilterra - Spagna" --campionato UNL --mercato 2 \
  --tipo-notizia assenza_attacco --tesi "..." --t60 2.20 --t25 2.12 \
  --decisione scartata --motivo "notizia gia' prezzata"
python3 analytics/analisi_log.py chiudi --data ... --partita ... --mercato ... \
  --chiusura 2.05 --esito vinta --risultato 1-2
python3 analytics/analisi_log.py report
```

- **Quando**: la riga si scrive durante l'analisi (T-60, completata a T-25),
  non dopo. La **quota di chiusura** si legge poco prima del calcio d'inizio
  (Pinnacle, o la miglior quota se Pinnacle manca); **esito e risultato** al
  debrief. Il mercato registrato per le scartate è quello della tesi: "se
  avessimo giocato".
- **Perché la chiusura conta più dell'esito**: il CLV (quota d'ingresso /
  chiusura − 1) dice se la tesi aveva visto prima del mercato e si legge già
  su 20-30 casi; l'esito di una partita è quasi tutto rumore.
- `tipo_notizia` è un elenco chiuso (vedi `TIPI_NOTIZIA` nello script): se
  una notizia non ci sta, usare `altro` e descriverla in `tesi`, non
  inventare categorie nuove al volo.
- Ogni 2-3 settimane, `report` per tipo di notizia: è la base per decidere
  cosa tenere nel metodo.

## Quote e bookmaker

- **Sportium**, dove le giocate vengono fatte davvero, non è leggibile in
  automatico: `ERR_CONNECTION_RESET` a un browser reale, 403 a curl. È un
  blocco deliberato verso i server cloud, non un problema temporaneo — non
  riprovarci da una sessione cloud. **Da una sessione locale sul PC di
  Carmine invece si legge** (verificato il 26 settembre 2026 alle 08:53:
  Chrome vero, sportium.it — non sportium.es, che e' il sito spagnolo —
  quote 1X2 e pannello "Andamento del mercato"). Serve un browser reale:
  il semplice Web Fetch non esegue il JavaScript e vede la pagina senza
  numeri. Da cloud la quota va **chiesta a Carmine** (o letta dalla sessione
  locale) e registrata con `analytics/sportium_gap.py`.
- **Codere (IT)** è invece coperto da The Odds API con quote live vere: è
  l'unico book ADM italiano coperto (verificati assenti: Sportium, Snai,
  Eurobet, Lottomatica, Sisal, Goldbet).
- La chiave di The Odds API **non va mai scritta in un file** del
  repository: la cronologia git è permanente. Dal 26 settembre 2026 sta
  nelle variabili dell'ambiente cloud **Default** (insieme a
  `BETCORE_DEBRIEF_SECRET`), quindi le sessioni cloud la trovano già; in
  locale va impostata sul PC (`setx ODDS_API_KEY "..."`).
- FBref, Understat, FootyStats e WorldFootball sono dietro Cloudflare e
  restituiscono 403: non riprovarli.
- **Sportbet** (sportbet.it), usato da Carmine per alcune giocate, blocca la
  sessione cloud con Cloudflare "Sorry, you have been blocked": 403 sia a
  curl sia a Chromium reale (verificato il 26 settembre 2026). Come per
  Sportium, la quota va chiesta a Carmine (va bene uno screenshot).

## Segreti

Nessuna credenziale Supabase va gestita da qui. Le migrazioni al database le
esegue Carmine dal SQL Editor, con la query fornita in chat.

**Mai chiedere né accettare la `service_role` key**: legge, scrive e cancella
tutto ignorando le policy, e in chat resterebbe scritta per sempre. Per
leggere i dati del registro esiste un canale di sola lettura — vedi
`docs/README.md`, sezione "Lettura dei dati dell'app per il debrief":

```bash
python3 analytics/leggi_app.py stato               # verifica il canale
python3 analytics/leggi_app.py debrief 2026-09-06
```

Richiede `BETCORE_DEBRIEF_SECRET` fra le variabili d'ambiente e la migrazione
`20260907062803_add_debrief_read_function.sql` eseguita. Se `stato` dice che
il canale è chiuso, il messaggio indica quale dei due passi manca: non
tentare aggiramenti, chiedere a Carmine di completarlo.

## Non siamo soli sul progetto

Sul repository e sullo **stesso database Supabase** lavora anche ChatGPT
(Codex), con una credenziale propria — un connettore Supabase autenticato
lato OpenAI — che questa sessione non ha e non deve avere.

**Regola di convivenza, decisa da Carmine il 7 settembre: coesistere, non
integrarsi.** Ognuno lavora sul proprio branch. **Nessuno fonde il branch
dell'altro su main senza il via libera esplicito di Carmine** — nemmeno per
recuperare un singolo file, nemmeno se il branch sembra aggiornato. Lo stato
di un branch altrui va sempre riverificato sul momento (`git log`, `git diff`
contro `origin/main`): il branch `betcore-audit-traceability`, per esempio,
è stato "una fotografia vecchia, ferma al 5 settembre" fino alla mattina del
7 — poi Codex l'ha aggiornato in pochi minuti aggiungendo scope nuovo
(riscrittura della sincronizzazione cloud in `sync-merge.js`, nuovo
`market-metrics.js`). Una descrizione dello stato di un branch scritta qui è
una fotografia, non una garanzia: verificarla, non fidarsi.

**Lo stato del database non si deduce più dalle migrazioni del repository.**
Sono attive tabelle di audit — `betcore_pick_history` (journal con prima e
dopo di ogni modifica alle picks), `betcore_snapshots`, la vista
`betcore_data_quality` — create da `supabase/traceability.sql`, che vive solo
su quel branch e fuori da `supabase/migrations/`. Prima di proporre una
modifica allo schema, verificare cosa c'è davvero invece di fidarsi dei file.

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
