#!/usr/bin/env python3
"""
Registro dello scarto fra le quote citabili (aggregatori/altri book) e il
prezzo reale su Sportium.

    python3 analytics/sportium_gap.py add \\
        2026-09-05 E0 "Fulham-Crystal Palace" "1" 2.32 "Marathonbet" 2.18

    python3 analytics/sportium_gap.py report

Perche' esiste: Sportium (il bookmaker su cui si gioca davvero) restituisce
ERR_CONNECTION_RESET a un browser reale e HTTP 403 a curl - verificato il 5
settembre 2026, vedi docs/README.md. Non e' leggibile in automatico, ne' oggi
ne' probabilmente in futuro (e' un blocco deliberato, non un problema di rete
temporaneo). Nessun aggregatore copre le sue quote.

L'unico modo per conoscere il prezzo vero e' chiederlo a chi gioca, ad ogni
controllo T-60/T-25. Questo script non risolve il problema di lettura - lo
accetta e costruisce invece, giocata dopo giocata, un dataset di quanto e in
che direzione Sportium si scosta dal prezzo citabile. Con abbastanza punti
si potra' applicare uno sconto calibrato invece di scoprire lo scarto a
sorpresa ogni volta, come e' successo il 5 settembre con Fulham-Crystal
Palace (citato 2.32, reale 2.18).

Il file dei dati (claude/sportium-quotes.csv) e' un registro, non un cache:
va accumulato nel tempo, mai troncato o rigenerato.
"""

from __future__ import annotations

import csv
import os
import sys
from datetime import datetime, timezone

LOG_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "claude", "sportium-quotes.csv",
)

FIELDS = ["registrato_il", "data_match", "campionato", "partita", "mercato",
          "quota_citata", "fonte_citata", "quota_sportium", "scarto_pct"]

# Sotto questo numero di coppie, qualunque media e' descrittiva soltanto -
# stessa soglia usata nel resto del progetto (manuale BET CORE, sez. 17A).
MIN_DESCRITTIVO = 20


def _now() -> str:
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("Europe/Rome")).isoformat(timespec="seconds")
    except Exception:
        return datetime.now(timezone.utc).isoformat(timespec="seconds")


def add(data_match: str, campionato: str, partita: str, mercato: str,
        quota_citata: float, fonte_citata: str, quota_sportium: float) -> dict:
    scarto = round((quota_sportium / quota_citata - 1.0) * 100, 2)
    row = {
        "registrato_il": _now(), "data_match": data_match, "campionato": campionato,
        "partita": partita, "mercato": mercato,
        "quota_citata": quota_citata, "fonte_citata": fonte_citata,
        "quota_sportium": quota_sportium, "scarto_pct": scarto,
    }
    new_file = not os.path.exists(LOG_PATH)
    os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
    with open(LOG_PATH, "a", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=FIELDS)
        if new_file:
            writer.writeheader()
        writer.writerow(row)
    return row


def load() -> list[dict]:
    if not os.path.exists(LOG_PATH):
        return []
    with open(LOG_PATH, encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def report() -> None:
    rows = load()
    print(f"\n=== Scarto Sportium vs quota citata — {len(rows)} coppie registrate ===\n")
    if not rows:
        print("  Nessuna coppia ancora registrata.\n")
        return

    for r in rows:
        print(f"  {r['data_match']}  {r['partita']:32s} {r['mercato']:14s} "
              f"citata {float(r['quota_citata']):5.2f} ({r['fonte_citata']})  "
              f"sportium {float(r['quota_sportium']):5.2f}  "
              f"scarto {float(r['scarto_pct']):+6.2f}%")

    scarti = [float(r["scarto_pct"]) for r in rows]
    media = sum(scarti) / len(scarti)
    sotto = sum(1 for s in scarti if s < 0)

    print(f"\n  Scarto medio: {media:+.2f}%  "
          f"({sotto}/{len(scarti)} volte Sportium piu' basso del citato)")

    if len(rows) < MIN_DESCRITTIVO:
        print(f"  Campione < {MIN_DESCRITTIVO}: descrittivo soltanto, non ancora una base")
        print("  per applicare uno sconto calibrato (manuale BET CORE, sez. 17A).\n")
    else:
        print(f"  Campione >= {MIN_DESCRITTIVO}: comincia ad avere senso valutare uno\n"
              "  sconto calibrato sulle quote Sportium, segmentato per mercato.\n")


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 1
    cmd = argv[1]

    if cmd == "add":
        if len(argv) != 9:
            print("uso: sportium_gap.py add <data> <campionato> <partita> <mercato> "
                  "<quota_citata> <fonte> <quota_sportium>")
            return 1
        _, _, data_match, campionato, partita, mercato, qc, fonte, qs = argv
        row = add(data_match, campionato, partita, mercato, float(qc), fonte, float(qs))
        print(f"  registrato: scarto {row['scarto_pct']:+.2f}% "
              f"(citata {qc} {fonte} -> sportium {qs})")
        return 0

    if cmd == "report":
        report()
        return 0

    print(f"comando sconosciuto: {cmd}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
