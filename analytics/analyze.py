#!/usr/bin/env python3
"""
Analisi del palinsesto di una data.

    python3 analytics/analyze.py                    # oggi
    python3 analytics/analyze.py 2026-09-05         # data specifica
    python3 analytics/analyze.py 2026-09-05 I1 E0   # solo Serie A e Premier

IMPORTANTE — leggere prima di usare l'output.

Questo strumento NON produce selezioni da giocare. La calibrazione su dati
storici (analytics/calibrate.py, risultati in analytics/RISULTATI.md) mostra
che il modello Poisson ha un log-loss peggiore del mercato in tutti e quattro
i campionati testati, e che ogni combinazione di parametri provata perde
denaro. Vale anche per la strategia alternativa di prendere sempre la quota
migliore: -7.2% su 12.305 scommesse.

Quindi qui il riferimento e' il CONSENSO DI MERCATO DE-VIGATO, che e' la
migliore stima disponibile della probabilita' vera. Il modello serve a una
cosa sola: segnalare dove la sua lettura dei dati si discosta molto da quella
del mercato, cosi' da andare a guardare A MANO se esiste una ragione concreta
(un infortunio, una squalifica, un cambio in panchina, il meteo) che il
mercato non ha ancora prezzato. Se una ragione non si trova, non e' un'occasione:
e' rumore del modello, e si lascia perdere.
"""

from __future__ import annotations

import sys
from datetime import date, datetime, timedelta

sys.path.insert(0, __file__.rsplit("/", 1)[0])

import model as M
import sources as S
import value as V

# Sotto questo numero di partite pesate sulla squadra meno documentata il
# modello non ha abbastanza dati e le sue stime vanno ignorate. E' il filtro
# che elimina i casi tipo Schalke-Bayern con una partita di storico, dove il
# modello segnalava un fantomatico +60% di value.
MIN_SAMPLE = 8.0

# Scarto in punti percentuali fra modello e mercato oltre il quale vale la
# pena andare a controllare le notizie della partita.
DIVERGENCE = 6.0

# (chiave del modello, etichetta, chiave nel book, mercato completo per il
# de-vig, chiave della quota migliore). Le prime due differiscono: il modello
# usa "over2.5", il file delle quote "O2.5".
MARKETS = [
    ("1", "1", "1", ("1", "X", "2"), "max1"),
    ("X", "X", "X", ("1", "X", "2"), "maxX"),
    ("2", "2", "2", ("1", "X", "2"), "max2"),
    ("over2.5", "Over 2.5", "O2.5", ("O2.5", "U2.5"), "maxO2.5"),
    ("under2.5", "Under 2.5", "U2.5", ("O2.5", "U2.5"), "maxU2.5"),
]


def analyse_day(day: date, divs: list[str] | None = None) -> tuple[list[dict], list[str]]:
    fixtures = S.load_fixtures(day=day, divs=divs)
    if not fixtures:
        return [], [f"nessuna partita in calendario per il {day:%d/%m/%Y}"]

    out: list[dict] = []
    notes: list[str] = []
    models: dict[str, M.LeagueModel | None] = {}

    for fx in fixtures:
        if fx.div not in models:
            history = [m for m in S.load_history(fx.div, seasons=3, today=day) if m.day < day]
            if len(history) < 40:
                notes.append(f"{fx.div}: storico insufficiente ({len(history)} partite)")
                models[fx.div] = None
            else:
                models[fx.div] = M.fit(history, ref_day=day - timedelta(days=1), div=fx.div)

        lm = models[fx.div]
        if lm is None or not lm.has(fx.home, fx.away):
            continue

        n = lm.confidence_matches(fx.home, fx.away)
        central, high, low = M.uncertainty_band(lm, fx.home, fx.away)
        lam_h, lam_a = lm.expected_goals(fx.home, fx.away)

        rows = []
        for key, label, book_key, market_keys, max_key in MARKETS:
            book = {k: fx.odds[k] for k in market_keys if k in fx.odds}
            if len(book) < len(market_keys):
                continue
            consensus = V.devig(book).get(book_key)
            if consensus is None:
                continue
            best = fx.odds.get(max_key) or book[book_key]
            rows.append({
                "label": label,
                "consensus": consensus,
                "model": central.get(key, 0.0),
                "floor": M.floor_probability(central, high, low, key),
                "best_odds": best,
                "delta": round(central.get(key, 0.0) - consensus, 1),
            })

        out.append({
            "match": f"{fx.home}-{fx.away}", "league": fx.league,
            "kickoff": fx.kickoff, "referee": fx.referee,
            "lam_h": lam_h, "lam_a": lam_a, "sample": n,
            "reliable": n >= MIN_SAMPLE,
            "rows": rows,
        })

    return out, notes


def main(argv: list[str]) -> int:
    day = date.today()
    divs: list[str] = []
    for arg in argv[1:]:
        try:
            day = datetime.strptime(arg, "%Y-%m-%d").date()
        except ValueError:
            divs.append(arg.upper())

    print(f"\n=== Palinsesto {day:%A %d/%m/%Y} ===")
    print("    Riferimento = consenso di mercato de-vigato. Il modello NON e' un")
    print("    segnale di gioco: serve solo a indicare dove indagare a mano.\n")

    games, notes = analyse_day(day, divs or None)
    if not games:
        print("  Nessuna partita analizzabile.\n")
        for n in notes:
            print(f"  {n}")
        return 0

    flagged = []
    for g in games:
        tag = "" if g["reliable"] else "  [CAMPIONE INSUFFICIENTE - modello ignorato]"
        print(f"  {g['match']:32s} {g['league']:20s} {g['kickoff']:>5s}"
              f"  arb: {g['referee'] or 'n/d':<12s}{tag}")
        print(f"      gol attesi {g['lam_h']:.2f}-{g['lam_a']:.2f}   "
              f"partite in archivio: {g['sample']:.0f}")
        for r in g["rows"]:
            mark = ""
            if g["reliable"] and abs(r["delta"]) >= DIVERGENCE:
                mark = "  <-- da verificare a mano"
                if r["delta"] > 0:
                    flagged.append((g, r))
            print(f"        {r['label']:10s} mercato {r['consensus']:5.1f}%   "
                  f"modello {r['model']:5.1f}%   scarto {r['delta']:+5.1f}   "
                  f"quota {r['best_odds']:5.2f}{mark}")
        print()

    print("--- DA INDAGARE " + "-" * 60)
    if flagged:
        print("  Il modello e' piu' ottimista del mercato su questi esiti. Non sono")
        print("  selezioni: sono domande. Per ciascuna, cercare se esiste una notizia")
        print("  concreta (infortuni, squalifiche, formazioni, meteo) che spieghi lo")
        print("  scarto. Senza una ragione trovata, si scarta.")
        print("  ATTENZIONE al bias noto: lo shrinkage appiattisce le stime, quindi")
        print("  la lista pende strutturalmente verso outsider e pareggi. Che un")
        print("  esito compaia qui non e' di per se' un indizio a suo favore.\n")
        for g, r in sorted(flagged, key=lambda x: -x[1]["delta"])[:12]:
            print(f"  {g['match']:32s} {r['label']:10s} "
                  f"mercato {r['consensus']:5.1f}%  modello {r['model']:5.1f}%  "
                  f"quota {r['best_odds']:5.2f}")
    else:
        print("  Nessuno scarto rilevante: il mercato e il modello sono d'accordo.")

    if notes:
        print("\n--- NOTE " + "-" * 66)
        for n in notes:
            print(f"  {n}")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
