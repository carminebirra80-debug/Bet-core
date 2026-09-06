#!/usr/bin/env python3
"""
Verifica di analytics/sportium_gap.py.

Perche' esiste: il modulo costruisce il dataset con cui si decide se Codere
puo' sostituire Sportium nel calcolo dell'edge, cioe' una domanda da cui
dipende se il metodo Core ha senso. Un numero sbagliato qui non da' errore,
si accumula in silenzio e falsa la risposta.

Il 6 settembre 2026 e' successo davvero: leggendo le quote a partita gia'
iniziata il modulo ha registrato un consenso del 97,2% e uno scarto di +22%
al posto dei valori pre-match (73,6% e -7,3%). Numeri plausibili e
completamente sbagliati. Il primo test qui sotto copre quel caso.
"""

import csv
import os
import sys
import tempfile
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "analytics"))
import sportium_gap as SG


def test_scarto():
    # Il caso reale misurato: Sportium 1.26 contro Codere 1.27.
    assert SG._scarto(1.26, 1.27) == -0.79, SG._scarto(1.26, 1.27)
    # Contro la quota equa del consenso (100/73.6 = 1.359).
    assert SG._scarto(1.26, 100 / 73.6) == -7.26, SG._scarto(1.26, 100 / 73.6)
    # Prezzo migliore del riferimento: scarto positivo.
    assert SG._scarto(2.10, 2.05) == 2.44
    # Riferimento mancante: nessun numero inventato.
    assert SG._scarto(1.26, None) is None
    assert SG._scarto(1.26, 0) is None


def test_rifiuta_partita_iniziata(monkeypatch_env):
    """A partita iniziata non deve restituire quote: sarebbero live."""
    passato = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat().replace("+00:00", "Z")
    futuro = (datetime.now(timezone.utc) + timedelta(hours=3)).isoformat().replace("+00:00", "Z")

    def finto(div, markets="h2h,totals"):
        return [{
            "home_team": "Valencia", "away_team": "Barcelona",
            "commence_time": monkeypatch_env,
            "bookmakers": [{"title": "Codere (IT)", "markets": [{"key": "h2h", "outcomes": [
                {"name": "Valencia", "price": 11.5}, {"name": "Draw", "price": 6.8},
                {"name": "Barcelona", "price": 1.27}]}]}],
        }]

    import live_odds as L
    originale = L.fetch_odds
    L.fetch_odds = finto
    try:
        return SG.quote_di_mercato("SP1", "Valencia-Barcelona", "2")
    finally:
        L.fetch_odds = originale


def test_scarta_quote_sospese():
    """Una quota 1.00 (mercato sospeso) non deve entrare nel consenso."""
    futuro = (datetime.now(timezone.utc) + timedelta(hours=3)).isoformat().replace("+00:00", "Z")

    def finto(div, markets="h2h,totals"):
        return [{
            "home_team": "Valencia", "away_team": "Barcelona", "commence_time": futuro,
            "bookmakers": [
                # primo libro con il mercato sospeso: va saltato, non usato
                {"title": "LibroSospeso", "markets": [{"key": "h2h", "outcomes": [
                    {"name": "Valencia", "price": 1.0}, {"name": "Draw", "price": 1.0},
                    {"name": "Barcelona", "price": 1.0}]}]},
                {"title": "Codere (IT)", "markets": [{"key": "h2h", "outcomes": [
                    {"name": "Valencia", "price": 11.5}, {"name": "Draw", "price": 6.8},
                    {"name": "Barcelona", "price": 1.27}]}]},
            ],
        }]

    import live_odds as L
    originale = L.fetch_odds
    L.fetch_odds = finto
    try:
        codere, consenso = SG.quote_di_mercato("SP1", "Valencia-Barcelona", "2")
    finally:
        L.fetch_odds = originale
    assert codere == 1.27, codere
    # Il consenso arriva dal libro valido, non da quello sospeso.
    assert consenso is not None and 70 < consenso < 80, consenso


def test_scrittura_e_migrazione():
    """Le righe nel vecchio formato vanno conservate, non perse."""
    with tempfile.TemporaryDirectory() as d:
        percorso = os.path.join(d, "quotes.csv")
        originale = SG.LOG_PATH
        SG.LOG_PATH = percorso
        try:
            with open(percorso, "w", newline="", encoding="utf-8") as fh:
                w = csv.DictWriter(fh, fieldnames=SG.FIELDS_VECCHI)
                w.writeheader()
                w.writerow({"registrato_il": "2026-09-05T16:31:00+02:00",
                            "data_match": "2026-09-05", "campionato": "E0",
                            "partita": "Fulham-Crystal Palace", "mercato": "1",
                            "quota_citata": 2.32, "fonte_citata": "Marathonbet",
                            "quota_sportium": 2.18, "scarto_pct": -6.03})
            SG.add("2026-09-06", "SP1", "Valencia-Barcelona", "2", 1.26,
                   quota_codere=1.27, consenso_pct=73.6)
            righe = SG.load()
        finally:
            SG.LOG_PATH = originale

    assert len(righe) == 2, f"la riga vecchia deve sopravvivere: {len(righe)}"
    vecchia, nuova = righe
    assert vecchia["partita"] == "Fulham-Crystal Palace"
    assert vecchia["quota_sportium"] == "2.18", vecchia["quota_sportium"]
    assert vecchia["quota_citata"] == "2.32", "il dato vecchio non va perso"
    assert nuova["quota_codere"] == "1.27"
    assert float(nuova["scarto_vs_codere"]) == -0.79
    assert float(nuova["scarto_vs_consenso"]) == -7.26


if __name__ == "__main__":
    test_scarto()

    passato = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat().replace("+00:00", "Z")
    assert test_rifiuta_partita_iniziata(passato) == (None, None), \
        "a partita iniziata le quote live non vanno usate"
    futuro = (datetime.now(timezone.utc) + timedelta(hours=3)).isoformat().replace("+00:00", "Z")
    codere, _ = test_rifiuta_partita_iniziata(futuro)
    assert codere == 1.27, f"a partita non iniziata la quota va letta: {codere}"

    test_scarta_quote_sospese()
    test_scrittura_e_migrazione()
    print("sportium-gap: ok")
