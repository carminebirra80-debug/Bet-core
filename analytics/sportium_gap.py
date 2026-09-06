#!/usr/bin/env python3
"""
Registro dello scarto fra il prezzo realmente pagato su Sportium, quello di
Codere (IT) letto live, e il consenso de-vigato di tutto il mercato.

    # forma automatica: Codere e consenso vengono letti da The Odds API
    export ODDS_API_KEY="..."
    python3 analytics/sportium_gap.py add 2026-09-06 SP1 "Valencia-Barcelona" 2 1.26

    # forma manuale, se l'API non e' disponibile o la partita e' gia' finita
    python3 analytics/sportium_gap.py add 2026-09-06 SP1 "Valencia-Barcelona" 2 1.26 \\
        --codere 1.27 --consenso 73.6

    python3 analytics/sportium_gap.py report

Perche' esiste. Sportium, dove le giocate vengono fatte davvero, restituisce
ERR_CONNECTION_RESET a un browser reale e HTTP 403 a curl: non e' leggibile in
automatico, ne' oggi ne' probabilmente mai (blocco deliberato, verificato il 5
settembre 2026 - vedi docs/README.md). Questo script non risolve il problema
di lettura: lo aggira, costruendo giocata dopo giocata un dataset di quanto e
in che direzione il prezzo pagato si scosta dal mercato.

**La domanda che questo registro deve rispondere** (posta da Carmine il 6
settembre 2026): Codere, essendo anch'esso un book italiano, ha quote
praticamente identiche a Sportium? Se la risposta e' si', Codere diventa il
sostituto leggibile di Sportium e l'edge si puo' calcolare sul prezzo vero
PRIMA di giocare, invece di scoprirlo dopo.

Il primo punto misurato e' incoraggiante ma non basta: Valencia-Barcelona
esito 2, Sportium 1.26 contro Codere 1.27, cioe' -0,79%. Era pero' il caso
piu' facile - un favorito corto, dove tutti i quaranta book si stringono fra
1,22 e 1,30. La prova vera sta sulle quote alte e sui mercati gol, dove i
libri divergono davvero: lo stesso giorno, su Under 2.5, Codere stava a -9,9%
dal consenso mentre altri erano a -1%.

Serve quindi accumulare coppie su mercati diversi, non solo sui favoriti.

Il file dei dati (claude/sportium-quotes.csv) e' un registro, non una cache:
va accumulato nel tempo, mai troncato o rigenerato.
"""

from __future__ import annotations

import csv
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

LOG_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "claude", "sportium-quotes.csv",
)

# Le prime cinque colonne identificano la giocata, le altre sono le misure.
# quota_citata/fonte_citata restano per le righe registrate prima del 6
# settembre 2026, quando si confrontava con un book terzo qualsiasi invece
# che con Codere e il consenso.
FIELDS = ["registrato_il", "data_match", "campionato", "partita", "mercato",
          "quota_sportium", "quota_codere", "consenso_pct",
          "scarto_vs_codere", "scarto_vs_consenso",
          "quota_citata", "fonte_citata", "scarto_pct"]

FIELDS_VECCHI = ["registrato_il", "data_match", "campionato", "partita", "mercato",
                 "quota_citata", "fonte_citata", "quota_sportium", "scarto_pct"]

# Sotto questo numero di coppie, qualunque media e' descrittiva soltanto -
# stessa soglia usata nel resto del progetto (manuale BET CORE, sez. 17A).
MIN_DESCRITTIVO = 20

# Mercati riconosciuti, con il nome usato da The Odds API.
MERCATI = {"1": "casa", "X": "Draw", "2": "ospite",
           "Over2.5": "Over", "Under2.5": "Under"}


def _now() -> str:
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("Europe/Rome")).isoformat(timespec="seconds")
    except Exception:
        return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _scarto(quota: float, riferimento: float) -> float | None:
    """Di quanto `quota` e' sopra (+) o sotto (-) `riferimento`, in percentuale."""
    if not quota or not riferimento:
        return None
    return round((quota / riferimento - 1.0) * 100, 2)


def _migra_se_serve() -> None:
    """
    Porta un file con l'intestazione vecchia a quella nuova, conservando le
    righe gia' registrate. Non e' una rigenerazione: i dati esistenti finiscono
    nelle colonne che avevano gia', le nuove restano vuote per quelle righe.
    """
    if not os.path.exists(LOG_PATH):
        return
    with open(LOG_PATH, encoding="utf-8") as fh:
        righe = list(csv.DictReader(fh))
        intestazione = list(righe[0].keys()) if righe else None
    if intestazione is None or intestazione == FIELDS:
        return
    with open(LOG_PATH, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=FIELDS)
        w.writeheader()
        for r in righe:
            w.writerow({k: r.get(k, "") for k in FIELDS})
    print(f"  [registro migrato al nuovo formato, {len(righe)} righe conservate]",
          file=sys.stderr)


def quote_di_mercato(div: str, partita: str, mercato: str):
    """
    Legge da The Odds API il prezzo di Codere (IT) e il consenso de-vigato per
    una selezione. Restituisce (quota_codere, consenso_pct) - entrambi None se
    la partita non e' fra quelle in calendario o manca la chiave.
    """
    try:
        import live_odds as L
        import value as V
        import teams as T
    except Exception:
        return None, None

    if mercato not in MERCATI:
        raise SystemExit(f"mercato non riconosciuto: {mercato} "
                         f"(ammessi: {', '.join(MERCATI)})")

    sep = "-" if "-" in partita else "–"
    if sep not in partita:
        raise SystemExit('la partita va scritta come "Casa-Ospite"')
    casa, ospite = [x.strip() for x in partita.split(sep, 1)]

    try:
        partite = L.fetch_odds(div, markets="h2h,totals")
    except SystemExit:
        raise
    except Exception as errore:
        print(f"  [quote live non disponibili: {errore}]", file=sys.stderr)
        return None, None

    nomi = [m["home_team"] for m in partite] + [m["away_team"] for m in partite]
    c_ris = T.resolve(casa, nomi) or casa
    o_ris = T.resolve(ospite, nomi) or ospite
    match = next((m for m in partite
                  if m["home_team"] == c_ris and m["away_team"] == o_ris), None)
    if not match:
        print(f"  [partita non trovata fra le {len(partite)} di {div}]", file=sys.stderr)
        return None, None

    # A partita iniziata l'API restituisce quote LIVE, che non hanno nulla a
    # che vedere con il prezzo pre-match pagato su Sportium: confrontarle
    # produce numeri plausibili e completamente sbagliati (misurato: consenso
    # 97,2% e scarto +22% su Valencia-Barcelona a gara in corso). Meglio
    # rifiutare e chiedere i valori a mano.
    inizio = datetime.fromisoformat(match["commence_time"].replace("Z", "+00:00"))
    if inizio <= datetime.now(timezone.utc):
        print(f"  [{casa}-{ospite} e' gia' iniziata: le quote ora sono live, non",
              file=sys.stderr)
        print("   confrontabili con un prezzo pre-match. Passa --codere= e --consenso=",
              file=sys.stderr)
        print("   con i valori rilevati prima del calcio d'inizio.]", file=sys.stderr)
        return None, None

    etichetta = MERCATI[mercato]
    bersaglio = (match["home_team"] if etichetta == "casa"
                 else match["away_team"] if etichetta == "ospite" else etichetta)
    chiave = "totals" if mercato.startswith(("Over", "Under")) else "h2h"

    codere = None
    for bk in match.get("bookmakers", []):
        for mk in bk.get("markets", []):
            if mk["key"] != chiave:
                continue
            for o in mk["outcomes"]:
                if chiave == "totals" and o.get("point") != 2.5:
                    continue
                if o["name"] == bersaglio and bk["title"] == "Codere (IT)":
                    codere = o["price"]

    # A mercato sospeso (partita iniziata, o esito gia' deciso) alcuni libri
    # espongono 1.00, che non e' una quota: va scartata, altrimenti il
    # de-vigging esplode o restituisce un consenso senza senso.
    def valide(d: dict) -> bool:
        return all(isinstance(v, (int, float)) and v > 1 for v in d.values())

    consenso = None
    for bk in match.get("bookmakers", []):
        if chiave == "h2h":
            o = {x["name"]: x["price"] for mk in bk["markets"] if mk["key"] == "h2h"
                 for x in mk["outcomes"]}
            d = {"1": o.get(match["home_team"]), "X": o.get("Draw"),
                 "2": o.get(match["away_team"])}
            if valide(d):
                consenso = V.devig(d)[mercato]
                break
        else:
            for mk in bk.get("markets", []):
                if mk["key"] != "totals":
                    continue
                o = {x["name"]: x["price"] for x in mk["outcomes"] if x.get("point") == 2.5}
                if len(o) == 2 and valide(o):
                    consenso = V.devig({"Over2.5": o["Over"], "Under2.5": o["Under"]})[mercato]
                    break
            if consenso:
                break
    if codere is not None and codere <= 1:
        codere = None  # mercato sospeso da Codere: nessun confronto possibile
    return codere, consenso


def add(data_match: str, campionato: str, partita: str, mercato: str,
        quota_sportium: float, quota_codere: float | None = None,
        consenso_pct: float | None = None,
        quota_citata: float | None = None, fonte_citata: str = "") -> dict:
    _migra_se_serve()

    # La quota equa del consenso e' 100/probabilita': e' contro quella che si
    # misura quanto il book trattiene.
    equa = (100.0 / consenso_pct) if consenso_pct else None
    row = {
        "registrato_il": _now(), "data_match": data_match, "campionato": campionato,
        "partita": partita, "mercato": mercato,
        "quota_sportium": quota_sportium,
        "quota_codere": quota_codere if quota_codere else "",
        "consenso_pct": consenso_pct if consenso_pct else "",
        "scarto_vs_codere": _scarto(quota_sportium, quota_codere) if quota_codere else "",
        "scarto_vs_consenso": _scarto(quota_sportium, equa) if equa else "",
        "quota_citata": quota_citata if quota_citata else "",
        "fonte_citata": fonte_citata,
        "scarto_pct": _scarto(quota_sportium, quota_citata) if quota_citata else "",
    }
    nuovo = not os.path.exists(LOG_PATH)
    os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
    with open(LOG_PATH, "a", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=FIELDS)
        if nuovo:
            w.writeheader()
        w.writerow(row)
    return row


def load() -> list[dict]:
    if not os.path.exists(LOG_PATH):
        return []
    with open(LOG_PATH, encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def _f(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def report() -> None:
    rows = load()
    print(f"\n=== Prezzo Sportium vs Codere e vs mercato — {len(rows)} giocate ===\n")
    if not rows:
        print("  Nessuna giocata ancora registrata.\n")
        return

    for r in rows:
        qs, qc = _f(r.get("quota_sportium")), _f(r.get("quota_codere"))
        sc, ss = _f(r.get("scarto_vs_codere")), _f(r.get("scarto_vs_consenso"))
        pezzi = [f"  {r['data_match']}  {r['partita'][:28]:28s} {r['mercato']:9s}",
                 f"sportium {qs:5.2f}" if qs else "sportium   ?  "]
        pezzi.append(f"codere {qc:5.2f} ({sc:+5.2f}%)" if qc else "codere    —          ")
        pezzi.append(f"vs mercato {ss:+6.2f}%" if ss is not None else "vs mercato    —")
        if not qc and _f(r.get("quota_citata")):
            pezzi.append(f"[vecchio formato: citata {_f(r['quota_citata']):.2f} "
                         f"{r.get('fonte_citata','')}]")
        print("  ".join(pezzi))

    coppie = [_f(r.get("scarto_vs_codere")) for r in rows]
    coppie = [x for x in coppie if x is not None]
    mercato = [_f(r.get("scarto_vs_consenso")) for r in rows]
    mercato = [x for x in mercato if x is not None]

    print()
    # Prima di dire che Codere sostituisce Sportium servono abbastanza
    # confronti E su famiglie di mercato diverse: sui favoriti corti tutti i
    # book si somigliano, quindi dieci conferme sull'1X2 di una big non
    # dimostrerebbero niente sui mercati gol.
    MIN_EQUIVALENZA = 8
    if coppie:
        media = sum(coppie) / len(coppie)
        entro1 = sum(1 for x in coppie if abs(x) <= 1.0)
        famiglie = {("gol" if r["mercato"].startswith(("Over", "Under", "Goal", "No"))
                     else "esito")
                    for r in rows if _f(r.get("scarto_vs_codere")) is not None}
        print(f"  Sportium vs Codere: scarto medio {media:+.2f}% su {len(coppie)} confronti")
        print(f"    {entro1}/{len(coppie)} entro l'1%, famiglie coperte: {', '.join(sorted(famiglie))}")
        if len(coppie) < MIN_EQUIVALENZA or len(famiglie) < 2:
            print(f"    Ancora troppo poco per concludere: servono almeno "
                  f"{MIN_EQUIVALENZA} confronti")
            print("    su entrambe le famiglie (esito e gol).")
        elif entro1 == len(coppie):
            print("    Equivalenza CONFERMATA: Codere e' un sostituto affidabile di")
            print("    Sportium, l'edge si puo' calcolare prima di giocare.")
        else:
            print(f"    Equivalenza NON confermata: {len(coppie)-entro1} confronti oltre l'1%.")
    else:
        print("  Nessun confronto con Codere ancora registrato.")

    if mercato:
        media = sum(mercato) / len(mercato)
        sotto = sum(1 for x in mercato if x < 0)
        print(f"\n  Sportium vs consenso di mercato: {media:+.2f}% medio "
              f"({sotto}/{len(mercato)} volte sotto)")
        if media < -4:
            print(f"    Uno svantaggio di partenza di {abs(media):.1f} punti: per giocare")
            print("    con edge >=5% servirebbe un errore di mercato molto piu' grande.")

    if len(rows) < MIN_DESCRITTIVO:
        print(f"\n  Campione < {MIN_DESCRITTIVO}: descrittivo soltanto (manuale sez. 17A).")
        print("  Servono soprattutto quote alte e mercati gol, dove i book divergono:")
        print("  sui favoriti corti si somigliano tutti e il confronto dice poco.\n")
    else:
        print(f"\n  Campione >= {MIN_DESCRITTIVO}: la media comincia ad avere senso.\n")


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 1
    cmd = argv[1]

    if cmd == "report":
        report()
        return 0

    if cmd != "add":
        print(f"comando sconosciuto: {cmd}")
        return 1

    args = [a for a in argv[2:] if not a.startswith("--")]
    opt = {}
    for a in argv[2:]:
        if a.startswith("--") and "=" in a:
            k, v = a[2:].split("=", 1)
            opt[k] = v
    if len(args) != 5:
        print('uso: sportium_gap.py add <data> <div> "<Casa-Ospite>" <mercato> '
              "<quota_sportium> [--codere=Q] [--consenso=PCT] [--citata=Q --fonte=NOME]")
        print(f"     mercati ammessi: {', '.join(MERCATI)}")
        return 1

    data_match, div, partita, mercato, qs = args
    qs = float(qs)
    codere = float(opt["codere"]) if "codere" in opt else None
    consenso = float(opt["consenso"]) if "consenso" in opt else None

    if codere is None or consenso is None:
        letto_c, letto_m = quote_di_mercato(div, partita, mercato)
        codere = codere if codere is not None else letto_c
        consenso = consenso if consenso is not None else letto_m

    row = add(data_match, div, partita, mercato, qs, codere, consenso,
              float(opt["citata"]) if "citata" in opt else None, opt.get("fonte", ""))
    print(f"  registrato: sportium {qs:.2f}", end="")
    if codere:
        print(f" | codere {codere:.2f} ({row['scarto_vs_codere']:+.2f}%)", end="")
    if consenso:
        print(f" | consenso {consenso:.1f}% -> scarto {row['scarto_vs_consenso']:+.2f}%", end="")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
