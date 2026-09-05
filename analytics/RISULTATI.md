# Risultati della validazione

Registro di cosa è stato testato e cosa i dati hanno detto. Serve a non
rifare due volte gli stessi test e a non riproporre strategie già falsificate.

Data della validazione: **5 settembre 2026**
Dati: football-data.co.uk, stagioni 2023/24 – 2026/27.

---

## 1. Il modello Poisson non batte il mercato

Backtest walk-forward: i rating vengono ricostruiti ogni 7 giorni usando solo
le partite precedenti, e le probabilità sono confrontate con le **quote di
chiusura** medie di mercato (la stima più accurata disponibile al fischio
d'inizio).

| Campionato | Partite | Log-loss modello | Log-loss mercato | Scommesse | Hit rate | ROI |
|---|---|---|---|---|---|---|
| Serie A | 515 | 1.0132 | **0.9624** | 252 | 13.9% | **−17.84%** |
| Premier League | 515 | 1.0343 | **0.9903** | 248 | 13.3% | **−24.42%** |
| | | | | **500** | | **−21.10%** |

Il log-loss più basso vince. Il mercato vince in entrambi i campionati.

L'hit rate del 13% rivela il meccanismo del fallimento: lo shrinkage verso la
media di lega appiattisce le stime, quindi il modello sottovaluta
sistematicamente i favoriti e sopravvaluta pareggi e outsider. Il risultato è
una strategia che punta quasi solo su quote alte e perde.

## 2. Nessun peso dato al modello migliora le cose

Griglia su peso del modello × soglia di edge × campione minimo, quattro
campionati (`calibrate.py`).

Log-loss al variare del peso dato al modello nella media con il mercato:

| Peso modello | Serie A | Premier | Bundesliga | La Liga |
|---|---|---|---|---|
| **0.00** (mercato puro) | **0.9624** | **0.9903** | **0.9774** | **0.9485** |
| 0.15 | 0.9661 | 0.9929 | 0.9821 | 0.9527 |
| 0.30 | 0.9713 | 0.9971 | 0.9879 | 0.9581 |
| 0.45 | 0.9778 | 1.0026 | 0.9946 | 0.9644 |
| 0.60 | 0.9857 | 1.0094 | 1.0023 | 0.9718 |
| 1.00 (modello puro) | 1.0132 | 1.0343 | 1.0272 | 0.9965 |

**Monotòno in tutti e quattro i campionati**: ogni grammo di peso dato al
modello peggiora la previsione. Non esiste una miscela che funzioni.

Sul ROI: **tutte** le 48 combinazioni testate sono negative, tranne due celle
da 8 e 9 scommesse (rumore). Le combinazioni con un numero significativo di
giocate stanno fra −25% e −42%.

## 3. Nemmeno prendere sempre la quota migliore funziona

Strategia alternativa, indipendente dal modello: puntare l'esito la cui quota
migliore supera di almeno X% il consenso de-vigato. 10 campionati, 3 stagioni.

| Soglia sopra il consenso | Scommesse | ROI |
|---|---|---|
| 0% | 12.305 | **−7.17%** |
| 2% | 6.652 | −11.13% |
| 4% | 3.800 | −12.78% |
| 6% | 2.212 | −15.77% |

Il ROI **peggiora** alzando la soglia: gli esiti su cui i bookmaker divergono
di più sono quelli su cui la media stessa è meno affidabile, tipicamente le
quote alte. Alla soglia 0 si sta di fatto puntando tutto alla quota migliore,
e si perde circa quanto il margine residuo del miglior prezzo.

---

## Conclusione operativa

Il modello **non va usato per generare selezioni**. Va usato per:

1. **Scartare.** Se il modello e il mercato concordano, non c'è niente da
   cercare in quella partita: è il caso più comune e fa risparmiare tempo.
2. **Segnalare dove indagare.** Uno scarto ampio fra modello e mercato è una
   *domanda*, non una selezione: va cercata una ragione concreta (infortunio,
   squalifica, formazione, meteo) che il mercato non abbia ancora prezzato.
   Se la ragione non si trova, si lascia perdere.
3. **Fornire il contesto numerico** — gol attesi, xG, arbitro, consenso
   de-vigato — a un'analisi il cui vero valore aggiunto sta nelle notizie.

Questo è coerente con come sono nate le due selezioni del 5 settembre 2026
(Forest-Tottenham NoGol, Fulham-Palace 1): entrambe da **notizie di
formazione** (Tottenham senza quattro attaccanti, Palace senza Mateta e Sarr),
non dai numeri del modello.

## Cosa non è ancora stato testato

- Mercati gol (Over/Under, Goal/NoGoal) con lo stesso rigore del backtest 1X2.
- Se le selezioni guidate dalle notizie battano il mercato: serve uno storico
  di giocate reali, ed è esattamente ciò per cui esiste `claude/log-value-bets.md`.
- Handicap asiatico, che ha margini più bassi e potrebbe comportarsi diversamente.
