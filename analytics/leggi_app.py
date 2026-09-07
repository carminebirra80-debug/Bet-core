#!/usr/bin/env python3
"""
Lettura dei dati reali dell'app (picks, versamenti, impostazioni) da Supabase,
per fare il debrief senza export CSV ne' screenshot.

    python3 analytics/leggi_app.py stato               # verifica il canale
    python3 analytics/leggi_app.py debrief 2026-09-06  # giornata specifica
    python3 analytics/leggi_app.py debrief             # oggi

Come funziona. Le tabelle sono protette da Row Level Security: con la chiave
pubblica che sta in index.html una richiesta non autenticata vede zero righe
(verificato il 7 settembre 2026 su tutte e tre le tabelle). E' corretto che
sia cosi', quella chiave la legge chiunque apra la pagina.

Il canale passa quindi da una funzione di SOLA LETTURA creata nel database
(vedi supabase/migrations/20260907062803_add_debrief_read_function.sql),
protetta da un segreto che vive unicamente nella variabile d'ambiente
BETCORE_DEBRIEF_SECRET. Non nel repository, non in chat: la cronologia di
entrambi e' permanente.

Serve quindi che due passi manuali siano stati fatti una volta:
  1. la migrazione eseguita nell'SQL Editor di Supabase, col segreto scelto
  2. lo stesso segreto impostato come variabile d'ambiente

Il comando `stato` dice esattamente quale dei due manca, invece di lasciare
indovinare davanti a una risposta vuota.
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import date, datetime

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(RADICE, "index.html")
VAR_SEGRETO = "BETCORE_DEBRIEF_SECRET"
FUNZIONE = "debrief_lettura"


class CanaleChiuso(Exception):
    """Il canale di lettura non e' utilizzabile, con la ragione precisa."""


def credenziali_pubbliche(percorso: str = INDEX) -> tuple[str, str]:
    """
    URL e chiave pubblica letti da index.html invece che duplicati qui.

    Sono gia' pubblici — stanno nell'HTML servito a chiunque — e tenerli in
    un posto solo evita che le due copie divergano dopo un cambio di
    progetto Supabase.
    """
    with open(percorso, encoding="utf-8") as fh:
        html = fh.read()
    url = re.search(r'SUPABASE_URL\s*=\s*"([^"]+)"', html)
    key = re.search(r'SUPABASE_KEY\s*=\s*"([^"]+)"', html)
    if not url or not key:
        raise CanaleChiuso(
            "URL o chiave Supabase non trovati in index.html: le variabili "
            "SUPABASE_URL/SUPABASE_KEY sono state rinominate?"
        )
    return url.group(1), key.group(1)


def segreto() -> str:
    valore = os.environ.get(VAR_SEGRETO, "").strip()
    if not valore:
        raise CanaleChiuso(
            f"manca la variabile d'ambiente {VAR_SEGRETO}.\n"
            "  Va impostata nelle impostazioni dell'ambiente Claude Code con lo\n"
            "  stesso segreto usato nella migrazione. Non va incollata in chat\n"
            "  ne' scritta in un file del repository."
        )
    return valore


def leggi() -> dict:
    """Chiama la funzione RPC e restituisce picks/versamenti/impostazioni."""
    url, chiave = credenziali_pubbliche()
    corpo = json.dumps({"segreto": segreto()}).encode("utf-8")
    req = urllib.request.Request(
        f"{url}/rest/v1/rpc/{FUNZIONE}",
        data=corpo,
        headers={"apikey": chiave, "Authorization": f"Bearer {chiave}",
                 "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            dati = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code in (404, 400):
            raise CanaleChiuso(
                f"la funzione {FUNZIONE} non esiste ancora nel database.\n"
                "  Va eseguita la migrazione in supabase/migrations/\n"
                "  20260907062803_add_debrief_read_function.sql dall'SQL Editor\n"
                "  di Supabase, dopo aver sostituito il segnaposto del segreto."
            ) from e
        raise CanaleChiuso(f"errore HTTP {e.code} dal database: {e.reason}") from e
    except Exception as e:
        raise CanaleChiuso(f"database non raggiungibile: {e}") from e

    # La funzione restituisce null quando il segreto non corrisponde: e' il
    # caso da distinguere, altrimenti sembra che il registro sia vuoto.
    if dati is None:
        raise CanaleChiuso(
            f"il segreto in {VAR_SEGRETO} non corrisponde a quello nella funzione.\n"
            "  Controlla di aver usato la stessa stringa nei due posti."
        )
    return dati


def _f(v) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def conta(p: dict) -> bool:
    """Solo le giocate ufficiali non osservate incidono sui soldi veri."""
    if p.get("osservata"):
        return False
    stato = (p.get("stato_core") or "").strip()
    return not stato or stato == "ufficiale"


def giornata(dati: dict, giorno: str) -> dict:
    """Riepilogo di una data: giocate, esiti, netto, divisi per origine."""
    picks = [p for p in dati.get("picks", []) if str(p.get("data", "")) == giorno]
    reali = [p for p in picks if conta(p)]

    per_origine: dict[str, list] = defaultdict(list)
    for p in reali:
        per_origine[(p.get("classificazione") or "?").upper()].append(p)

    return {
        "giorno": giorno,
        "tutte": picks,
        "reali": reali,
        "osservate": [p for p in picks if not conta(p)],
        "per_origine": dict(per_origine),
        "giocato": sum(_f(p.get("stake")) for p in reali),
        "netto": sum(_f(p.get("profitto")) for p in reali if p.get("esito") != "aperta"),
        "aperte": [p for p in reali if p.get("esito") == "aperta"],
    }


def stampa_giornata(g: dict) -> None:
    print(f"\n=== Giocate del {g['giorno']} ===\n")
    if not g["tutte"]:
        print("  Nessuna giocata registrata in questa data.\n")
        return

    for p in sorted(g["reali"], key=lambda x: str(x.get("orario_ingresso") or "")):
        esito = (p.get("esito") or "?").upper()
        prof = _f(p.get("profitto"))
        nome = p.get("evento") or p.get("nota") or "senza nome"
        print(f"  {nome[:38]:38s} {(p.get('mercato') or '')[:16]:16s} "
              f"quota {_f(p.get('quota')):5.2f}  stake {_f(p.get('stake')):5.2f}  "
              f"{esito:9s} {prof:+7.2f}")

    if g["osservate"]:
        print(f"\n  ({len(g['osservate'])} osservate/scartate, fuori dai soldi reali)")

    print(f"\n  Giocato: {g['giocato']:.2f}   Netto: {g['netto']:+.2f}", end="")
    if g["aperte"]:
        print(f"   ({len(g['aperte'])} ancora aperte)")
    else:
        print()

    if g["per_origine"]:
        print("\n  Per origine:")
        for origine, picks in sorted(g["per_origine"].items()):
            chiuse = [p for p in picks if p.get("esito") != "aperta"]
            netto = sum(_f(p.get("profitto")) for p in chiuse)
            vinte = sum(1 for p in chiuse if p.get("esito") == "vinta")
            print(f"    {origine:12s} {len(picks)} giocate, {vinte} vinte, netto {netto:+.2f}")
    print()


def cassa(dati: dict) -> dict:
    """
    Cassa ricostruita: versamenti piu' profitti delle giocate chiuse.

    Le rettifiche contabili non sono versamenti e non entrano nel totale
    versato, altrimenti falserebbero il rendimento sul versato (stessa
    distinzione introdotta nell'app con tipoMovimento).
    """
    versato = sum(_f(v.get("importo")) for v in dati.get("versamenti", [])
                  if (v.get("tipo_movimento") or "versamento") == "versamento")
    rettifiche = sum(_f(v.get("importo")) for v in dati.get("versamenti", [])
                     if (v.get("tipo_movimento") or "") == "rettifica")
    profitto = sum(_f(p.get("profitto")) for p in dati.get("picks", [])
                   if conta(p) and p.get("esito") != "aperta")
    return {"versato": versato, "rettifiche": rettifiche, "profitto": profitto,
            "cassa": versato + rettifiche + profitto}


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 1
    cmd = argv[1]

    try:
        if cmd == "stato":
            url, chiave = credenziali_pubbliche()
            print(f"  progetto: {url}")
            print(f"  chiave pubblica: {chiave[:24]}... (da index.html)")
            dati = leggi()
            c = cassa(dati)
            print(f"  canale APERTO — {len(dati.get('picks', []))} giocate, "
                  f"{len(dati.get('versamenti', []))} movimenti di cassa")
            print(f"  cassa ricostruita: {c['cassa']:.2f} "
                  f"(versato {c['versato']:.2f}, profitti {c['profitto']:+.2f}"
                  + (f", rettifiche {c['rettifiche']:+.2f}" if c["rettifiche"] else "") + ")")
            return 0

        if cmd == "debrief":
            giorno = argv[2] if len(argv) > 2 else date.today().isoformat()
            try:
                datetime.strptime(giorno, "%Y-%m-%d")
            except ValueError:
                print(f"data non valida: {giorno} (formato atteso 2026-09-06)")
                return 1
            dati = leggi()
            stampa_giornata(giornata(dati, giorno))
            c = cassa(dati)
            print(f"  Cassa complessiva: {c['cassa']:.2f}\n")
            return 0

    except CanaleChiuso as e:
        print(f"\n  Canale di lettura non disponibile: {e}\n", file=sys.stderr)
        return 2

    print(f"comando sconosciuto: {cmd}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
