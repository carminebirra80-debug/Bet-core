#!/usr/bin/env python3
"""
Validazione walk-forward del modello contro le quote di chiusura.

    python3 analytics/backtest.py               # Serie A + Premier, 1 stagione
    python3 analytics/backtest.py I1 E0 D1 SP1  # campionati scelti

E' il pezzo che mancava al metodo manuale. Senza questo, "edge del 7%" e'
un'affermazione non verificata: il modello puo' benissimo essere sicuro di se'
e sbagliato. Qui si simula la stagione giornata per giornata, ricostruendo i
rating con le sole partite gia' giocate, e si confrontano le previsioni con
le quote di CHIUSURA, che sono la stima piu' accurata disponibile.

Due misure, che rispondono a due domande diverse:

  LOG-LOSS  quanto sono calibrate le probabilita' del modello rispetto a
            quelle del mercato. Se il modello perde nettamente, non ha senso
            cercare value: sta solo misurando il proprio errore.

  ROI       quanto avrebbe reso una strategia che punta 1 unita' su ogni
            selezione sopra soglia. Un ROI negativo con log-loss vicino a
            quello del mercato significa che il modello e' decente ma non
            abbastanza da battere il margine.
"""

from __future__ import annotations

import math
import sys
from datetime import timedelta

sys.path.insert(0, __file__.rsplit("/", 1)[0])

import model as M
import sources as S
import value as V

# Ricalcolare i rating a ogni singola partita e' inutilmente lento: si
# aggiornano ogni N giorni, che e' anche piu' realistico (si analizza il
# palinsesto una volta a weekend).
REFIT_DAYS = 7

# Minimo di partite in archivio prima di iniziare a scommettere.
MIN_HISTORY = 60


def run(div: str, seasons: int = 3, edge_threshold: float = V.MIN_EDGE) -> dict | None:
    history = S.load_history(div, seasons=seasons)
    if len(history) < MIN_HISTORY * 2:
        return None

    # Si testa sull'ultima porzione di storico, addestrando su quella precedente.
    test = [m for m in history if m.close_odds.get("1")]
    if len(test) < 80:
        return None
    split = max(MIN_HISTORY, len(test) // 3)
    test = test[split:]

    bets = 0
    staked = 0.0
    returned = 0.0
    wins = 0
    model_ll = 0.0
    market_ll = 0.0
    scored = 0

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

        book = {k: m.close_odds[k] for k in ("1", "X", "2") if k in m.close_odds}
        if len(book) < 3:
            continue
        fair = V.devig(book)

        outcome = "1" if m.fthg > m.ftag else ("X" if m.fthg == m.ftag else "2")

        # Calibrazione: log-loss del modello contro quello del mercato.
        p_model = max(central.get(outcome, 0.0), 0.01) / 100.0
        p_market = max(fair.get(outcome, 0.0), 0.01) / 100.0
        model_ll -= math.log(p_model)
        market_ll -= math.log(p_market)
        scored += 1

        # Strategia: punta 1 unita' su ogni esito il cui limite inferiore di
        # stima batte la quota di chiusura media di almeno `edge_threshold`.
        for sel in ("1", "X", "2"):
            odds = m.close_odds.get(sel)
            if not odds:
                continue
            p_floor = M.floor_probability(central, high, low, sel)
            if V.edge(p_floor, odds) < edge_threshold:
                continue
            bets += 1
            staked += 1.0
            if sel == outcome:
                returned += odds
                wins += 1

    if scored == 0:
        return None

    return {
        "div": div,
        "league": S.LEAGUES.get(div, div),
        "matches": scored,
        "model_logloss": round(model_ll / scored, 4),
        "market_logloss": round(market_ll / scored, 4),
        "bets": bets,
        "wins": wins,
        "hit_rate": round(100 * wins / bets, 1) if bets else 0.0,
        "roi": round(100 * (returned - staked) / staked, 2) if staked else 0.0,
        "profit": round(returned - staked, 2),
    }


def main(argv: list[str]) -> int:
    divs = [a.upper() for a in argv[1:]] or ["I1", "E0", "D1", "SP1", "F1"]

    print("\n=== Backtest walk-forward contro le quote di chiusura ===")
    print(f"    soglia edge: {V.MIN_EDGE}%   refit ogni {REFIT_DAYS} giorni\n")
    print(f"  {'Campionato':22s} {'match':>6s} {'LL mod':>8s} {'LL mkt':>8s} "
          f"{'bet':>5s} {'hit%':>6s} {'ROI%':>8s}")
    print("  " + "-" * 68)

    totals = {"bets": 0, "profit": 0.0, "staked": 0.0}
    for div in divs:
        res = run(div)
        if not res:
            print(f"  {S.LEAGUES.get(div, div):22s} {'dati insufficienti':>40s}")
            continue
        flag = "  <-- modello meglio del mercato" if res["model_logloss"] < res["market_logloss"] else ""
        print(f"  {res['league']:22s} {res['matches']:6d} {res['model_logloss']:8.4f} "
              f"{res['market_logloss']:8.4f} {res['bets']:5d} {res['hit_rate']:6.1f} "
              f"{res['roi']:+8.2f}{flag}")
        totals["bets"] += res["bets"]
        totals["profit"] += res["profit"]
        totals["staked"] += res["bets"]

    if totals["staked"]:
        roi = 100 * totals["profit"] / totals["staked"]
        print("  " + "-" * 68)
        print(f"  {'TOTALE':22s} {'':6s} {'':8s} {'':8s} {totals['bets']:5d} "
              f"{'':6s} {roi:+8.2f}")

    print("""
  Come leggere il risultato:
    - LL modello vicino o inferiore a LL mercato: le probabilita' sono
      calibrate, ha senso cercare value.
    - LL modello molto piu' alto: il modello e' peggio del mercato e ogni
      "edge" che segnala e' probabilmente il suo errore, non un'occasione.
    - ROI positivo su molte scommesse: strategia validata. Su poche
      scommesse (<50) il dato non e' significativo, e' fortuna.
""")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
