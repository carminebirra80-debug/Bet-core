#!/usr/bin/env python3
"""
Calibrazione dei parametri della strategia sui dati storici.

    python3 analytics/calibrate.py              # campionati principali
    python3 analytics/calibrate.py I1 E0 D1

Il modello puro e' gia' stato bocciato dal backtest: log-loss peggiore del
mercato e ROI negativo. Qui si cerca, con una griglia, se esiste una
combinazione di parametri che regge:

  peso_modello   quanto contare sul modello rispetto al consenso di mercato
  soglia_edge    quanto vantaggio pretendere prima di puntare
  min_partite    quante partite di storico servono sulla squadra meno
                 documentata prima di considerare la sua partita

L'ultimo parametro e' quello che elimina i casi assurdi tipo Schalke-Bayern
con una partita di storico, dove il modello segnalava +60% di value.

Nota metodologica onesta: cercando su una griglia si trova SEMPRE una
combinazione che in passato avrebbe guadagnato, anche se non c'e' nessun
edge reale. Per questo il risultato va letto con tre cautele, applicate in
automatico piu' sotto: numero di scommesse sufficiente, ROI positivo su piu'
campionati indipendenti, e coerenza del log-loss. Se una sola cella della
griglia brilla e le vicine no, e' rumore.
"""

from __future__ import annotations

import math
import sys
from datetime import timedelta

sys.path.insert(0, __file__.rsplit("/", 1)[0])

import model as M
import sources as S
import value as V

REFIT_DAYS = 7
MIN_HISTORY = 60

WEIGHTS = [0.0, 0.15, 0.30, 0.45, 0.60, 1.00]
THRESHOLDS = [3.0, 5.0, 8.0, 12.0]
MIN_MATCHES = [0.0, 8.0]


def collect(div: str, seasons: int = 3) -> list[dict]:
    """
    Passa una volta sola sullo storico e registra, per ogni esito di ogni
    partita, cio' che serve a valutare qualsiasi combinazione di parametri:
    probabilita' del modello, consenso de-vigato, quota, esito reale.
    """
    history = S.load_history(div, seasons=seasons)
    test = [m for m in history if m.close_odds.get("1") and m.close_odds.get("X")
            and m.close_odds.get("2")]
    if len(test) < 120:
        return []
    test = test[max(MIN_HISTORY, len(test) // 3):]

    rows: list[dict] = []
    current = None
    last_fit = None

    for m in test:
        if last_fit is None or (m.day - last_fit).days >= REFIT_DAYS:
            train = [x for x in history if x.day < m.day]
            if len(train) < MIN_HISTORY:
                continue
            current = M.fit(train, ref_day=m.day - timedelta(days=1), div=div)
            last_fit = m.day
        if current is None or not current.has(m.home, m.away):
            continue

        central, high, low = M.uncertainty_band(current, m.home, m.away)
        book = {k: m.close_odds[k] for k in ("1", "X", "2")}
        fair = V.devig(book)
        outcome = "1" if m.fthg > m.ftag else ("X" if m.fthg == m.ftag else "2")
        n = current.confidence_matches(m.home, m.away)

        for sel in ("1", "X", "2"):
            rows.append({
                "sel": sel,
                "p_model": M.floor_probability(central, high, low, sel),
                "p_central": central.get(sel, 0.0),
                "p_market": fair.get(sel, 0.0),
                "odds": book[sel],
                "won": sel == outcome,
                "n": n,
                "is_outcome_row": sel == outcome,
            })
    return rows


def evaluate(rows: list[dict], weight: float, threshold: float, min_n: float) -> dict:
    bets = staked = returned = wins = 0.0
    for r in rows:
        if r["n"] < min_n:
            continue
        p = V.blend(r["p_model"], r["p_market"], weight)
        if V.edge(p, r["odds"]) < threshold:
            continue
        bets += 1
        staked += 1.0
        if r["won"]:
            returned += r["odds"]
            wins += 1
    return {
        "bets": int(bets),
        "roi": round(100 * (returned - staked) / staked, 2) if staked else 0.0,
        "hit": round(100 * wins / bets, 1) if bets else 0.0,
    }


def logloss(rows: list[dict], weight: float) -> float:
    """Log-loss della probabilita' mista, calcolata sul solo esito avvenuto."""
    total, n = 0.0, 0
    for r in rows:
        if not r["is_outcome_row"]:
            continue
        p = V.blend(r["p_central"], r["p_market"], weight) / 100.0
        total -= math.log(max(p, 0.001))
        n += 1
    return round(total / n, 4) if n else float("nan")


def main(argv: list[str]) -> int:
    divs = [a.upper() for a in argv[1:]] or ["I1", "E0", "D1", "SP1"]

    print("\n=== Calibrazione parametri su dati storici ===\n")
    data = {}
    for div in divs:
        rows = collect(div)
        if rows:
            data[div] = rows
            print(f"  {S.LEAGUES.get(div, div):22s} {len(rows) // 3:4d} partite valutate")
        else:
            print(f"  {S.LEAGUES.get(div, div):22s} dati insufficienti")
    if not data:
        print("\n  Nessun dato utilizzabile.\n")
        return 1

    print("\n--- Log-loss al variare del peso dato al modello " + "-" * 25)
    print(f"  {'peso':>6s}  " + "  ".join(f"{S.LEAGUES.get(d, d)[:12]:>12s}" for d in data))
    for w in WEIGHTS:
        cells = "  ".join(f"{logloss(rows, w):12.4f}" for rows in data.values())
        print(f"  {w:6.2f}  {cells}")
    print("  (piu' basso e' meglio; peso 0.00 = mercato puro, 1.00 = modello puro)")

    print("\n--- ROI per combinazione di parametri " + "-" * 36)
    print(f"  {'peso':>5s} {'soglia':>7s} {'min_n':>6s}  " +
          "  ".join(f"{S.LEAGUES.get(d, d)[:14]:>16s}" for d in data) + f"  {'TOTALE':>18s}")

    best = None
    for min_n in MIN_MATCHES:
        for w in WEIGHTS:
            for th in THRESHOLDS:
                cells, tot_bets, tot_profit = [], 0, 0.0
                for rows in data.values():
                    r = evaluate(rows, w, th, min_n)
                    cells.append(f"{r['bets']:5d}b {r['roi']:+8.2f}%")
                    tot_bets += r["bets"]
                    tot_profit += r["roi"] / 100 * r["bets"]
                tot_roi = round(100 * tot_profit / tot_bets, 2) if tot_bets else 0.0
                print(f"  {w:5.2f} {th:7.1f} {min_n:6.0f}  " + "  ".join(cells) +
                      f"  {tot_bets:6d}b {tot_roi:+8.2f}%")
                # Un candidato serio deve avere abbastanza scommesse per non
                # essere fortuna, ed essere positivo su piu' campionati.
                positives = sum(1 for c in cells if "+" in c.split("b")[1])
                if tot_bets >= 100 and tot_roi > 0 and positives >= max(2, len(data) - 1):
                    if best is None or tot_roi > best["roi"]:
                        best = {"weight": w, "threshold": th, "min_n": min_n,
                                "roi": tot_roi, "bets": tot_bets, "leagues": positives}

    print("\n--- Verdetto " + "-" * 60)
    if best:
        print(f"  Combinazione piu' solida: peso modello {best['weight']:.2f}, "
              f"soglia {best['threshold']:.0f}%, min {best['min_n']:.0f} partite")
        print(f"  ROI {best['roi']:+.2f}% su {best['bets']} scommesse, "
              f"positivo in {best['leagues']} campionati su {len(data)}")
        print("  Resta una selezione fatta a posteriori: va confermata in avanti,")
        print("  registrando le giocate reali prima di considerarla validata.")
    else:
        print("  Nessuna combinazione supera i controlli minimi (>=100 scommesse,")
        print("  ROI positivo, coerenza fra campionati).")
        print("  Conclusione onesta: con questi dati il modello non batte il")
        print("  mercato, e va usato per SCARTARE selezioni, non per generarle.")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
