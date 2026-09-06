#!/usr/bin/env python3
"""
Preparazione della parte STATICA di una giornata, da eseguire con largo
anticipo sull'analisi vera.

    python3 analytics/prepara_giornata.py                 # oggi
    python3 analytics/prepara_giornata.py 2026-09-06      # una data specifica
    python3 analytics/prepara_giornata.py --divs I1,E0    # solo alcuni campionati

Perche' esiste (concordato con l'utente il 6 settembre 2026): in una giornata
di campionato i dati si dividono in due categorie con scadenze diverse.

  - **Deperibili**: formazioni, infortuni dell'ultima ora, quote. Cambiano fino
    al fischio d'inizio, quindi vanno raccolti il piu' tardi possibile — e'
    esattamente il motivo per cui l'analisi si fa ~90 minuti prima del primo
    kickoff invece che la mattina.
  - **Statici**: medie gol casa/trasferta, forma recente, precedenti, arbitro
    designato. Sono identici alle 9 del mattino e alle 13:30. Aspettare non li
    migliora di un centesimo.

Questo script prepara solo i secondi, cosi' quando arriva il momento
dell'analisi il tempo si spende sulle notizie invece che sullo scraping.

**Nessuna quota viene letta**, deliberatamente: usa `load_fixtures_blind()`,
che le quote non le contiene proprio (fase A del protocollo blind, manuale
sez. 2/13). Guardare il mercato in fase di preparazione ancorerebbe la stima
prima ancora di averla formulata, che e' precisamente cio' che il protocollo
vieta. Le quote si aprono dopo, in fase di analisi.

L'output va su stdout e, con --salva, in snapshots/<data>/dossier.md, cosi'
l'analisi delle ore successive lo rilegge invece di rifare il lavoro.
"""

from __future__ import annotations

import os
import sys
from collections import defaultdict
from datetime import date, datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sources as S

# Quante partite recenti considerare per la forma. 10 e' un compromesso: piu'
# corto e' rumore puro, piu' lungo e a inizio stagione si pesca meta' della
# stagione precedente (rosa diversa).
FINESTRA_FORMA = 10

# Sotto questa soglia una media non e' una media: e' un singolo risultato
# travestito da statistica. Va segnalata, non nascosta dietro due decimali.
# Caso reale del 6 settembre 2026: Frosinone risultava "0.0 gol fatti in casa"
# su UNA partita, un numero che letto di sfuggita sembra un dato di forma.
CAMPIONE_MINIMO = 3

# football-data.co.uk pubblica gli orari in ora del Regno Unito, mentre il
# palinsesto con cui si ragiona (e le sveglie delle analisi) e' in ora
# italiana. La differenza e' di un'ora tutto l'anno: UK e Europa centrale
# cambiano ora nello stesso weekend, quindi GMT/CET e BST/CEST restano sempre
# a un'ora di distanza. Confondere le due sposta ogni kickoff di 60 minuti,
# che su un protocollo costruito su controlli a T-60 e T-25 non e' un
# dettaglio.
ORE_UK_A_ITALIA = 1

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _orario_italiano(kickoff_uk: str) -> str:
    """'14:00' (ora UK, come lo pubblica la fonte) -> '15:00' (ora italiana)."""
    try:
        ore, minuti = kickoff_uk.strip().split(":")
        return f"{(int(ore) + ORE_UK_A_ITALIA) % 24:02d}:{int(minuti):02d}"
    except (ValueError, AttributeError):
        return kickoff_uk or "??:??"


def _split_casa_trasferta(storico: list[S.Match], squadra: str, limite: int = FINESTRA_FORMA):
    """Medie gol fatti/subiti separate per casa e trasferta, ultime `limite` gare."""
    casa = [m for m in storico if m.home == squadra][-limite:]
    fuori = [m for m in storico if m.away == squadra][-limite:]

    def medie(partite, in_casa: bool):
        if not partite:
            return None
        fatti = sum(m.fthg if in_casa else m.ftag for m in partite)
        subiti = sum(m.ftag if in_casa else m.fthg for m in partite)
        return {
            "partite": len(partite),
            "gol_fatti": round(fatti / len(partite), 2),
            "gol_subiti": round(subiti / len(partite), 2),
        }

    return medie(casa, True), medie(fuori, False)


def _forma_recente(storico: list[S.Match], squadra: str, limite: int = 5) -> str:
    """Ultimi risultati come stringa tipo 'VNPVV' (piu' recente a destra)."""
    partite = [m for m in storico if squadra in (m.home, m.away)][-limite:]
    out = []
    for m in partite:
        in_casa = m.home == squadra
        propri = m.fthg if in_casa else m.ftag
        altrui = m.ftag if in_casa else m.fthg
        out.append("V" if propri > altrui else ("N" if propri == altrui else "P"))
    return "".join(out) or "—"


def _xg_recente(storico: list[S.Match], squadra: str, limite: int = FINESTRA_FORMA):
    """Media xG fatti/subiti, solo sulle partite che li hanno davvero."""
    partite = [m for m in storico if squadra in (m.home, m.away) and m.has_xg][-limite:]
    if not partite:
        return None
    fatti = sum(m.hxg if m.home == squadra else m.axg for m in partite)
    subiti = sum(m.axg if m.home == squadra else m.hxg for m in partite)
    return {
        "partite": len(partite),
        "xg_fatti": round(fatti / len(partite), 2),
        "xg_subiti": round(subiti / len(partite), 2),
    }


def dossier(giorno: date, divs: list[str] | None = None) -> str:
    fixtures = S.load_fixtures_blind(day=giorno, divs=divs)
    if not fixtures:
        return (f"# Dossier statico — {giorno.isoformat()}\n\n"
                "Nessuna partita in calendario per questa data nei campionati coperti\n"
                "da football-data.co.uk.\n")

    # Lo storico si carica una volta per campionato, non una per partita.
    storici: dict[str, list[S.Match]] = {}
    for f in fixtures:
        if f.div not in storici:
            storici[f.div] = S.load_history(f.div, seasons=3, today=giorno)

    righe = [
        f"# Dossier statico — {giorno.isoformat()}",
        "",
        f"Generato il {datetime.now().strftime('%Y-%m-%d %H:%M')} da "
        "`analytics/prepara_giornata.py`.",
        "",
        "**Nessuna quota in questo documento**, deliberatamente: e' la parte di "
        "dati che non cambia fra la mattina e il fischio d'inizio. Le quote e le "
        "formazioni si raccolgono in fase di analisi, ~90 minuti prima del primo "
        "kickoff della fascia (protocollo concordato il 6 settembre 2026).",
        "",
        f"Partite in calendario: **{len(fixtures)}** in "
        f"{len(storici)} campionati.",
        "",
        "Tutti gli orari sono **ora italiana** (la fonte li pubblica in ora UK, "
        "un'ora indietro: qui sono gia' convertiti).",
        "",
    ]

    per_lega: dict[str, list[S.Fixture]] = defaultdict(list)
    for f in fixtures:
        per_lega[f.league].append(f)

    for lega in sorted(per_lega):
        righe.append(f"## {lega}")
        righe.append("")
        storico = storici[per_lega[lega][0].div]
        if not storico:
            righe.append("_Storico non disponibile per questo campionato._\n")
            continue

        for f in per_lega[lega]:
            arbitro = f.referee or "non ancora designato"
            righe.append(f"### {_orario_italiano(f.kickoff)} · {f.home} - {f.away}")
            righe.append("")
            righe.append(f"- **Arbitro**: {arbitro}")

            for squadra, ruolo in ((f.home, "casa"), (f.away, "trasferta")):
                casa, fuori = _split_casa_trasferta(storico, squadra)
                rilevante = casa if ruolo == "casa" else fuori
                forma = _forma_recente(storico, squadra)
                xg = _xg_recente(storico, squadra)

                if rilevante and rilevante["partite"] >= CAMPIONE_MINIMO:
                    dettaglio = (f"{rilevante['gol_fatti']} fatti / "
                                 f"{rilevante['gol_subiti']} subiti "
                                 f"(ultime {rilevante['partite']} in {ruolo})")
                elif rilevante:
                    dettaglio = (f"⚠ campione insufficiente: solo "
                                 f"{rilevante['partite']} partita/e in {ruolo} "
                                 f"({rilevante['gol_fatti']} fatti / "
                                 f"{rilevante['gol_subiti']} subiti) — "
                                 f"non usare come media")
                else:
                    dettaglio = f"nessuna partita in {ruolo} nello storico"

                riga = f"- **{squadra}** ({ruolo}): {dettaglio} · forma {forma}"
                if xg:
                    riga += (f" · xG {xg['xg_fatti']} fatti / {xg['xg_subiti']} subiti "
                             f"su {xg['partite']} gare")
                righe.append(riga)

            # Precedenti diretti, in qualunque ordine di campo.
            h2h = [m for m in storico
                   if {m.home, m.away} == {f.home, f.away}][-5:]
            if h2h:
                testo = ", ".join(
                    f"{m.day.strftime('%d/%m/%y')} {m.home} {m.fthg}-{m.ftag} {m.away}"
                    for m in h2h
                )
                righe.append(f"- **Precedenti**: {testo}")
            else:
                righe.append("- **Precedenti**: nessuno nello storico caricato")
            righe.append("")

    righe.extend([
        "---",
        "",
        "## Cosa manca ancora (deperibile, da raccogliere in fase di analisi)",
        "",
        "- Formazioni ufficiali/probabili e infortuni dell'ultima ora.",
        "- Quote live (The Odds API, include Codere (IT); la chiave va esportata",
        "  a mano nella sessione, mai scritta su file).",
        "- Quota reale su Sportium, che non e' leggibile in automatico e va",
        "  chiesta a chi gioca prima di piazzare.",
        "- Meteo, dove rilevante.",
        "",
    ])
    return "\n".join(righe)


def main(argv: list[str]) -> int:
    giorno = date.today()
    divs = None

    for arg in argv[1:]:
        if arg.startswith("--divs="):
            divs = [d.strip() for d in arg.split("=", 1)[1].split(",") if d.strip()]
        elif arg == "--salva":
            continue
        else:
            try:
                giorno = datetime.strptime(arg, "%Y-%m-%d").date()
            except ValueError:
                print(f"data non valida: {arg} (formato atteso: 2026-09-06)")
                return 1

    testo = dossier(giorno, divs)
    print(testo)

    if "--salva" in argv:
        cartella = os.path.join(RADICE, "snapshots", giorno.isoformat())
        os.makedirs(cartella, exist_ok=True)
        percorso = os.path.join(cartella, "dossier.md")
        with open(percorso, "w", encoding="utf-8") as fh:
            fh.write(testo)
        print(f"\n[salvato in {os.path.relpath(percorso, RADICE)}]", file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
