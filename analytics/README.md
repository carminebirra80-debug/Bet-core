# analytics — dati e modello per l'analisi delle partite

Strumenti in Python puro (nessuna dipendenza esterna, nessuna API key) per
alimentare l'analisi delle scommesse con dati reali invece che con numeri
raccolti a mano dalle anteprime dei siti di pronostici.

**Prima di usare l'output leggi [RISULTATI.md](RISULTATI.md).** In sintesi: il
modello Poisson qui dentro *non batte il mercato* — è stato misurato, non
supposto — e non va usato per generare selezioni. Serve a scartare partite e a
segnalare dove vale la pena indagare a mano.

## Perché esiste

L'analisi manuale si scontrava con tre limiti concreti:

1. **Fonti xG irraggiungibili.** FBref, Understat, FootyStats e WorldFootball
   sono dietro Cloudflare e rispondono 403 agli accessi automatici. Senza xG,
   i gol attesi venivano stimati da medie grezze lette nelle anteprime, con
   bande di incertezza larghissime.
2. **Campioni minuscoli a inizio stagione.** Alla terza giornata una squadra
   ha giocato due partite. Le medie "ultime 10" trovate in giro comprendono la
   stagione precedente, o addirittura una serie inferiore per le neopromosse,
   e producono stime assurde (una neopromossa data al 48% contro il 27% del
   mercato).
3. **Nessuna verifica.** Non c'era modo di sapere se un "edge del 7%" fosse
   valore vero o errore del modello.

## Fonte dei dati

[football-data.co.uk](https://www.football-data.co.uk) — accessibile senza
chiave e senza protezione anti-bot, e dalla stagione 2026/27 pubblica gli xG.

| Cosa | Endpoint | Contenuto |
|---|---|---|
| Partite giocate | `mmz4281/<stagione>/<div>.csv` | risultato, **xG casa/ospite**, tiri, tiri in porta, falli, corner, cartellini, **arbitro**, quote di 8+ bookmaker in apertura e chiusura, over/under 2.5, handicap asiatico |
| Partite future | `fixtures.csv` | data, ora, squadre, **arbitro designato**, quote 1X2 e over/under di 8+ bookmaker con media e massimo |

17 campionati coperti: Premier, Championship, League One, Scozia, Bundesliga
1 e 2, Serie A e B, Liga 1 e 2, Ligue 1 e 2, Eredivisie, Belgio, Portogallo,
Turchia, Grecia.

L'arbitro designato è un dato che l'analisi manuale non riusciva quasi mai a
reperire, e che teneva la Confidence bloccata a B.

I file vengono messi in cache in `~/.cache/betcore` (sovrascrivibile con la
variabile d'ambiente `BETCORE_CACHE`): i risultati per 6 ore, i fixture per 15
minuti, perché le quote si muovono.

## Uso

```bash
# Palinsesto di oggi, tutti i campionati
python3 analytics/analyze.py

# Una data e alcuni campionati
python3 analytics/analyze.py 2026-09-05 I1 E0 D1

# Verifica del modello contro le quote di chiusura
python3 analytics/backtest.py I1 E0

# Ricerca dei parametri migliori sui dati storici
python3 analytics/calibrate.py I1 E0 D1 SP1
```

`analyze.py` stampa, per ogni partita, il consenso di mercato de-vigato
accanto alla stima del modello e allo scarto fra i due, segnalando le partite
in cui il campione è troppo piccolo perché il modello dica qualcosa di sensato.
In fondo elenca gli scarti ampi come **domande da verificare a mano**, non come
selezioni.

## I moduli

| File | Cosa fa |
|---|---|
| `sources.py` | scarico e parsing dei CSV, cache su disco |
| `model.py` | rating attacco/difesa, correzione Dixon-Coles, matrice dei punteggi, banda di incertezza |
| `value.py` | de-vig, edge, rating a stelle, quota combo |
| `analyze.py` | analisi di una giornata |
| `backtest.py` | validazione walk-forward contro le quote di chiusura |
| `calibrate.py` | ricerca su griglia dei parametri |

## Scelte del modello

- **xG dove ci sono, gol dove non ci sono.** Le stagioni precedenti al 2026/27
  non hanno xG e usano i gol reali.
- **Decadimento temporale** con emivita 180 giorni: una partita di maggio pesa
  metà di una di oggi.
- **Shrinkage verso la media di lega**, forte quando le partite sono poche.
  Serve a far dire al modello "non lo so" invece di inventare, ma è anche la
  ragione per cui sottovaluta i favoriti (vedi RISULTATI.md).
- **Correzione Dixon-Coles** sui punteggi bassi (0-0, 1-0, 0-1, 1-1), dove il
  Poisson indipendente sbaglia sistematicamente. Il parametro rho è stimato
  sui dati con ricerca su griglia.
- **Banda di incertezza** a tre scenari invece di un numero secco, con
  ampiezza che cresce al diminuire delle partite disponibili. Il value si
  calcola sempre sul limite inferiore.

## Limiti noti

- Il modello non conosce infortuni, squalifiche, formazioni, motivazioni,
  turnover, meteo. Sono proprio i fattori da cui sono nate le selezioni
  migliori finora, e vanno cercati a mano.
- Le neopromosse non hanno storico nella loro nuova divisione: il modello le
  valuta con i dati della serie inferiore e sbaglia di molto. Il filtro sul
  campione minimo (8 partite pesate) le esclude.
- Il de-vig proporzionale sottostima leggermente i grandi favoriti. Poco
  rilevante, perché su quote sotto 1.20 non si scommette comunque.
- Nessun dato sui volumi scambiati né sul movimento delle quote: richiedono
  JavaScript o login e restano fuori portata.
