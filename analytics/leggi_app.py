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


CONSIGLI = os.path.join(RADICE, "claude", "consigli.csv")


def consigli(giorno: str | None = None) -> list[dict]:
    """I pick consigliati durante l'analisi, dal registro strutturato."""
    import csv
    if not os.path.exists(CONSIGLI):
        return []
    with open(CONSIGLI, encoding="utf-8") as fh:
        righe = list(csv.DictReader(fh))
    return [r for r in righe if not giorno or r.get("data") == giorno]


def _dividi(evento: str):
    """
    Le due squadre da una descrizione di partita.

    `teams.split_event` pretende spazi attorno al separatore ("Roma - Lecce"),
    ma nei consigli le partite arrivano dalle API scritte senza
    ("Juventus-AC Milan"). Senza questo ripiego il confronto non abbinava
    nulla e il debrief avrebbe detto che nessun consiglio era stato seguito
    proprio nei giorni in cui erano stati seguiti tutti.
    """
    import teams as T
    coppia = T.split_event(evento or "")
    if coppia:
        return coppia
    parti = (evento or "").split("-", 1)
    if len(parti) == 2 and parti[0].strip() and parti[1].strip():
        return parti[0].strip(), parti[1].strip()
    return None


def _canonico(nome: str) -> str:
    """
    Riduce un nome di squadra a una forma unica, qualunque sia la fonte.

    La tabella degli alias in teams.py traduce dall'italiano al nome usato da
    football-data ("siviglia" -> "Sevilla"), quindi e' direzionale: confrontare
    con `resolve` funziona da un lato e fallisce dall'altro. Portando entrambi
    i nomi alla stessa forma canonica il confronto diventa simmetrico.
    """
    import teams as T
    n = T.normalize(nome)
    return T.normalize(T.ALIASES.get(n, n))


def _stessa_partita(a: str, b: str) -> bool:
    """
    Due descrizioni si riferiscono alla stessa partita?

    I nomi arrivano da fonti diverse — nel registro li scrive Carmine a mano o
    li legge l'OCR della ricevuta, nei consigli li scrivo io dalle API — e non
    coincidono quasi mai alla lettera: "Juventus - Milan" contro
    "Juventus-AC Milan", "Espanyol - Siviglia" contro "Espanyol-Sevilla".
    """
    try:
        pa, pb = _dividi(a), _dividi(b)
    except Exception:
        return (a or "").strip().lower() == (b or "").strip().lower()
    if not pa or not pb:
        return (a or "").strip().lower() == (b or "").strip().lower()
    return all(_canonico(x) == _canonico(y) for x, y in zip(pa, pb))


MERCATI_SINONIMI = {
    "u25": "under25", "under25": "under25", "under2. 5": "under25",
    "o25": "over25", "over25": "over25",
    "u35": "under35", "o35": "over35",
    "ng": "nogoal", "nogoal": "nogoal", "nogol": "nogoal", "gng": "nogoal",
    "gg": "goal", "goal": "goal", "gol": "goal",
    "1x2 1": "1", "1x2 2": "2", "1x2 x": "x",
}


def _mercato(m: str) -> str:
    """
    Forma unica di un mercato, per confrontare quello consigliato con quello
    davvero giocato.

    Serve perche' abbinare solo la partita non basta: Under e Over sulla
    stessa gara sono la scommessa opposta, e contarli come lo stesso consiglio
    attribuirebbe al metodo un risultato che non ha prodotto.
    """
    n = re.sub(r"[^a-z0-9]", "", (m or "").lower())
    return MERCATI_SINONIMI.get(n, n)


def _stesso_mercato(a: str, b: str) -> bool:
    na, nb = _mercato(a), _mercato(b)
    return bool(na) and na == nb


def confronto(dati: dict, giorno: str) -> dict:
    """
    Incrocia cio' che e' stato consigliato con cio' che e' stato giocato.

    E' la domanda che il debrief deve davvero rispondere: non "com'e' andata
    la giornata" ma "come sono andati i consigli, e cosa e' stato giocato al
    di fuori di essi". Tenere insieme le due cose renderebbe il ROI del
    metodo indistinguibile da quello delle giocate fatte per altri motivi.
    """
    proposti = consigli(giorno)
    giocate = [p for p in dati.get("picks", []) if str(p.get("data", "")) == giorno and conta(p)]

    nessuna = [c for c in proposti if c.get("tipo") == "NESSUNA_SELEZIONE"]
    proposti = [c for c in proposti if c.get("tipo") != "NESSUNA_SELEZIONE"]

    abbinati, mercato_diverso, non_giocati = [], [], []
    usate: set[int] = set()
    for c in proposti:
        stessa, ripiego = None, None
        for i, g in enumerate(giocate):
            if i in usate:
                continue
            if not _stessa_partita(c.get("partita", ""), g.get("evento") or ""):
                continue
            if _stesso_mercato(c.get("mercato", ""), g.get("mercato") or ""):
                stessa = (i, g)
                break
            if ripiego is None:
                ripiego = (i, g)
        if stessa:
            usate.add(stessa[0])
            abbinati.append((c, stessa[1]))
        elif ripiego:
            # Stessa partita, scommessa diversa: non e' il consiglio seguito.
            # Tenerlo a parte evita di attribuire al metodo un esito che
            # dipende da un'altra scelta.
            usate.add(ripiego[0])
            mercato_diverso.append((c, ripiego[1]))
        else:
            non_giocati.append(c)

    fuori = [g for i, g in enumerate(giocate) if i not in usate]
    return {"abbinati": abbinati, "mercato_diverso": mercato_diverso,
            "non_giocati": non_giocati, "fuori_consiglio": fuori,
            "nessuna_selezione": nessuna}


def stampa_confronto(c: dict, giorno: str) -> None:
    print(f"\n=== Consigliato contro giocato — {giorno} ===\n")

    if c["nessuna_selezione"]:
        # "Nessuna selezione" riguarda il metodo: puo' convivere con giocate
        # J4F o del tipster, che nascono da un criterio diverso.
        for n in c["nessuna_selezione"]:
            print("  Nessuna selezione di metodo quel giorno.")
            if n.get("nota"):
                print(f"    Motivo: {n['nota']}")
        print()

    if c["abbinati"]:
        print("  CONSIGLIATI E GIOCATI")
        for cons, g in c["abbinati"]:
            prof = _f(g.get("profitto"))
            qc, qr = _f(cons.get("quota_citata")), _f(g.get("quota"))
            scarto = f"{(qr/qc-1)*100:+.1f}%" if qc and qr else "—"
            print(f"    {cons['partita'][:30]:30s} {cons['mercato'][:12]:12s} "
                  f"consigliata {qc:5.2f} -> giocata {qr:5.2f} ({scarto})  "
                  f"stake {_f(g.get('stake')):5.2f}  {(g.get('esito') or '?').upper():9s} {prof:+7.2f}")
        netto = sum(_f(g.get("profitto")) for _, g in c["abbinati"]
                    if g.get("esito") != "aperta")
        giocato = sum(_f(g.get("stake")) for _, g in c["abbinati"])
        roi = (netto / giocato * 100) if giocato else 0
        print(f"    -> netto sui consigli seguiti: {netto:+.2f} su {giocato:.2f} giocati "
              f"(ROI {roi:+.1f}%)\n")

    if c["mercato_diverso"]:
        print("  STESSA PARTITA, SCOMMESSA DIVERSA")
        print("    (fuori dal ROI del metodo: l'esito dipende da un'altra scelta)")
        for cons, g in c["mercato_diverso"]:
            prof = _f(g.get("profitto"))
            print(f"    {cons['partita'][:30]:30s} consigliato {cons['mercato'][:12]:12s} "
                  f"-> giocato {(g.get('mercato') or '?')[:12]:12s} "
                  f"stake {_f(g.get('stake')):5.2f}  "
                  f"{(g.get('esito') or '?').upper():9s} {prof:+7.2f}")
        print()

    if c["non_giocati"]:
        print("  CONSIGLIATI MA NON GIOCATI")
        for cons in c["non_giocati"]:
            print(f"    {cons['partita'][:30]:30s} {cons['mercato'][:12]:12s} "
                  f"quota citata {_f(cons.get('quota_citata')):5.2f}  [{cons.get('tipo','')}]")
        print()

    if c["fuori_consiglio"]:
        print("  GIOCATE FUORI DAI CONSIGLI")
        for g in c["fuori_consiglio"]:
            prof = _f(g.get("profitto"))
            nome = g.get("evento") or g.get("nota") or "senza nome"
            print(f"    {nome[:30]:30s} {(g.get('classificazione') or '?')[:12]:12s} "
                  f"quota {_f(g.get('quota')):5.2f}  stake {_f(g.get('stake')):5.2f}  "
                  f"{(g.get('esito') or '?').upper():9s} {prof:+7.2f}")
        netto = sum(_f(g.get("profitto")) for g in c["fuori_consiglio"]
                    if g.get("esito") != "aperta")
        giocato = sum(_f(g.get("stake")) for g in c["fuori_consiglio"])
        roi = (netto / giocato * 100) if giocato else 0
        print(f"    -> netto fuori dai consigli: {netto:+.2f} su {giocato:.2f} giocati "
              f"(ROI {roi:+.1f}%)\n")

    if not c["abbinati"] and not c["fuori_consiglio"] and not c["mercato_diverso"]:
        print("  Nessuna giocata registrata in questa data.\n")


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
            stampa_confronto(confronto(dati, giorno), giorno)
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
