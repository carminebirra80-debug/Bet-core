#!/usr/bin/env python3
"""
Protocollo in due fasi: congela, poi confronta.

    python3 analytics/blind.py freeze 2026-09-05 E0 I1
    python3 analytics/blind.py compare snapshots/2026-09-05/143000.json
    python3 analytics/blind.py list

Perche' due fasi separate e non un comando solo. Il manuale BET CORE (§2, §5,
§13) impone di congelare la stima indipendente con un timestamp PRIMA di
vedere quote e consensus, e di non rivederla retroattivamente. La ragione non
e' formale: chi stima una probabilita' avendo gia' sotto gli occhi la quota
aggiusta il numero senza accorgersene, finche' l'edge cercato compare. Il
risultato somiglia a un'analisi ma non e' utilizzabile come evidenza.

Separare i due momenti in due comandi distinti, con un file immutabile in
mezzo, rende la regola verificabile invece che dichiarata. La fase A usa un
caricatore che le quote non le contiene proprio (`load_fixtures_blind`), non
un caricatore che promette di ignorarle.

Lo snapshot porta un hash del proprio contenuto: se qualcuno lo modifica dopo
averlo scritto, il confronto lo segnala.

Universe lock (§13): lo snapshot elenca TUTTE le partite della finestra, sia
quelle analizzate sia quelle escluse con il motivo. Senza, guardando solo le
selezioni non si distingue un filtro che funziona da una scelta fatta a
posteriori.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
from datetime import date, datetime, timedelta, timezone

sys.path.insert(0, __file__.rsplit("/", 1)[0])

import model as M
import sources as S
import value as V

SCHEMA = "betcore.blind.v1"
SNAPSHOT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "snapshots")

# Sotto questo numero di partite pesate il modello non ha basi sufficienti:
# la partita entra nell'universo come esclusa, con il motivo (§10, filtro
# SUSPICIOUS VALUE su dati insufficienti).
MIN_SAMPLE = 8.0

# Mercati congelati in fase A. Le chiavi sono quelle del modello.
FROZEN_MARKETS = ["1", "X", "2", "over2.5", "under2.5", "gg", "ng"]


def _rome_now() -> str:
    """Timestamp ISO con offset. Il manuale chiede Europe/Rome, non UTC fisso."""
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("Europe/Rome")).isoformat(timespec="seconds")
    except Exception:
        return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _digest(payload: dict) -> str:
    body = {k: v for k, v in payload.items() if k != "integrity"}
    raw = json.dumps(body, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return "sha256:" + hashlib.sha256(raw.encode("utf-8")).hexdigest()


# --------------------------------------------------------------- fase A

def freeze(day: date, divs: list[str] | None = None) -> dict:
    """
    Fase A. Calcola la stima indipendente su dati oggettivi e la congela.
    Nessuna quota viene letta in questa funzione.
    """
    fixtures = S.load_fixtures_blind(day=day, divs=divs)
    if not fixtures:
        raise SystemExit(f"Nessuna partita in calendario per il {day:%d/%m/%Y}")

    models: dict[str, M.LeagueModel | None] = {}
    universe: list[dict] = []

    for fx in fixtures:
        entry = {
            "match": f"{fx.home}-{fx.away}",
            "home": fx.home, "away": fx.away,
            "div": fx.div, "league": fx.league,
            "kickoff": fx.kickoff,
            "referee": fx.referee or None,
        }

        if fx.div not in models:
            history = [m for m in S.load_history(fx.div, seasons=3, today=day) if m.day < day]
            models[fx.div] = (M.fit(history, ref_day=day - timedelta(days=1), div=fx.div)
                              if len(history) >= 40 else None)

        lm = models[fx.div]
        if lm is None:
            entry.update(status="esclusa", reason="storico di campionato insufficiente")
            universe.append(entry)
            continue
        if not lm.has(fx.home, fx.away):
            missing = [t for t in (fx.home, fx.away) if t not in lm.attack]
            entry.update(status="esclusa", reason=f"nessuno storico per {', '.join(missing)}")
            universe.append(entry)
            continue

        sample = lm.confidence_matches(fx.home, fx.away)
        if sample < MIN_SAMPLE:
            entry.update(status="esclusa",
                         reason=f"campione insufficiente ({sample:.0f} partite pesate, minimo {MIN_SAMPLE:.0f})")
            universe.append(entry)
            continue

        central, high, low = M.uncertainty_band(lm, fx.home, fx.away)
        lam_h, lam_a = lm.expected_goals(fx.home, fx.away)

        entry.update(
            status="analizzata",
            sample=round(sample, 1),
            lambda_home=round(lam_h, 3), lambda_away=round(lam_a, 3),
            rho=lm.rho,
            xg_share=round(lm.xg_share, 3),
            p_independent={k: central.get(k, 0.0) for k in FROZEN_MARKETS},
            p_floor={k: M.floor_probability(central, high, low, k) for k in FROZEN_MARKETS},
        )
        universe.append(entry)

    snapshot = {
        "schema": SCHEMA,
        "frozen_at": _rome_now(),
        "match_day": day.isoformat(),
        "leagues": sorted({f.div for f in fixtures}) if not divs else sorted(divs),
        "phase": "A - blind acquisition",
        "market_seen": False,
        "consensus_seen": False,
        "model": {
            "goal_model": "Poisson con correzione Dixon-Coles",
            "elo_model": None,
            "half_life_days": M.HALF_LIFE_DAYS,
            "shrinkage_matches": M.SHRINKAGE_MATCHES,
            "min_sample": MIN_SAMPLE,
            "note": "P_independent e' il solo goal model: P_Elo non e' implementato, "
                    "quindi non c'e' ensemble e il disagreement interno non e' misurabile.",
        },
        "universe": universe,
    }
    snapshot["integrity"] = _digest(snapshot)
    return snapshot


def save(snapshot: dict) -> str:
    day = snapshot["match_day"]
    folder = os.path.join(SNAPSHOT_DIR, day)
    os.makedirs(folder, exist_ok=True)
    stamp = snapshot["frozen_at"].replace(":", "").replace("-", "")[9:15] or "000000"
    path = os.path.join(folder, f"{stamp}.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(snapshot, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    return path


# --------------------------------------------------------------- fase B

def compare(path: str) -> dict:
    """
    Fase B. Solo ora si aprono le quote, e si confrontano con una stima che
    non puo' piu' cambiare.
    """
    with open(path, encoding="utf-8") as fh:
        snap = json.load(fh)

    if snap.get("schema") != SCHEMA:
        raise SystemExit(f"schema non riconosciuto: {snap.get('schema')}")
    expected = _digest(snap)
    tampered = expected != snap.get("integrity")

    day = date.fromisoformat(snap["match_day"])
    fixtures = {f"{f.home}-{f.away}": f for f in S.load_fixtures(day=day)}

    rows = []
    for entry in snap["universe"]:
        if entry.get("status") != "analizzata":
            continue
        fx = fixtures.get(entry["match"])
        if not fx:
            rows.append({"match": entry["match"], "error": "partita non piu' nel calendario"})
            continue

        markets = []
        for key, label, book_key, full in (
            ("1", "1", "1", ("1", "X", "2")),
            ("X", "X", "X", ("1", "X", "2")),
            ("2", "2", "2", ("1", "X", "2")),
            ("over2.5", "Over 2.5", "O2.5", ("O2.5", "U2.5")),
            ("under2.5", "Under 2.5", "U2.5", ("O2.5", "U2.5")),
        ):
            book = {k: fx.odds[k] for k in full if k in fx.odds}
            if len(book) < len(full):
                continue
            p_market = V.devig(book).get(book_key)
            if p_market is None:
                continue

            benchmark = book[book_key]
            best = fx.odds.get(f"best{book_key}") or benchmark
            panel_max = fx.odds.get(f"panelmax{book_key}")
            # Un massimo di panel molto sopra la media segnala una quota
            # isolata: book minore, prezzo stantio o errore. Va mostrato come
            # tale, mai usato come prezzo di riferimento.
            outlier = bool(panel_max and panel_max > benchmark * 1.10)

            p_ind = entry["p_independent"].get(key, 0.0)
            p_floor = entry["p_floor"].get(key, 0.0)
            markets.append({
                "market": label,
                "p_independent": p_ind,
                "p_floor": p_floor,
                "p_market": p_market,
                "raw_edge": round(p_ind - p_market, 2),
                "best_odds": best,
                "benchmark_odds": benchmark,
                "panel_max": panel_max,
                "panel_max_outlier": outlier,
                "margin": V.margin(book),
                # P_adjusted con lambda 0: la calibrazione (analytics/RISULTATI.md)
                # mostra che qualunque peso positivo sul modello peggiora la
                # previsione. Resta esplicito per poterlo rimettere in discussione
                # quando esistera' un ensemble validato.
                "p_adjusted": round(V.blend(p_floor, p_market, 0.0), 2),
            })

        rows.append({"match": entry["match"], "league": entry["league"],
                     "kickoff": entry["kickoff"], "referee": entry["referee"],
                     "sample": entry["sample"], "markets": markets})

    return {
        "schema": "betcore.compare.v1",
        "snapshot": os.path.relpath(path),
        "frozen_at": snap["frozen_at"],
        "compared_at": _rome_now(),
        "integrity_ok": not tampered,
        "lambda_used": 0.0,
        "rows": rows,
    }


# --------------------------------------------------------------- interfaccia

def _print_freeze(snap: dict, path: str) -> None:
    analysed = [e for e in snap["universe"] if e["status"] == "analizzata"]
    excluded = [e for e in snap["universe"] if e["status"] != "analizzata"]

    print(f"\n=== FASE A — stima indipendente congelata ===")
    print(f"    giornata {snap['match_day']}   congelata alle {snap['frozen_at']}")
    print(f"    quote lette: NO      consensus letto: NO")
    print(f"    universo: {len(snap['universe'])} partite  "
          f"({len(analysed)} analizzate, {len(excluded)} escluse)\n")

    for e in analysed:
        p = e["p_independent"]
        print(f"  {e['match']:34s} {e['kickoff']:>5s}  arb: {e['referee'] or 'n/d':<12s} "
              f"n={e['sample']:.0f}")
        print(f"      gol attesi {e['lambda_home']:.2f}-{e['lambda_away']:.2f}   "
              f"1 {p['1']:5.1f}%  X {p['X']:5.1f}%  2 {p['2']:5.1f}%  "
              f"O2.5 {p['over2.5']:5.1f}%  GG {p['gg']:5.1f}%")

    if excluded:
        print("\n  --- escluse dall'universo (registrate, non nascoste)")
        for e in excluded:
            print(f"      {e['match']:34s} {e['reason']}")

    print(f"\n  Snapshot: {os.path.relpath(path)}")
    print(f"  {snap['integrity']}")
    print("\n  Da qui in avanti questa stima non va piu' modificata. Per aprire il")
    print("  mercato:  python3 analytics/blind.py compare " + os.path.relpath(path) + "\n")


def _print_compare(res: dict) -> None:
    print(f"\n=== FASE B — confronto con il mercato ===")
    print(f"    stima congelata alle {res['frozen_at']}")
    print(f"    mercato aperto alle  {res['compared_at']}")
    if not res["integrity_ok"]:
        print("\n  !! ATTENZIONE: lo snapshot e' stato modificato dopo il congelamento.")
        print("     Il confronto non e' valido come evidenza.")
    print(f"    lambda applicato: {res['lambda_used']:.2f} "
          f"(P_adjusted = P_market; vedi analytics/RISULTATI.md)\n")

    for row in res["rows"]:
        if "error" in row:
            print(f"  {row['match']:34s} {row['error']}")
            continue
        print(f"  {row['match']:34s} {row['league']:20s} {row['kickoff']:>5s}  "
              f"arb: {row['referee'] or 'n/d'}")
        for m in row["markets"]:
            flag = ""
            if m["panel_max_outlier"]:
                flag = f"  [panel max {m['panel_max']:.2f} anomalo, non eseguibile]"
            print(f"      {m['market']:10s} indip {m['p_independent']:5.1f}%  "
                  f"mercato {m['p_market']:5.1f}%  raw edge {m['raw_edge']:+6.1f}  "
                  f"best {m['best_odds']:5.2f} (bench {m['benchmark_odds']:5.2f}, "
                  f"margine {m['margin']:.1f}%){flag}")
        print()

    print("  Raw Edge e' diagnostico, non autorizza una giocata (manuale §9).")
    print("  Con lambda 0 l'edge operativo e' nullo per costruzione: cio' che")
    print("  resta da fare a mano e' cercare, sugli scarti piu' ampi, una notizia")
    print("  concreta che il mercato non abbia ancora prezzato.\n")


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 1
    cmd = argv[1]

    if cmd == "freeze":
        day, divs = date.today(), []
        for arg in argv[2:]:
            try:
                day = datetime.strptime(arg, "%Y-%m-%d").date()
            except ValueError:
                divs.append(arg.upper())
        snap = freeze(day, divs or None)
        path = save(snap)
        _print_freeze(snap, path)
        return 0

    if cmd == "compare":
        if len(argv) < 3:
            print("indicare il file dello snapshot")
            return 1
        _print_compare(compare(argv[2]))
        return 0

    if cmd == "list":
        if not os.path.isdir(SNAPSHOT_DIR):
            print("nessuno snapshot registrato")
            return 0
        for day in sorted(os.listdir(SNAPSHOT_DIR)):
            for name in sorted(os.listdir(os.path.join(SNAPSHOT_DIR, day))):
                path = os.path.join(SNAPSHOT_DIR, day, name)
                with open(path, encoding="utf-8") as fh:
                    snap = json.load(fh)
                n = sum(1 for e in snap["universe"] if e["status"] == "analizzata")
                print(f"  {snap['frozen_at']}  {snap['match_day']}  "
                      f"{n:2d} partite  {os.path.relpath(path)}")
        return 0

    print(f"comando sconosciuto: {cmd}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
