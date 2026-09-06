#!/usr/bin/env python3
"""
Quote realmente live via The Odds API (the-odds-api.com — occhio ai trattini:
esiste un sito impostore, theoddsapi.com senza trattini, non affiliato).

    export ODDS_API_KEY="..."          # mai scritta in un file, solo env var
    python3 analytics/live_odds.py E0 "Nott'm Forest" Tottenham
    python3 analytics/live_odds.py I1 Inter Napoli --markets h2h,totals

Perche' esiste: il 5 settembre 2026 i controlli T-60 e T-25 di oggi hanno
scoperto che le fonti raggiungibili in automatico (agimeg.it, sportsgambler)
restituivano quote vecchie di 2-3 giorni, non live - vedi
claude/log-value-bets.md. Questo modulo risolve quel buco specifico: dati
realmente freschi (nell'ordine dei minuti), con oltre 40 bookmaker per
partita nei campionati principali.

Cosa NON risolve: Sportium non e' fra i bookmaker coperti (nessun
aggregatore lo copre - vedi docs/README.md). Marathon Bet e Betfair invece
sì, e Betfair e' anche nel pannello storico di football-data.co.uk, quindi
per quei due libri il confronto live/storico torna a essere coerente.

Costo: ogni chiamata consuma quota (piano gratuito: 500 richieste/mese).
Una chiamata per campionato/giornata costa poche unita' (4 per il test di
oggi, 18 partite EPL con 2 mercati); non chiamare in loop, la cache locale
tiene il risultato per qualche minuto.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.request
import urllib.parse
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import value as V

BASE = "https://api.the-odds-api.com/v4"
CACHE_DIR = os.environ.get("BETCORE_CACHE", os.path.expanduser("~/.cache/betcore"))
CACHE_TTL = 300  # 5 minuti: abbastanza per non ricomprare la stessa chiamata

# Stessi codici campionato usati in analytics/sources.py, mappati sulla
# chiave sport di The Odds API.
SPORT_KEY = {
    "E0": "soccer_epl", "E1": "soccer_efl_champ", "E2": "soccer_england_league1",
    "SC0": "soccer_spl",
    "D1": "soccer_germany_bundesliga", "D2": "soccer_germany_bundesliga2",
    "I1": "soccer_italy_serie_a", "I2": "soccer_italy_serie_b",
    "SP1": "soccer_spain_la_liga", "SP2": "soccer_spain_segunda_division",
    "F1": "soccer_france_ligue_one", "F2": "soccer_france_ligue_two",
    "N1": "soccer_netherlands_eredivisie", "B1": "soccer_belgium_first_div",
    "P1": "soccer_portugal_primeira_liga", "T1": "soccer_turkey_super_league",
    "G1": "soccer_greece_super_league",
}

# Libri che contano davvero per questo progetto: quelli gia' citati oggi
# (Marathon Bet) e quelli nel pannello storico di football-data.co.uk
# (Betfair/Betfair Sportsbook), cosi' live e storico restano confrontabili.
# "Codere (IT)" aggiunto il 6 settembre 2026: e' l'unico book ADM italiano
# coperto (verificato: Sportium, Snai, Eurobet, Lottomatica, Sisal, Goldbet
# NON compaiono), con aggiornamenti live veri (0 minuti nei test) - vedi
# docs/README.md.
LIBRI_PRIORITARI = {"Marathon Bet", "Betfair", "Betfair Sportsbook", "Pinnacle", "William Hill", "Codere (IT)"}


def _api_key() -> str:
    key = os.environ.get("ODDS_API_KEY")
    if not key:
        raise SystemExit(
            "manca ODDS_API_KEY nell'ambiente. Non va mai scritta in un file:\n"
            '  export ODDS_API_KEY="..."   (solo per questa sessione di shell)'
        )
    return key


def fetch_odds(div: str, regions: str = "eu,uk", markets: str = "h2h,totals") -> list[dict]:
    """Quote live per un intero campionato. Usa la cache se recente."""
    sport = SPORT_KEY.get(div)
    if not sport:
        raise SystemExit(f"campionato non mappato: {div} (disponibili: {', '.join(SPORT_KEY)})")

    os.makedirs(CACHE_DIR, exist_ok=True)
    cache_path = os.path.join(CACHE_DIR, f"live_{div}_{markets.replace(',', '-')}.json")
    if os.path.exists(cache_path) and (time.time() - os.path.getmtime(cache_path)) < CACHE_TTL:
        with open(cache_path, encoding="utf-8") as fh:
            return json.load(fh)

    params = urllib.parse.urlencode({
        "apiKey": _api_key(), "regions": regions, "markets": markets, "oddsFormat": "decimal",
    })
    url = f"{BASE}/sports/{sport}/odds/?{params}"
    with urllib.request.urlopen(url, timeout=20) as resp:
        remaining = resp.headers.get("x-requests-remaining")
        data = json.loads(resp.read().decode("utf-8"))
    if isinstance(data, dict) and "message" in data:
        raise SystemExit(f"errore API: {data['message']}")

    with open(cache_path, "w", encoding="utf-8") as fh:
        json.dump(data, fh)
    if remaining is not None:
        print(f"  [quota residua sul piano: {remaining} richieste]", file=sys.stderr)
    return data


def find_match(matches: list[dict], home: str, away: str) -> dict | None:
    """Filtra per squadra, tollerante su maiuscole/minuscole e sottostringa."""
    home_l, away_l = home.lower(), away.lower()
    for m in matches:
        h, a = m.get("home_team", "").lower(), m.get("away_team", "").lower()
        if (home_l in h or h in home_l) and (away_l in a or a in away_l):
            return m
    return None


def _age(iso_ts: str) -> str:
    then = datetime.fromisoformat(iso_ts.replace("Z", "+00:00"))
    secs = (datetime.now(timezone.utc) - then).total_seconds()
    if secs < 90:
        return f"{int(secs)}s fa"
    return f"{int(secs // 60)} min fa"


def report(match: dict) -> None:
    print(f"\n{match['home_team']} vs {match['away_team']}  "
          f"({match.get('commence_time', '?')})\n")

    h2h_book, tot_book = {}, {}
    for bk in match.get("bookmakers", []):
        nome, quando = bk["title"], bk["last_update"]
        priorita = " ★" if nome in LIBRI_PRIORITARI else ""
        for mk in bk.get("markets", []):
            if mk["key"] == "h2h":
                odds = {o["name"]: o["price"] for o in mk["outcomes"]}
                print(f"  {nome:22s}{priorita:2s} 1X2  "
                      f"{match['home_team']}={odds.get(match['home_team'],'?')}  "
                      f"X={odds.get('Draw','?')}  "
                      f"{match['away_team']}={odds.get(match['away_team'],'?')}  "
                      f"(agg. {_age(quando)})")
                if nome not in h2h_book:
                    h2h_book[nome] = odds
            elif mk["key"] == "totals":
                # La linea offerta varia per libro e per partita (1.5, 2.0,
                # 2.5...): si riporta quella reale invece di scartare tutto
                # quando nessuno offre esattamente 2.5.
                punti = {o.get("point") for o in mk["outcomes"]}
                linea = min(punti, key=lambda p: abs(p - 2.5)) if punti else None
                for o in mk["outcomes"]:
                    if o.get("point") == linea:
                        tot_book.setdefault(nome, {"linea": linea})[o["name"]] = o["price"]

    if h2h_book:
        best = {"1": max(o.get(match["home_team"], 0) for o in h2h_book.values()),
                "X": max(o.get("Draw", 0) for o in h2h_book.values()),
                "2": max(o.get(match["away_team"], 0) for o in h2h_book.values())}
        # consenso de-vigato sul libro con il vettore piu' completo
        for nome, odds in h2h_book.items():
            full = {"1": odds.get(match["home_team"]), "X": odds.get("Draw"),
                     "2": odds.get(match["away_team"])}
            if all(full.values()):
                fair = V.devig(full)
                print(f"\n  consenso de-vigato ({nome}): "
                      f"1={fair['1']:.1f}%  X={fair['X']:.1f}%  2={fair['2']:.1f}%")
                break
        print(f"  migliore quota per esito: 1={best['1']:.2f}  X={best['X']:.2f}  2={best['2']:.2f}")

    if tot_book:
        print()
        for nome, o in list(tot_book.items())[:5]:
            if "Over" in o and "Under" in o:
                print(f"  {nome:22s} linea {o['linea']:g}  Over={o['Over']}  Under={o['Under']}")


def main(argv: list[str]) -> int:
    if len(argv) < 4:
        print(__doc__)
        return 1
    div, home, away = argv[1], argv[2], argv[3]
    markets = "h2h,totals"
    for a in argv[4:]:
        if a.startswith("--markets="):
            markets = a.split("=", 1)[1]

    matches = fetch_odds(div, markets=markets)
    match = find_match(matches, home, away)
    if not match:
        print(f"  partita non trovata fra le {len(matches)} in calendario per {div}.")
        print("  Squadre disponibili:")
        for m in matches:
            print(f"    {m['home_team']} vs {m['away_team']}")
        return 1

    report(match)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
