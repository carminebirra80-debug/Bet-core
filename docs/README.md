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
