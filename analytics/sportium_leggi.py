"""Legge le quote pre-match di Sportium con un Chrome vero, a finestra visibile.

Funziona solo dal PC di Carmine: Sportium blocca curl e Chrome headless
(Akamai, 403) ma lascia passare un browser con finestra. Non e' quindi
usabile da una routine schedulata o dal cloud - serve per il controllo
T-60/T-25 mentre si e' davanti al computer.

Uso:
    python analytics/sportium_leggi.py I1 E0 SP1            # campionati scelti
    python analytics/sportium_leggi.py I1 --salva           # anche CSV in snapshots/<oggi>/

Stampa una tabella per partita: 1 X 2 | 1X 12 X2 | U/O 2.5 | G/NG.
Le quote sono quelle eseguibili sul book dove si gioca davvero: e' la
coppia che manca da sempre in `sportium_gap.py`.
"""
import os
import re
import sys
import time
from datetime import datetime

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# codice football-data -> (slug Sportium, id)
CAMPIONATI = {
    "I1": ("calcio-italia-serie-a", 33),
    "I2": ("calcio-italia-serie-b", 34),
    "E0": ("calcio-inghilterra-premier-league", 1),
    "E1": ("calcio-inghilterra-championship", 2),
    "SP1": ("calcio-spagna-liga", 36),
    "SP2": ("calcio-spagna-la-liga-2", 37),
    "D1": ("calcio-germania-bundesliga", 42),
    "D2": ("calcio-germania-2-bundesliga", 41),
    "F1": ("calcio-francia-ligue-1", 4),
    "N1": ("calcio-olanda-eredivisie", 39),
    "P1": ("calcio-portogallo-liga-portugal", 52),
    "T1": ("calcio-turchia-super-lig", 62),
    "B1": ("calcio-belgio-pro-league", 38),
}

COLONNE = ["1", "X", "2", "1X", "12", "X2", "U2.5", "O2.5", "G", "NG"]
_QUOTA = re.compile(r"^\d{1,3}\.\d{2}$")
_ORA = re.compile(r"^\d{2}:\d{2}$")


def _url(div: str) -> str:
    slug, ident = CAMPIONATI[div]
    return f"https://sportium.it/scommesse/prematch/calcio/1/palinsesto/{slug}/{ident}/false"


def analizza_testo(testo: str) -> list[dict]:
    """Estrae le partite dal testo visibile della pagina campionato.

    Il layout e' una sequenza: ora, casa, ospite, poi coppie etichetta/quota
    (1, 2.97, X, 3.75, ...). Le etichette sono fisse, quindi si legge la
    quota che segue ciascuna. Una partita gia' iniziata non ha l'ora e non
    viene presa: le quote live non sono confrontabili col pre-match.
    """
    righe = [r.strip() for r in testo.splitlines() if r.strip()]
    partite = []
    i = 0
    while i < len(righe):
        if _ORA.match(righe[i]) and i + 3 < len(righe) and righe[i + 3] == "1":
            p = {"ora": righe[i], "casa": righe[i + 1], "ospite": righe[i + 2]}
            j = i + 3
            etichetta = None
            while j < len(righe) and not _ORA.match(righe[j]):
                tok = righe[j]
                if tok in ("1", "X", "2", "1X", "12", "X2", "G", "NG", "UNDER", "OVER"):
                    etichetta = {"UNDER": "U2.5", "OVER": "O2.5"}.get(tok, tok)
                elif _QUOTA.match(tok) and etichetta and etichetta not in p:
                    p[etichetta] = float(tok)
                    etichetta = None
                elif tok == "2.5":
                    pass
                elif len(p) > 3 and not _QUOTA.match(tok) and tok not in ("+",) and not tok.startswith("+"):
                    # fine del blocco quote (es. testo di navigazione)
                    if any(k in p for k in COLONNE) and etichetta is None and j > i + 12:
                        break
                j += 1
            if "1" in p and "2" in p:
                partite.append(p)
            i = j
        else:
            i += 1
    return partite


def leggi(divs: list[str]) -> dict[str, list[dict]]:
    from playwright.sync_api import sync_playwright

    risultato = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=False)
        ctx = browser.new_context(locale="it-IT", viewport={"width": 1400, "height": 1000})
        page = ctx.new_page()
        # Il deep link a un campionato viene rediretto sulla home a
        # intermittenza (7 e 20 settembre): l'unico percorso stabile e' quello
        # di un utente - home, pannello "Palinsesto", click sul campionato.
        page.goto("https://sportium.it/scommesse/prematch/calcio/1/palinsesto/home",
                  wait_until="domcontentloaded", timeout=30000)
        time.sleep(5)
        try:
            page.locator("button:has-text('Rifiuta')").first.click(timeout=3000)
        except Exception:
            pass
        for div in divs:
            slug = CAMPIONATI[div][0]
            try:
                link = page.locator(f"a[href*='{slug}']").first
                if not link.is_visible():
                    page.locator("text=Palinsesto").first.click(timeout=4000)
                    time.sleep(2)
                link.click(timeout=8000)
                page.wait_for_url(f"**/{slug}/**", timeout=15000)
            except Exception as e:
                print(f"  [{div}: voce di menu non raggiunta ({type(e).__name__}) su {page.url}]", file=sys.stderr)
                risultato[div] = []
                continue
            time.sleep(5)
            for _ in range(8):
                page.mouse.wheel(0, 1200)
                time.sleep(0.4)
            page.mouse.wheel(0, -20000)
            time.sleep(0.5)
            testo = page.inner_text("body")
            risultato[div] = analizza_testo(testo)
            if not risultato[div]:
                print(f"  [{div}: nessuna partita letta su {page.url}]", file=sys.stderr)
        browser.close()
    return risultato


def formatta(div: str, partite: list[dict]) -> str:
    out = [f"## {div}"]
    testa = f"{'ora':5} {'partita':34} " + " ".join(f"{c:>5}" for c in COLONNE)
    out.append(testa)
    for p in partite:
        nome = f"{p['casa']} - {p['ospite']}"[:34]
        vals = " ".join(f"{p.get(c, ''):>5}" if c in p else f"{'-':>5}" for c in COLONNE)
        out.append(f"{p['ora']:5} {nome:34} {vals}")
    return "\n".join(out)


def main(argv: list[str]) -> int:
    divs = [a for a in argv[1:] if a in CAMPIONATI]
    if not divs:
        print("uso: sportium_leggi.py <I1|E0|SP1|...> [--salva]")
        return 1
    adesso = datetime.now()
    dati = leggi(divs)
    print(f"# Sportium, quote lette il {adesso:%d/%m/%Y alle %H:%M} (ora italiana, Chrome visibile)\n")
    for div in divs:
        print(formatta(div, dati[div]))
        print()
    if "--salva" in argv:
        cartella = os.path.join(RADICE, "snapshots", adesso.strftime("%Y-%m-%d"))
        os.makedirs(cartella, exist_ok=True)
        percorso = os.path.join(cartella, f"sportium_{adesso:%H%M}.csv")
        with open(percorso, "w", encoding="utf-8") as fh:
            fh.write("div,ora,casa,ospite," + ",".join(COLONNE) + "\n")
            for div in divs:
                for p in dati[div]:
                    fh.write(",".join([div, p["ora"], p["casa"], p["ospite"]] + [str(p.get(c, "")) for c in COLONNE]) + "\n")
        print(f"[salvato in {os.path.relpath(percorso, RADICE)}]", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
