# Documentazione di riferimento

## BET CORE — Manuale AI (5 settembre 2026)

`BET_CORE_Manuale_AI_20260905.docx` — specifica metodologica del progetto,
base v3.6 più le precedenze operative. `.txt` è il testo estratto, comodo da
consultare da riga di comando (`grep`, diff fra versioni).

Il manuale è **la specifica**; `analytics/` è un'implementazione parziale di
alcuni suoi pezzi. Dove i due divergono, decide il manuale — tranne dove una
misura empirica lo contraddice, e in quel caso va registrata la misura (il
manuale stesso lo prevede: ogni soglia è un'ipotesi finché non validata).

## Dove il codice implementa il manuale

| Sezione del manuale | Implementazione |
|---|---|
| §4 Market baseline, rimozione overround | `analytics/value.py` → `devig()`, `margin()` |
| §5 Goal model (Poisson, Dixon-Coles) | `analytics/model.py` → `fit()`, `score_matrix()` con correzione rho |
| §8 Shrinkage `P_adjusted = P_market + λ(P_ind − P_market)` | `analytics/value.py` → `blend()` |
| §9 Raw Edge / Adjusted Edge | `analytics/value.py` → `edge()` |
| §10 SUSPICIOUS VALUE (dati insufficienti → stake 0) | `analytics/analyze.py` → filtro `MIN_SAMPLE` |
| §17 Backtest walk-forward, Brier/Log Loss/CLV | `analytics/backtest.py`, `analytics/calibrate.py` |
| §17A Registro e feedback statistico | `claude/log-value-bets.md` (Supabase non ancora collegato) |
| §7 Uncertainty | `analytics/model.py` → `uncertainty_band()` |
| §2, §13 Blind acquisition e universe lock | `analytics/blind.py` → `freeze()` / `compare()` |
| §2A Quota eseguibile ≠ benchmark ≠ panel max | `analytics/sources.py` → `best*` / `panelmax*` |
| §17 Snapshot immutabili | `snapshots/`, con hash SHA-256 di integrità |

## Misure che il manuale lascia aperte

Il manuale dichiara provvisori λ, pesi e soglie, e chiede di validarli
out-of-sample. Fatto il 5 settembre 2026, risultati completi in
[`../analytics/RISULTATI.md`](../analytics/RISULTATI.md):

- **λ = 0** con il goal model attuale. Il log-loss peggiora in modo monotono
  per qualunque λ > 0, su quattro campionati. Il `P_independent` costruibile
  oggi non ha valore incrementale sul mercato.
- Nessuna combinazione di peso, soglia ed edge produce ROI positivo.
- Coerente con l'avvertenza del manuale stesso: non è dimostrato che esista
  un motore quantitativo addestrato e validato.

## Blind acquisition

`analytics/blind.py` separa il protocollo in due comandi, con un file
immutabile in mezzo:

```
blind.py freeze 2026-09-05 E0 I1      # fase A: nessuna quota letta
blind.py compare snapshots/.../HHMMSS.json   # fase B: si apre il mercato
```

La fase A usa `load_fixtures_blind()`, che le quote non le contiene proprio:
la regola è resa impossibile da violare invece che promessa. Lo snapshot porta
un hash SHA-256 del contenuto, quindi una modifica successiva viene segnalata
in fase B e il confronto è dichiarato non valido.

L'universo è registrato per intero, incluse le partite escluse con il motivo
(§13): senza, guardando solo le selezioni non si distingue un filtro che
funziona da una scelta fatta a posteriori.

`analyze.py` resta come strumento esplorativo rapido, ma dichiara nell'output
che non è blind e non vale come evidenza.

## Limite verificato: Sportium non è raggiungibile

Sportium è il bookmaker reale su cui vengono giocate le pick (vedi
`bookmaker:"Sportium"` in quasi tutte le righe di `claude/log-value-bets.md`
e del registro), ma **non è mai la fonte delle quote che vengono riportate
nelle analisi**. Verificato empiricamente il 5 settembre 2026:

```
curl https://www.sportium.it/                   -> HTTP 403
curl https://www.sportium.it/scommesse/calcio   -> HTTP 403
```

403 anche sulla sola homepage, sia in fetch diretto sia tramite motore di
ricerca (non è indicizzato). Non riprovare ad ogni sessione: è un limite
strutturale del sito verso accessi automatizzati, non un problema di rete
temporaneo.

Il problema è doppio, non solo di accesso live: **Sportium non è nemmeno fra
i bookmaker coperti da football-data.co.uk** (i nomi in `sources.py` sono
B365, BFD/Betfair Sportsbook, BV/BetVictor, BW/Bet365... — nessuna colonna
Sportium), quindi manca anche nello storico usato dal modello. Il prezzo che
`analytics/` riporta come "migliore quota" è sempre di book terzi
(Marathonbet, AdmiralBet, StarVegas, bet365 e simili), mai quello
effettivamente eseguibile su Sportium.

**Conseguenza operativa**: la quota riportata in ogni analisi è indicativa,
non la quota reale a cui si gioca. Prima di piazzare, il prezzo su Sportium
va sempre controllato a mano (screenshot o apertura diretta dell'app);
un `HOLD`/`BET` calcolato su un'altra quota non garantisce che la stessa
convenienza esista su Sportium.

**Verificato anche con un browser reale** (5 settembre 2026): un Chromium
headless vero (playwright-core) restituisce `ERR_CONNECTION_RESET` su
Sportium — bloccato più duramente di curl (che riceve almeno un 403 con
pagina), segno di un blocco deliberato sull'impronta di rete del browser,
non un limite risolvibile cambiando strumento.

**Workflow adottato**: ad ogni controllo T-60/T-25 la quota reale su
Sportium viene chiesta esplicitamente a chi gioca, non stimata. La coppia
(quota citata, quota Sportium) va registrata con
`analytics/sportium_gap.py add <data> <campionato> <partita> <mercato>
<quota_citata> <fonte> <quota_sportium>`, che scrive su
`claude/sportium-quotes.csv` (registro persistente, mai troncato). Con
`analytics/sportium_gap.py report` si vede lo scarto medio accumulato; sotto
20 coppie resta descrittivo (stessa soglia del manuale, sez. 17A), poi ha
senso valutare uno sconto calibrato invece di scoprire lo scarto a sorpresa
ogni volta, come il -6% trovato su Fulham-Crystal Palace il 5 settembre.

## Multipla J4F — solo su richiesta, mai proposta di default

Regola concordata il 5 settembre 2026, dopo aver scartato l'idea di
un'accumulatore automatico costruito con le pick respinte dal filtro.

Il manuale vieta esplicitamente questo pattern (§15): *"Se non c'è un
segnale credibile, dirlo senza costruire una multipla per raggiungere una
quota-obiettivo."* Le "scartate" di un'analisi non sono partite senza tempo
per essere guardate: sono partite dove si è già concluso che non c'è edge, o
che il dato è troppo scarso per saperlo. Impacchettarle insieme non produce
un edge nuovo — il margine del bookmaker si moltiplica ad ogni gamba, quindi
il risultato atteso è peggiore della somma delle parti, non neutro. Restano
inoltre due categorie diverse mischiate insieme: "so che non c'è valore" e
"non lo so ancora", nessuna delle due giustifica una giocata.

**La regola pratica:**
- Non viene mai suggerita insieme alle pick Core, di default, ad ogni analisi.
- Solo su richiesta esplicita ("dammi la J4F" o simile), con le gambe prese
  dalle partite scartate della stessa giornata.
- Etichettata esplicitamente come intrattenimento (nome storico già in uso
  nel registro: "Multipla J4F"), quota indicativa 5-6.
- **Fuori dal conteggio Core**: non entra nel campione con cui si giudica se
  il metodo Core (modello + notizie + Sportium) funziona. Altrimenti, fra
  qualche mese, il win-rate delle pick Core risulterebbe falsato da giocate
  che sapevamo già essere senza valore al momento di proporle.
- Tipicamente giocata su un bookmaker diverso da Sportium: se non rientra nel
  flusso Core, non ha senso nemmeno cercare di allinearne il prezzo con
  `sportium_gap.py` — a meno che venga comunque fornita una quota reale, nel
  qual caso si registra comunque, ma segnalata come J4F nel log.

## Quote realmente live: The Odds API

Risolve il buco specifico trovato ai controlli T-60/T-25 del 5 settembre
2026: le fonti raggiungibili in automatico restituivano quote vecchie di
2-3 giorni, mai davvero live. The Odds API (**the-odds-api.com**, con i
trattini — esiste un sito impostore senza trattini, non affiliato, verificare
sempre l'URL prima di inserire dati di pagamento) da' accesso a quote
realmente fresche (nell'ordine dei minuti) su oltre 40 bookmaker per i
campionati principali, incluso Marathon Bet (gia' citato tutto il giorno via
aggregatori) e Betfair/Betfair Sportsbook (anche nel pannello storico di
football-data.co.uk, quindi live e storico tornano confrontabili per quei
due libri specifici).

Non risolve Sportium: non e' fra i bookmaker coperti, come nessun
aggregatore lo copre (vedi sezione precedente). Il prezzo Sportium reale
resta da chiedere a chi gioca.

```
export ODDS_API_KEY="..."     # mai scritta in un file, solo env var di sessione
python3 analytics/live_odds.py E0 "Nott'm Forest" Tottenham
```

`analytics/live_odds.py` legge la chiave solo da `os.environ`, non la scrive
mai su disco. Cache locale di 5 minuti per non consumare quota inutilmente
(piano gratuito: 500 richieste/mese, una chiamata per campionato ne costa
poche unita').

## Cosa manca rispetto alla specifica

- **P_Elo** (§5): non implementato. Senza un secondo modello davvero
  indipendente, λ > 0 non ha basi.
- **Evidence Ledger** (§2): nessuna struttura per fonte/URL/timestamp/stato
  CONFERMATA-PROBABILE-NON VERIFICATA-CONTRADDETTA.
- **CLV automatico** (§17A): il collegamento fra registro e quote di chiusura
  non è scritto. Copribile solo per 1X2, Over/Under 2.5 e handicap asiatico —
  le altre famiglie di mercato restano N/D, come il manuale ammette.
- **Refresh T−25** (§13A): eseguito a mano tramite promemoria programmati, non
  automatizzato.
