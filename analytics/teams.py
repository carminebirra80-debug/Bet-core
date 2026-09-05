"""
Riconoscimento delle squadre fra il registro delle giocate e i dati di
football-data.co.uk.

Il problema: nel registro gli eventi sono testo libero scritto in italiano
("Barcellona vs Rayo", "Roma - Lecce", "Bayern Monaco vs Lipsia"), mentre la
fonte dati usa nomi propri e abbreviazioni inglesi ("Barcelona", "Vallecano",
"Bayern Munich", "RB Leipzig", "Nott'm Forest", "M'gladbach").

Tre livelli, dal piu' sicuro al piu' incerto:

1. Tabella di alias esplicita, per i casi dove la traduzione non e' deducibile
   ("Lipsia" -> "RB Leipzig").
2. Confronto normalizzato: senza accenti, senza punteggiatura, senza le sigle
   societarie (FC, AC, SS, CF...), tutto minuscolo.
3. Somiglianza testuale, ma solo sopra una soglia alta e solo se il secondo
   candidato e' nettamente peggiore del primo.

Se nessuno dei tre da' una risposta netta, la funzione restituisce None: e'
preferibile lasciare un dato vuoto piuttosto che abbinarlo alla squadra
sbagliata e falsare le statistiche.
"""

from __future__ import annotations

import difflib
import re
import unicodedata

# Nomi italiani (o comunque diversi) verso il nome usato da
# football-data.co.uk. Solo i casi che la normalizzazione non risolve da sola.
ALIASES: dict[str, str] = {
    # Premier League
    "manchester city": "Man City",
    "manchester united": "Man United",
    "nottingham forest": "Nott'm Forest",
    "nottingham": "Nott'm Forest",
    "wolverhampton": "Wolves",
    "tottenham hotspur": "Tottenham",
    "newcastle united": "Newcastle",
    "west ham united": "West Ham",
    "brighton hove albion": "Brighton",
    "leeds united": "Leeds",
    "leicester city": "Leicester",
    "norwich city": "Norwich",
    "coventry city": "Coventry",
    "hull city": "Hull",
    "stoke city": "Stoke",
    "cardiff city": "Cardiff",
    "swansea city": "Swansea",
    "queens park rangers": "QPR",
    "sheffield united": "Sheffield United",
    "sheffield wednesday": "Sheffield Weds",
    "west bromwich albion": "West Brom",
    "bournemouth": "Bournemouth",
    "afc bournemouth": "Bournemouth",
    # Serie A
    "internazionale": "Inter",
    "inter milano": "Inter",
    "ac milan": "Milan",
    "as roma": "Roma",
    "ssc napoli": "Napoli",
    "hellas verona": "Verona",
    "juventus torino": "Juventus",
    # La Liga
    "barcellona": "Barcelona",
    "siviglia": "Sevilla",
    "atletico madrid": "Ath Madrid",
    "atletico": "Ath Madrid",
    "athletic bilbao": "Ath Bilbao",
    "athletic club": "Ath Bilbao",
    "real sociedad": "Sociedad",
    "rayo vallecano": "Vallecano",
    "rayo": "Vallecano",
    "espanyol": "Espanol",
    "maiorca": "Mallorca",
    "real betis": "Betis",
    "celta vigo": "Celta",
    "deportivo la coruna": "La Coruna",
    "deportivo": "La Coruna",
    "real valladolid": "Valladolid",
    "real oviedo": "Oviedo",
    # Bundesliga
    "bayern monaco": "Bayern Munich",
    "bayern": "Bayern Munich",
    "borussia dortmund": "Dortmund",
    "borussia monchengladbach": "M'gladbach",
    "monchengladbach": "M'gladbach",
    "gladbach": "M'gladbach",
    "lipsia": "RB Leipzig",
    "lipsia rb": "RB Leipzig",
    "leipzig": "RB Leipzig",
    "bayer leverkusen": "Leverkusen",
    "eintracht francoforte": "Ein Frankfurt",
    "eintracht frankfurt": "Ein Frankfurt",
    "francoforte": "Ein Frankfurt",
    "colonia": "FC Koln",
    "koln": "FC Koln",
    "werder brema": "Werder Bremen",
    "brema": "Werder Bremen",
    "stoccarda": "Stuttgart",
    "amburgo": "Hamburg",
    "hamburger sv": "Hamburg",
    "friburgo": "Freiburg",
    "magonza": "Mainz",
    "mainz 05": "Mainz",
    "union berlino": "Union Berlin",
    "augusta": "Augsburg",
    "schalke": "Schalke 04",
    "schalke 04": "Schalke 04",
    "st pauli": "St Pauli",
    # Ligue 1
    "paris saint germain": "Paris SG",
    "psg": "Paris SG",
    "marsiglia": "Marseille",
    "olympique marsiglia": "Marseille",
    "lione": "Lyon",
    "olympique lione": "Lyon",
    "lilla": "Lille",
    "nizza": "Nice",
    "strasburgo": "Strasbourg",
    "tolosa": "Toulouse",
    "saint etienne": "St Etienne",
    # Portogallo, Olanda, Belgio, Turchia, Grecia
    "sporting lisbona": "Sp Lisbon",
    "sporting": "Sp Lisbon",
    "sporting braga": "Sp Braga",
    "braga": "Sp Braga",
    "vitoria guimaraes": "Guimaraes",
    "psv eindhoven": "PSV Eindhoven",
    "az alkmaar": "AZ Alkmaar",
    "anversa": "Antwerp",
    "bruges": "Club Brugge",
    "club bruges": "Club Brugge",
    "gand": "Gent",
    "anderlecht": "Anderlecht",
    "galatasaray": "Galatasaray",
    "fenerbahce": "Fenerbahce",
    "besiktas": "Besiktas",
    "olympiakos": "Olympiakos",
    "panathinaikos": "Panathinaikos",
}

# Sigle societarie da togliere prima del confronto.
NOISE = re.compile(
    r"\b(fc|ac|as|ss|us|cf|sc|sv|tsg|vfb|vfl|rc|ogc|rcd|ud|cd|sd|afc|bsc|"
    r"calcio|club|football|futbol|de|of)\b"
)


def normalize(name: str) -> str:
    """Forma canonica per il confronto: minuscolo, senza accenti ne' sigle."""
    s = unicodedata.normalize("NFKD", (name or "").strip().lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.replace("'", " ").replace("-", " ").replace(".", " ")
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    s = NOISE.sub(" ", s)
    return re.sub(r"\s+", " ", s).strip()


def resolve(name: str, candidates: list[str], cutoff: float = 0.82) -> str | None:
    """
    Trova il nome ufficiale corrispondente fra i `candidates`, o None se non
    c'e' una risposta abbastanza netta.
    """
    if not name or not candidates:
        return None

    norm = normalize(name)
    if not norm:
        return None

    # 1. Alias esplicito.
    alias = ALIASES.get(norm)
    if alias:
        for c in candidates:
            if normalize(c) == normalize(alias):
                return c

    # 2. Confronto normalizzato, esatto o per prefisso univoco.
    lookup: dict[str, list[str]] = {}
    for c in candidates:
        lookup.setdefault(normalize(c), []).append(c)
    if norm in lookup and len(lookup[norm]) == 1:
        return lookup[norm][0]

    starts = [c for c in candidates if normalize(c).startswith(norm) or norm.startswith(normalize(c))]
    if len(starts) == 1:
        return starts[0]

    # 3. Somiglianza, solo se il primo candidato stacca nettamente il secondo.
    keys = list(lookup)
    close = difflib.get_close_matches(norm, keys, n=2, cutoff=cutoff)
    if not close:
        return None
    if len(close) == 2:
        first = difflib.SequenceMatcher(None, norm, close[0]).ratio()
        second = difflib.SequenceMatcher(None, norm, close[1]).ratio()
        if first - second < 0.06:
            return None  # troppo simili fra loro: meglio non indovinare
    matched = lookup[close[0]]
    return matched[0] if len(matched) == 1 else None


SEPARATORS = re.compile(r"\s+(?:vs?\.?|contro|[-–—])\s+", re.IGNORECASE)


def split_event(evento: str) -> tuple[str, str] | None:
    """
    Da "Roma - Lecce" o "Barcellona vs Rayo" alla coppia di squadre.

    Restituisce None se la stringa non contiene un separatore riconoscibile,
    il che capita con le multiple, dove il campo evento descrive la schedina
    invece di una singola partita.
    """
    parts = SEPARATORS.split((evento or "").strip(), maxsplit=1)
    if len(parts) != 2:
        return None
    home, away = parts[0].strip(), parts[1].strip()
    if not home or not away:
        return None
    return home, away
