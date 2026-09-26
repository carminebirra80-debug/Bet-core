#!/usr/bin/env python3
"""
Registro delle analisi: una riga per ogni partita esaminata a T-60/T-25,
giocata o scartata.

    python3 analytics/analisi_log.py add --data 2026-09-26 --fascia 20:45 \\
        --partita "Inghilterra - Spagna" --campionato UNL \\
        --tipo-notizia assenza_attacco --tesi "Kane fuori, non prezzato" \\
        --mercato 2 --t60 2.20 --t25 2.12 --book-quota 2.17 --book Sportium \\
        --decisione giocata

    python3 analytics/analisi_log.py chiudi --data 2026-09-26 \\
        --partita "Inghilterra - Spagna" --mercato 2 \\
        --chiusura 2.05 --esito vinta --risultato 1-2

    python3 analytics/analisi_log.py report

Perche' esiste (chiesto da Carmine il 26 settembre 2026): il modello Poisson
e' stato bocciato (analytics/RISULTATI.md); cio' che resta da migliorare e'
il metodo delle notizie di formazione. Per sapere quali tipi di notizia
battono davvero il mercato servono dati raccolti uguali a ogni analisi,
ANCHE sulle partite scartate.

La misura principale e' il CLV (closing line value): quota a cui si entra
diviso quota di chiusura, meno 1. Se e' positivo il mercato si e' mosso
nella direzione della tesi DOPO l'ingresso, cioe' avevamo visto prima del
mercato. L'esito di una singola partita e' quasi tutto rumore; il CLV si
legge gia' su 20-30 casi. Per le scartate si misura lo stesso, come "se
avessimo giocato a T-25": serve a capire se scartiamo troppo o troppo poco.

claude/analisi.csv e' un registro: si accumula, non si rigenera.
"""

from __future__ import annotations

import argparse
import csv
import os
import sys
from collections import defaultdict

FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "claude", "analisi.csv")

COLONNE = [
    "data", "fascia", "partita", "campionato", "tipo_notizia", "tesi",
    "mercato", "quota_t60", "quota_t25", "quota_chiusura", "quota_book",
    "book", "decisione", "motivo", "esito", "risultato",
]

TIPI_NOTIZIA = {
    "assenza_attacco", "assenza_difesa", "assenza_portiere", "assenza_centrocampo",
    "turnover", "rientro", "modulo", "motivazione", "nessuna", "altro",
}
DECISIONI = {"giocata", "scartata", "j4f", "osservata"}
ESITI = {"", "vinta", "persa", "rimborsata"}


def _quota(v: str | None) -> float | None:
    if v in (None, ""):
        return None
    q = float(str(v).replace(",", "."))
    if q <= 1:
        raise ValueError(f"quota non valida: {v}")
    return q


def quota_ingresso(r: dict) -> float | None:
    """La quota a cui si e' entrati (o si sarebbe entrati): il book reale se
    c'e', altrimenti l'ultima quota di mercato letta prima del via."""
    for k in ("quota_book", "quota_t25", "quota_t60"):
        q = _quota(r.get(k))
        if q:
            return q
    return None


def clv(r: dict) -> float | None:
    """CLV in percentuale, arrotondato a 2 decimali. None se manca un dato."""
    ingresso, chiusura = quota_ingresso(r), _quota(r.get("quota_chiusura"))
    if not ingresso or not chiusura:
        return None
    return round((ingresso / chiusura - 1) * 100, 2)


def leggi(percorso: str = FILE) -> list[dict]:
    if not os.path.exists(percorso):
        return []
    with open(percorso, newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def scrivi(righe: list[dict], percorso: str = FILE) -> None:
    with open(percorso, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=COLONNE)
        w.writeheader()
        for r in righe:
            w.writerow({k: r.get(k, "") for k in COLONNE})


def valida(r: dict) -> None:
    if r.get("tipo_notizia") not in TIPI_NOTIZIA:
        raise ValueError(f"tipo_notizia '{r.get('tipo_notizia')}' non fra {sorted(TIPI_NOTIZIA)}")
    if r.get("decisione") not in DECISIONI:
        raise ValueError(f"decisione '{r.get('decisione')}' non fra {sorted(DECISIONI)}")
    if r.get("esito", "") not in ESITI:
        raise ValueError(f"esito '{r.get('esito')}' non fra {sorted(ESITI)}")
    if " - " not in r.get("partita", ""):
        raise ValueError("partita nel formato 'Casa - Ospite' (separatore spaziato)")
    for k in ("quota_t60", "quota_t25", "quota_chiusura", "quota_book"):
        _quota(r.get(k))


def aggiungi(r: dict, percorso: str = FILE) -> None:
    valida(r)
    righe = leggi(percorso)
    chiave = (r["data"], r["partita"], r["mercato"])
    if any((x["data"], x["partita"], x["mercato"]) == chiave for x in righe):
        raise ValueError(f"riga gia' presente: {chiave}")
    righe.append(r)
    scrivi(righe, percorso)


def chiudi(data: str, partita: str, mercato: str, chiusura=None, esito=None,
           risultato=None, percorso: str = FILE) -> dict:
    righe = leggi(percorso)
    trovate = [x for x in righe if (x["data"], x["partita"], x["mercato"]) == (data, partita, mercato)]
    if len(trovate) != 1:
        raise ValueError(f"attesa 1 riga per {data} {partita} {mercato}, trovate {len(trovate)}")
    r = trovate[0]
    if chiusura is not None:
        r["quota_chiusura"] = str(chiusura)
    if esito is not None:
        r["esito"] = esito
    if risultato is not None:
        r["risultato"] = risultato
    valida(r)
    scrivi(righe, percorso)
    return r


def riepilogo(righe: list[dict]) -> list[dict]:
    """Per tipo di notizia e decisione: casi, casi con CLV, CLV medio,
    quota di casi che batte la chiusura, esiti noti."""
    gruppi: dict[tuple, list[dict]] = defaultdict(list)
    for r in righe:
        gruppi[(r["tipo_notizia"], r["decisione"])].append(r)
    out = []
    for (tipo, dec), rs in sorted(gruppi.items()):
        valori = [v for v in (clv(r) for r in rs) if v is not None]
        vinte = sum(1 for r in rs if r.get("esito") == "vinta")
        chiuse = sum(1 for r in rs if r.get("esito") in ("vinta", "persa"))
        out.append({
            "tipo_notizia": tipo, "decisione": dec, "casi": len(rs),
            "con_clv": len(valori),
            "clv_medio": round(sum(valori) / len(valori), 2) if valori else None,
            "batte_chiusura": round(100 * sum(1 for v in valori if v > 0) / len(valori)) if valori else None,
            "vinte": vinte, "chiuse": chiuse,
        })
    return out


def _stampa_report(righe: list[dict]) -> None:
    if not righe:
        print("  registro vuoto")
        return
    print(f"  {len(righe)} righe in {os.path.relpath(FILE)}\n")
    print(f"  {'tipo notizia':20s} {'decisione':9s} {'casi':>4s} {'CLV':>4s} {'CLV medio':>9s} {'batte chius.':>12s} {'vinte':>7s}")
    for g in riepilogo(righe):
        cm = f"{g['clv_medio']:+.2f}%" if g["clv_medio"] is not None else "—"
        bc = f"{g['batte_chiusura']}%" if g["batte_chiusura"] is not None else "—"
        print(f"  {g['tipo_notizia']:20s} {g['decisione']:9s} {g['casi']:>4d} {g['con_clv']:>4d} {cm:>9s} {bc:>12s} {g['vinte']:>3d}/{g['chiuse']:<3d}")
    print("\n  Sotto i 20-30 casi con CLV per gruppo i numeri sono indicativi, non conclusivi.")


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="Registro delle analisi (claude/analisi.csv)")
    sub = ap.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("add")
    for k in ("data", "fascia", "partita", "campionato", "mercato"):
        a.add_argument("--" + k, required=True)
    a.add_argument("--tipo-notizia", required=True, choices=sorted(TIPI_NOTIZIA))
    a.add_argument("--tesi", default="")
    a.add_argument("--t60", default="")
    a.add_argument("--t25", default="")
    a.add_argument("--book-quota", default="")
    a.add_argument("--book", default="")
    a.add_argument("--decisione", required=True, choices=sorted(DECISIONI))
    a.add_argument("--motivo", default="")

    c = sub.add_parser("chiudi")
    for k in ("data", "partita", "mercato"):
        c.add_argument("--" + k, required=True)
    c.add_argument("--chiusura")
    c.add_argument("--esito", choices=sorted(ESITI - {""}))
    c.add_argument("--risultato")

    sub.add_parser("report")

    args = ap.parse_args(argv[1:])
    try:
        if args.cmd == "add":
            aggiungi({
                "data": args.data, "fascia": args.fascia, "partita": args.partita,
                "campionato": args.campionato, "tipo_notizia": args.tipo_notizia,
                "tesi": args.tesi, "mercato": args.mercato, "quota_t60": args.t60,
                "quota_t25": args.t25, "quota_chiusura": "", "quota_book": args.book_quota,
                "book": args.book, "decisione": args.decisione, "motivo": args.motivo,
                "esito": "", "risultato": "",
            })
            print("  riga aggiunta")
        elif args.cmd == "chiudi":
            r = chiudi(args.data, args.partita, args.mercato, args.chiusura, args.esito, args.risultato)
            v = clv(r)
            print(f"  aggiornata · CLV {v:+.2f}%" if v is not None else "  aggiornata")
        else:
            _stampa_report(leggi())
    except ValueError as e:
        print(f"  errore: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
