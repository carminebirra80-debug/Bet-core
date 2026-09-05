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
- Nottingham Forest-Tottenham (Premier League, 16:00) | NO GOL | 2.05 (Marathonbet / AdmiralBet / StarVegas) | Value +11.9% | ★★ | Confidence B | ESITO: da verificare
- Fulham-Crystal Palace (Premier League, 16:00) | 1 (Fulham) | 2.32 (Marathonbet) / 2.30 (AdmiralBet, StarVegas) | Value +7.7% | ★ | Confidence B | ESITO: da verificare

**Doppia opzionale** (fuori banda Raddoppio, entrambe le gambe sopra soglia): 2.05 x 2.32 = 4.76 | ESITO: da verificare

**Alternativa segnalata ma non combinabile** (stessa partita del pick 1, correlata):
- Nottingham Forest-Tottenham | Under 2.5 | 1.83 (Marathonbet / AdmiralBet / StarVegas) | Value +9.1% | ★★ | ESITO: da verificare

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

### Note metodologiche della sessione
- FBref, Understat, FootyStats e WorldFootball non raggiungibili (protezione Cloudflare):
  stime costruite su medie gol segnati/subiti con split casa/trasferta (ultime 10), non su xG puri.
- 3a giornata: campioni stagionali minimi, alcune medie "ultime 10" contengono ancora la
  stagione precedente o serie inferiori per le neopromosse -> bande di stima larghe e uso
  sistematico del limite inferiore.
- Arbitri non designati/non reperiti -> Confidence massima raggiungibile: B.
- Nessun movimento quota osservabile in automatico (OddsPortal e volumi Betfair Exchange
  richiedono JavaScript/login) -> Timing sempre "Monitorare".
- Pattern del giorno: tutti i favoriti corti in value negativo (Bayern, Benfica, Leverkusen,
  Villarreal, Lens). Gli unici edge reali su squadre in crisi offensiva conclamata, dove il
  mercato e' piu' lento ad aggiornarsi rispetto alle assenze.
