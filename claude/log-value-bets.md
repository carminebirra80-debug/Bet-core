# Log Value Bets

Storico delle selezioni prodotte con il protocollo `calcio-value-bets` (v3.1).
Serve per il debrief post-partita: aggiornare il campo ESITO (vinto / perso / push)
dopo le gare, prima di trarre conclusioni. Proporre aggiustamenti alle regole solo
se emerge un pattern su piu' voci, mai da un singolo risultato.

---

## 2026-09-05 (sabato) — Weekend

**Raddoppio** (quota 1.80-2.20): NON PRODOTTO.
Motivo: solo 2 selezioni superano la soglia edge >=5% al limite inferiore della stima,
quotate 2.05 e 2.32. Qualsiasi doppia con entrambe vale 4.76, fuori banda. Per rientrare
in 1.80-2.20 sarebbe servita una gamba sotto soglia (Forest-Tottenham Under 3.5 @1.30 =
+4.0%; Fulham 1X @1.40 = +1.1%). Non forzato, da protocollo.

**Multipla Quota 5**: NON PRODOTTA.
Motivo: servono 4-5 gambe da partite diverse, ne sono state trovate 2 sopra soglia.

**Selezioni in value (giocabili come singole):**
- Nottingham Forest-Tottenham (Premier League, 16:00) | NO GOL | 2.05 (Marathonbet / AdmiralBet / StarVegas) | Value +11.9% | ★★ | Confidence B | ESITO: VINTA (0-0)
- Fulham-Crystal Palace (Premier League, 16:00) | 1 (Fulham) | 2.32 (Marathonbet) / 2.30 (AdmiralBet, StarVegas) | Value +7.7% | ★ | Confidence B | ESITO: PERSA (2-3 Palace)

**Doppia opzionale** (fuori banda Raddoppio, entrambe le gambe sopra soglia): 2.05 x 2.32 = 4.76 | ESITO: PERSA (una gamba persa annulla la combinazione)

**Alternativa segnalata ma non combinabile** (stessa partita del pick 1, correlata):
- Nottingham Forest-Tottenham | Under 2.5 | 1.83 (Marathonbet / AdmiralBet / StarVegas) | Value +9.1% | ★★ | ESITO: VINTA (0-0, mai giocata)

### Motivazioni sintetiche
- **Forest-Tottenham NoGol**: Tottenham a secco in campionato (0-3 a Brentford, 0-2 col
  Newcastle) e senza Kulusevski, Xavi Simons, Odobert, Sarr. Forest in casa 0.80 gol fatti
  / 0.70 subiti (ultime 10 interne). Poisson lambda 1.25/0.85 -> NoGol 59.1%; scenario
  pessimistico (1.35/0.95) 54.6% contro consenso de-vigato 48.8%. Unica selezione in value
  su tutta la banda di stima.
- **Fulham-Palace 1**: Palace senza Mateta e Sarr; in trasferta 1.00 gol fatti / 1.90 subiti
  (ultime 10). Fulham in casa 1.50 gol fatti, xG casalingo citato 1.6. Poisson 1.60/1.05 ->
  50.1%; floor (1.50/1.10) 46.4% contro 43.1% implicito e 41.6% de-vigato.

### Scartate (18 partite analizzate)
| Partita | Mercato | Quota | Motivo |
|---|---|---|---|
| Inter-Napoli | Gol Si | 2.00 | modello 47.7-55.7%, -4.6% al floor |
| Roma-Atalanta | X2 | 2.22 | +21.8% ottimistico ma -2.9% al floor |
| Roma-Atalanta | Under 2.5 | 1.90 | -1.5% al floor |
| Fiorentina-Torino | NoGol | 1.90 | +6.7% centrale, 0.0% al floor |
| Fiorentina-Torino | Under 2.5 | 1.74 | +3.7% centrale, prezzo efficiente |
| Man City-Coventry | NoGol | 1.78 | -3.2% al floor (gia' prezzato) |
| Man City-Coventry | Handicap 1 (-1) | 1.50 | negativo su tutta la banda |
| Newcastle-Bournemouth | 2 | 3.40 | +47.4% = red flag, artefatto campione |
| Brentford-Sunderland | Over 2.5 | 1.81 | -10.6% al floor |
| Brighton-Leeds | vari | vari | nessun mercato sopra +1.1% |
| Hull-Aston Villa | Under 2.5 | 1.81 | -2% al floor; 1X2 inquinato da dati Championship |
| Hoffenheim-Dortmund | 2 | 2.50 | xG fonte 1.68/1.92 corregge il mio input; edge azzerato da 4 assenze BVB |
| Werder-Lipsia | 1 | 4.10 | +26.6% teorico = errore di modello (Werder 4 ko di fila) |
| Leverkusen-Union | 1 | 1.42 | quota equa 1.52, value negativo |
| Gladbach-Elversberg | Over 2.5 / Gol Si | 1.60 / 1.56 | modello ~ mercato |
| Paderborn-Friburgo | 1 | 3.50 | artefatto neopromossa (medie 2. Bundesliga) |
| Schalke-Bayern | 2 | 1.13 | quota equa 1.21, value negativo |
| Villarreal-Deportivo | Gol Si | 1.81 | -0.1% al floor |
| Villarreal-Deportivo | 1 | 1.48 | -25% |
| Athletic-Atletico | Over 2.5 | 1.91 | +12.6% centrale, +1.2% al floor |
| Athletic-Atletico | 1 | 2.88 | +9.5% ma senza ragione identificabile |
| Lens-Lorient | 1 / Over 2.5 | 1.46 / 1.65 | quota equa Lens 1.57, Over -1% |
| Maritimo-Benfica | 2 / NoGol | 1.18 / 1.71 | quota equa Benfica 1.35 |

### AVVERTENZA AGGIUNTA A POSTERIORI (5 settembre 2026, ore 12:27)

I due "value" dichiarati sopra (+11.9% e +7.7%) sono stati calcolati con un
modello Poisson che, nello stesso pomeriggio, e' stato validato su dati storici
e BOCCIATO. Vedi analytics/RISULTATI.md per i numeri completi. In sintesi:

- Backtest walk-forward contro le quote di chiusura: log-loss del modello
  peggiore di quello del mercato in tutti i campionati testati (1.0132 contro
  0.9624 in Serie A), e ROI -21% su 500 scommesse.
- Griglia su peso del modello, soglia di edge e campione minimo: nessuna
  combinazione in utile; il log-loss peggiora in modo monotono man mano che si
  sposta peso dal mercato al modello, in tutti e quattro i campionati.
- Il difetto e' strutturale: lo shrinkage appiattisce le stime, quindi il
  modello sottovaluta i favoriti e sopravvaluta pareggi e outsider. Le due
  selezioni di oggi sono entrambe su squadre non favorite, cioe' esattamente
  dove il modello sbaglia di piu'.

Conseguenza pratica: le percentuali di value qui sopra NON sono affidabili e
non vanno riportate come se lo fossero. Cio' che regge di queste due selezioni
e' il ragionamento sulle notizie di formazione (Tottenham a secco e senza
quattro attaccanti; Palace senza Mateta e Sarr), non l'aritmetica.

Riscontro parziale: il modello ricostruito su dati reali (xG di
football-data.co.uk, non medie lette nelle anteprime) mette il Fulham al 44.1%
contro il 40.8% del consenso de-vigato. Stessa direzione, ma scarto troppo
piccolo per essere un segnale.

Da trattare quindi come scommesse basate su un'intuizione informata, non come
value bet certificate. Il criterio della verifica delle 15:00 e' "la notizia
regge?", non "il modello dice +7.7%".

### VERIFICA T-60 (ore 15:00, sezione 13A del manuale)

Controllo eseguito a 60 minuti dal fischio d'inizio (16:00). Oggetto: formazioni
ufficiali/probabili, assenze dell'ultima ora, meteo. Le quote non sono state
riverificate in questo passaggio (verranno ricontrollate al refresh T-25 delle
15:35, che ha invece per oggetto il prezzo).

**Nottingham Forest-Tottenham | NO GOL @2.05 | VERDETTO: BET (confermata)**
- Kulusevski: ancora in fase di recupero cautelativo, NON disponibile. Nessun
  rientro a sorpresa.
- Xavi Simons e Odobert: assenze lunghe confermate invariate (rientro non
  prima di inizio/meta' 2027).
- Sarr: infortunio minore confermato, nessun rientro a sorpresa.
- NOTIZIA NUOVA (non nota stamattina): James Maddison, frattura alla spalla,
  forte dubbio per la trasferta. Rinforza la tesi: un quarto titolare offensivo
  Spurs a rischio, in aggiunta ai tre gia' fuori.
- Difesa Forest (Sels, Murillo, Milenkovic): tutti disponibili, nessuna
  assenza pesante. Condizione di invalidazione non verificata.
- Meteo Nottingham 16:00: sereno/variabile, ~20°C, vento debole, pioggia <5%.
  Nessun fattore avverso.
- Quota invariata 2.05. Value ricalcolato sullo stesso floor 54.6%: +11.9%
  (invariato, nessun input e' cambiato).

**Fulham-Crystal Palace | 1 (Fulham) @2.32 | VERDETTO: BET (confermata)**
- Mateta: infortunio bicipite femorale/coscia confermato dal tecnico Pierre
  Sage, stop previsto ~3 settimane. Nessun rientro a sorpresa.
- Sarr: confermato "needs time to recover, is injured at the moment"
  (inguine). Nessun rientro a sorpresa.
- Assente anche Chadi Riad (ginocchio) - ulteriore indebolimento difesa Palace,
  non contemplato stamattina ma coerente con la tesi (non la indebolisce).
- Fulham (Leno, Andersen, Berge, Iwobi): nessuna assenza pesante rilevata.
  Condizione di invalidazione non verificata.
- Quota invariata 2.30-2.32. Value ricalcolato sullo stesso floor 46.4%:
  +7.7% (invariato).

Nota: nessuna delle due formazioni e' ancora UFFICIALE al momento del
controllo (mancano ~60' al fischio d'inizio) - i dati sono probabili/aggregati
da piu' fonti (Sports Mole, LastWordOnSports, Sportsgambler, CPFC.co.uk,
Agimeg). La conferma definitiva arriva di norma a ridosso del fischio
d'inizio; il refresh T-25 delle 15:35 e' il punto in cui verificarla se
disponibile, insieme al movimento quota.

Per entrambe: nessuna delle condizioni di invalidazione elencate stamattina si
e' verificata. Il criterio resta quello dichiarato: tiene la notizia, non il
numero del modello (vedi avvertenza sotto).

### VERIFICA T-25 (ore 15:35, sezione 13A del manuale)

Secondo controllo, 25 minuti dal fischio d'inizio. Oggetto: il prezzo, non
piu' l'informazione (quella era il controllo delle 15:00).

**LIMITAZIONE DA DICHIARARE ESPLICITAMENTE** (manuale §2A: "se le fonti sono
discordanti, dichiararlo e ridurre Market Quality"): non sono riuscito a
verificare una quota realmente LIVE a T-25. Le fonti raggiungibili (agimeg.it,
sportsgambler) restituivano valori con timestamp di 2-3 giorni fa (rilevati
il 2-3 settembre), identici a quelli di stamattina; ESPN e Oddspedia non
erano raggiungibili (403 / pagina vuota). Non posso quindi dichiarare "nessun
movimento" con la stessa certezza di un vero controllo Odds Live - posso solo
dire che non ho trovato ALCUNA evidenza di movimento, il che e' diverso da
averlo escluso attivamente. Da manuale, questo classifica la Market Quality
di questo refresh come ridotta, non piena.

**Nottingham Forest-Tottenham | NO GOL | VERDETTO: BET (confermata)**
- Quota di riferimento (nessuna variazione rilevata, dato non live): 2.05
- Formazione Tottenham: coerente fra le fonti (Kinsky; Porro, Van Hecke, Van
  de Ven, Udogie; Bentancur, Gallagher, Tonali; Savio, Tel; Marmoush) - nessun
  rientro a sorpresa dei quattro assenti gia' noti.
- Formazione Forest: fonti IN CONFLITTO sulla punta centrale (Jesus vs Delap).
  Non e' un'informazione che invalida la tesi (riguarda l'attacco Forest, non
  la difesa ne' l'attacco Tottenham), ma resta un'incertezza non risolta.
- Nessuna notizia flash nell'ultima ora oltre quanto gia' noto alle 15:00.

**Fulham-Crystal Palace | 1 (Fulham) | VERDETTO: BET (confermata)**
- Quota di riferimento (nessuna variazione rilevata, dato non live): 2.32
  (Marathonbet) / 2.30 (AdmiralBet, StarVegas)
- Formazione Palace piu' convergente tra le fonti ora: Henderson; Canvot,
  Disasi, Richards; Khalaili, Wharton, Timber, Mitchell; Kamada, Pino;
  Nketiah. **Mateta in panchina, Sarr fuori dai convocati/indisponibile**:
  CONFERMA diretta della tesi, non piu' solo "probabile assenza".

**Cronologia prezzo per il registro (sezione 17A - da tenere separata)**

| Pick | Quota iniziale (mattina) | Check T-60 (15:00) | Refresh T-25 (15:35) |
|---|---|---|---|
| Forest-Tottenham NoGol | 2.05 | 2.05 (nessuna riverifica quote, solo formazioni) | 2.05 (nessun movimento rilevato, dato non live) |
| Fulham 1 | 2.32 / 2.30 | 2.32 / 2.30 (idem) | 2.32 / 2.30 (idem) |

**Verdetto finale pre-match: entrambe BET, quota minima accettabile invariata
rispetto a stamattina** (2.05 e 2.30 sui book nominati). Nessuna delle due
richiede attesa (HOLD) o annullamento (PASS): nessuna notizia ha invalidato le
tesi, anzi la seconda e' stata rinforzata dalla formazione Palace.

### Multiple Fabrizio Rubino (Tipster — fuori conteggio Core)

Giocate reali di oggi, riferite dall'utente (non leggibili da Supabase in
questa sessione, nessuna credenziale). Registrate qui solo per completare il
quadro della cassa al debrief di stasera — non entrano nella validazione
del metodo Core (origine Tipster, non Core).

| Multipla | Quota | Stake | Esito |
|---|---|---|---|
| Fabrizio Rubino #1 | 5,00 | €5,00 | da verificare |
| Fabrizio Rubino #2 | 2,00 | €5,00 | da verificare |

Stake fisso €5 su entrambe, indipendentemente dalla quota: comportamento
reale confermato dall'utente, diverso dal suggerimento a fasce dell'app
(che per Tipster+Multipla proporrebbe ~€4 su quota 5,00 e ~€8 su quota
2,00). Non e' un difetto: il campo "Punto invece" nel form esiste apposta
per sovrascrivere il suggerimento, ed e' quello che viene usato qui. Nessuna
modifica al codice richiesta finche' l'utente non chiede un default diverso.

### Note metodologiche della sessione
- Sportium (il bookmaker reale su cui si gioca) restituisce HTTP 403 su ogni
  accesso automatizzato, verificato empiricamente - vedi docs/README.md,
  sezione "Limite verificato: Sportium non e' raggiungibile". Le quote
  riportate in questo log vengono sempre da book terzi (Marathonbet,
  AdmiralBet, StarVegas), mai da Sportium: il prezzo reale va sempre
  controllato a mano prima di giocare.

- FBref, Understat, FootyStats e WorldFootball non raggiungibili (protezione Cloudflare):
  stime costruite su medie gol segnati/subiti con split casa/trasferta (ultime 10), non su xG puri.
- 3a giornata: campioni stagionali minimi, alcune medie "ultime 10" contengono ancora la
  stagione precedente o serie inferiori per le neopromosse -> bande di stima larghe e uso
  sistematico del limite inferiore.
- Arbitri non reperiti al momento dell'analisi -> Confidence massima raggiungibile: B.
  CORREZIONE della stessa giornata: erano invece disponibili in fixtures.csv di
  football-data.co.uk (Forest-Tottenham: C Pawson; Fulham-Palace: S Barrott).
  Dalle prossime analisi l'arbitro non e' piu' un limite alla Confidence.
- Nessun movimento quota osservabile in automatico (OddsPortal e volumi Betfair Exchange
  richiedono JavaScript/login) -> Timing sempre "Monitorare".
- Pattern del giorno: tutti i favoriti corti in value negativo (Bayern, Benfica, Leverkusen,
  Villarreal, Lens). Gli unici edge reali su squadre in crisi offensiva conclamata, dove il
  mercato e' piu' lento ad aggiornarsi rispetto alle assenze.

---

## DEBRIEF — 5 settembre 2026, ore 23:30 (sezione 17/17A del manuale)

### Risultato sportivo (fonte pulita, verificato dopo il conflitto iniziale)

**Nottingham Forest 0-0 Tottenham.** Due fonti indipendenti convergono (VAVEL:
"late goal ruled out in tense draw"; NBC Sports/altre: gol Forest annullato al
67' per fallo di mano sulla linea di porta dopo revisione VAR). Il conflitto
segnalato nella prima ricerca (una fonte diceva "Tottenham 0-3 Forest") non
regge al controllo con fonte pulita: era un risultato sbagliato o di un'altra
partita, scartato. **0-0 confermato, nessuna delle due squadre ha segnato.**

**Fulham 2-3 Crystal Palace** (ESPN). Nessun conflitto, fonte unica solida
gia' dalla prima ricerca.

### Esito e liquidazione, pick per pick

| Pick | Mercato | Quota Sportium reale | Stake | Risultato sportivo | Esito | Liquidazione |
|---|---|---|---|---|---|---|
| Forest-Tottenham | NO GOL | 2.10 | €5 | 0-0 | **VINTA** | +€5,50 (incasso €10,50) |
| Fulham-Crystal Palace | 1 (Fulham) | 2.18 | €5 | 2-3 Palace | **PERSA** | −€5,00 |

**Netto Core: +€0,50 su €10 giocati** (una vinta, una persa; le quote usate
sono quelle reali Sportium registrate in `claude/sportium-quotes.csv`, non
quelle citate nell'analisi mattutina — 2.05→2.10 e 2.32→2.18).

### Lettura per pick (criterio: ha tenuto LA TESI sulle notizie, non il numero del modello — gia' bocciato, vedi RISULTATI.md)

**Forest-Tottenham NO GOL — decisione buona, tesi confermata, non solo varianza.**
La tesi centrale era l'attacco Tottenham azzerato (Kulusevski, Xavi Simons,
Odobert gia' fuori + Maddison aggiunto a T-60): lo Spurs non ha segnato,
esattamente come previsto dalla notizia, non da un numero di modello. Il
fatto che anche il Forest sia rimasto a secco (compreso un gol annullato al
67') non era la parte pronosticata della tesi, ma e' coerente con una partita
tesa e con poche occasioni nitide, non un colpo di fortuna scollegato dal
ragionamento. Classificazione: **tesi confermata, vittoria coerente con
un'analisi corretta**, non un caso limite da manuale.

**Fulham 1 — persa, ma la tesi sulle notizie non e' stata smentita da un
errore di analisi o di timing; e' il caso in cui l'assenza di attaccanti
avversari non garantisce comunque il risultato.**
Le assenze Palace (Mateta, Sarr, Riad) erano confermate correttamente sia a
T-60 sia a T-25: non c'e' stato un errore di timing/esecuzione, l'informazione
usata per decidere era giusta e aggiornata fino al fischio d'inizio. Il Palace
ha comunque segnato 3 gol senza i suoi tre attaccanti titolari, e il Fulham
ne ha subiti 3 in casa. Questo e' il punto reale da annotare: **la tesi
"attacco indebolito -> meno gol -> favorito in casa vince" e' incompleta**,
perche' non tiene conto della qualita' dei sostituti ne' della tenuta
difensiva di chi gioca in casa (Fulham ha subito 3 gol in casa, un dato che
l'analisi di stamattina non ha pesato abbastanza, concentrata solo sulle
assenze avversarie). Non e' pero' un errore dimostrato con un solo caso:
puo' essere normale varianza (una squadra indebolita puo' comunque vincere
una partita su cinque) oppure un buco reale nel metodo (guardare solo le
assenze offensive avversarie, mai la tenuta difensiva di chi si gioca).
**Descrittivo, non un pattern**: un solo caso non basta per cambiare la
regola (manuale, sez. 17A e 18) — ma vale la pena tenerlo d'occhio nelle
prossime giornate: quando la tesi si basa solo su "squadra X senza i suoi
attaccanti", verificare anche i gol subiti in trasferta/casa di chi si
gioca, non solo le assenze altrui.

### Multiple Fabrizio Rubino (Tipster, fuori conteggio Core) — non chiudibili ora

Mancano le gambe delle due multiple (quota 5,00 e quota 2,00, €5 di stake
ciascuna): non fornite dall'utente finora, e non leggibili da questa sessione
(nessun accesso a Supabase/app). **Non vengono indovinate.** Restano "da
verificare" finche' l'utente non condivide gli eventi che le compongono, o
il loro esito diretto (vinta/persa/rimborsata).

### Multipla J4F (Roma-Atalanta Under 2.5 + Hull-Aston Villa 2 + Villarreal 1, quota Codere 5.47)

Non e' confermato se sia stata effettivamente giocata. Se giocata, l'esito e
l'eventuale quota reale ottenuta vanno chiesti all'utente: se fornita una
quota reale (anche su book diverso da Sportium), va comunque registrata in
`analytics/sportium_gap.py` come J4F, per regola gia' concordata.

### Nota per l'app (Supabase)

Il riepilogo giornaliero (`riepilogoGiornaliero()`, aggiunto oggi in
`index.html`) mostra i numeri reali solo se le giocate vengono registrate
nell'app stessa. Questa sessione non ha e non deve avere credenziali
Supabase: gli esiti di oggi (Forest-Tottenham vinta, Fulham persa, + le
multiple di Fabrizio quando note) vanno inseriti a mano nell'app perche' la
cassa e il riepilogo di giornata riflettano i numeri veri.

### Conclusione della giornata

- **Core**: 1 vinta, 1 persa, netto +€0,50 su €10. Campione di 2 pick:
  descrittivo, non un pattern (manuale sez. 17A/18) — nessuna modifica al
  metodo o alle soglie viene proposta sulla base di oggi.
- **Lezione da annotare, non da regola**: una tesi costruita solo su
  "assenze offensive dell'avversario" ha retto per una partita (Forest-Tottenham)
  e non per l'altra (Fulham-Palace, dove il Palace ha segnato comunque 3 gol
  senza i suoi titolari). Da tenere d'occhio nelle prossime analisi: pesare
  anche la tenuta difensiva della squadra su cui si punta, non solo le
  assenze di chi si affronta.
- **Tipster (Fabrizio) e J4F**: esiti ancora aperti, in attesa di dati
  dall'utente — non entrano comunque nel conteggio Core in nessun caso.
- Il modello Poisson resta bocciato dal backtest di stamattina
  (`analytics/RISULTATI.md`): il fatto che una delle due pick di oggi abbia
  vinto non lo riabilita, dato che la decisione non si e' basata sul suo
  numero di value.
