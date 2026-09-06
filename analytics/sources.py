"""
Scarico e parsing dei dati calcistici da football-data.co.uk.

Perche' questa fonte: non richiede API key, non e' dietro Cloudflare (FBref,
Understat, FootyStats e WorldFootball lo sono e restituiscono 403 da ambienti
automatizzati), e dalla stagione 2026/27 pubblica gli xG per partita. Include
inoltre le quote di 8+ bookmaker in apertura e in chiusura, over/under 2.5,
handicap asiatico e l'arbitro designato.

Due endpoint:
  - mmz4281/<stagione>/<div>.csv : partite giocate, una riga per match
  - fixtures.csv                 : partite future di tutti i campionati,
                                   con quote di apertura e arbitro

Tutto viene messo in cache su disco: le partite giocate non cambiano piu', e
in una sessione tipica si rilegge lo stesso file molte volte.
"""

from __future__ import annotations

import csv
import io
import os
import sys
import time
import urllib.request
from dataclasses import dataclass, field
from datetime import date, datetime

BASE = "https://www.football-data.co.uk"
CACHE_DIR = os.environ.get("BETCORE_CACHE", os.path.expanduser("~/.cache/betcore"))

# Time-to-live della cache in secondi. I risultati storici sono immutabili, i
# fixture futuri no: le quote si muovono, quindi vanno riscaricati spesso.
TTL_RESULTS = 6 * 3600
TTL_FIXTURES = 15 * 60

USER_AGENT = "Mozilla/5.0 (compatible; BetCore/1.0)"

# Bookmaker identificabili per nome nel file: sono quelli su cui ha senso
# ragionare come prezzo realmente ottenibile. BFE e' l'exchange Betfair, dove
# la quota e' al lordo della commissione.
NAMED_BOOKS_HOME = ("B365H", "BFDH", "BVH", "BWH", "PPH", "SKBH", "BFEH")
NAMED_BOOKS_DRAW = ("B365D", "BFDD", "BVD", "BWD", "PPD", "SKBD", "BFED")
NAMED_BOOKS_AWAY = ("B365A", "BFDA", "BVA", "BWA", "PPA", "SKBA", "BFEA")

# I 17 campionati coperti dalla fonte, con il nome leggibile.
LEAGUES: dict[str, str] = {
    "E0": "Premier League",
    "E1": "Championship",
    "E2": "League One",
    "SC0": "Scottish Premiership",
    "D1": "Bundesliga",
    "D2": "2. Bundesliga",
    "I1": "Serie A",
    "I2": "Serie B",
    "SP1": "La Liga",
    "SP2": "La Liga 2",
    "F1": "Ligue 1",
    "F2": "Ligue 2",
    "N1": "Eredivisie",
    "B1": "Jupiler Pro League",
    "P1": "Liga Portugal",
    "T1": "Super Lig",
    "G1": "Super League Grecia",
}


def _fetch(url: str, cache_name: str, ttl: int) -> str:
    """
    Scarica url, servendo dalla cache se il file e' piu' recente di ttl.

    Se il download fallisce ma una copia locale esiste, la usa comunque
    dichiarandone l'eta' su stderr invece di far fallire l'intera pipeline.
    Verificato necessario il 6 settembre 2026: football-data.co.uk ha
    risposto 503 su ogni URL (homepage inclusa, con qualunque user-agent),
    cioe' un'interruzione del servizio, non un blocco verso di noi. I
    risultati storici sono immutabili, quindi una copia del giorno prima
    resta valida per tutto tranne le partite giocate nel frattempo: meglio
    lavorare con dati datati e saperlo, che non lavorare affatto.
    """
    os.makedirs(CACHE_DIR, exist_ok=True)
    path = os.path.join(CACHE_DIR, cache_name)

    if os.path.exists(path) and (time.time() - os.path.getmtime(path)) < ttl:
        with open(path, encoding="utf-8-sig", errors="replace") as fh:
            return fh.read()

    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            raw = resp.read().decode("utf-8-sig", errors="replace")
    except Exception as errore:
        if not os.path.exists(path):
            raise
        eta_ore = (time.time() - os.path.getmtime(path)) / 3600
        print(f"  [{cache_name}: download fallito ({errore}), uso la copia "
              f"locale di {eta_ore:.1f} ore fa]", file=sys.stderr)
        with open(path, encoding="utf-8-sig", errors="replace") as fh:
            return fh.read()

    with open(path, "w", encoding="utf-8") as fh:
        fh.write(raw)
    return raw


def _f(row: dict, key: str) -> float | None:
    """Legge un campo numerico, tollerando celle vuote o malformate."""
    val = (row.get(key) or "").strip()
    if not val:
        return None
    try:
        return float(val)
    except ValueError:
        return None


def _parse_date(value: str) -> date | None:
    value = (value or "").strip()
    for fmt in ("%d/%m/%Y", "%d/%m/%y"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None


@dataclass
class Match:
    """Una partita giocata, con il minimo indispensabile per il modello."""

    div: str
    day: date
    home: str
    away: str
    fthg: int
    ftag: int
    hxg: float | None = None
    axg: float | None = None
    hst: float | None = None  # tiri in porta casa
    ast: float | None = None
    referee: str = ""
    # Quote di chiusura medie di mercato: il benchmark piu' onesto contro cui
    # misurare il modello, perche' incorporano tutta l'informazione disponibile
    # al fischio d'inizio.
    close_odds: dict[str, float] = field(default_factory=dict)

    @property
    def target_home(self) -> float:
        """Il valore che il modello cerca di spiegare: xG se c'e', gol altrimenti."""
        return self.hxg if self.hxg is not None else float(self.fthg)

    @property
    def target_away(self) -> float:
        return self.axg if self.axg is not None else float(self.ftag)

    @property
    def has_xg(self) -> bool:
        return self.hxg is not None and self.axg is not None


@dataclass
class Fixture:
    """Una partita futura, con le quote di apertura e l'arbitro designato."""

    div: str
    day: date
    kickoff: str
    home: str
    away: str
    referee: str = ""
    odds: dict[str, float] = field(default_factory=dict)

    @property
    def league(self) -> str:
        return LEAGUES.get(self.div, self.div)


def season_code(year_start: int) -> str:
    """2026 -> '2627', la convenzione della fonte."""
    return f"{year_start % 100:02d}{(year_start + 1) % 100:02d}"


def current_season(today: date | None = None) -> int:
    """Anno di inizio della stagione in corso (le stagioni europee partono a luglio)."""
    today = today or date.today()
    return today.year if today.month >= 7 else today.year - 1


def load_results(div: str, year_start: int) -> list[Match]:
    """Partite giocate di un campionato in una stagione."""
    code = season_code(year_start)
    try:
        raw = _fetch(f"{BASE}/mmz4281/{code}/{div}.csv", f"{code}_{div}.csv", TTL_RESULTS)
    except Exception:
        return []

    out: list[Match] = []
    for row in csv.DictReader(io.StringIO(raw)):
        day = _parse_date(row.get("Date", ""))
        home, away = (row.get("HomeTeam") or "").strip(), (row.get("AwayTeam") or "").strip()
        fthg, ftag = _f(row, "FTHG"), _f(row, "FTAG")
        if not (day and home and away) or fthg is None or ftag is None:
            continue

        close = {}
        for key, field_name in (("1", "AvgCH"), ("X", "AvgCD"), ("2", "AvgCA"),
                                ("O2.5", "AvgC>2.5"), ("U2.5", "AvgC<2.5")):
            # Se mancano le quote di chiusura si ripiega su quelle di apertura.
            val = _f(row, field_name) or _f(row, field_name.replace("AvgC", "Avg"))
            if val:
                close[key] = val

        out.append(Match(
            div=div, day=day, home=home, away=away,
            fthg=int(fthg), ftag=int(ftag),
            hxg=_f(row, "HxG"), axg=_f(row, "AxG"),
            hst=_f(row, "HST"), ast=_f(row, "AST"),
            referee=(row.get("Referee") or "").strip(),
            close_odds=close,
        ))
    return out


def load_history(div: str, seasons: int = 3, today: date | None = None) -> list[Match]:
    """
    Stagione corrente piu' le precedenti, ordinate cronologicamente.

    Serve piu' di una stagione perche' a inizio campionato il campione e'
    minuscolo: alla 3a giornata una squadra ha 2-3 partite, e stimare la sua
    forza solo su quelle produce i numeri assurdi che il mercato giustamente
    ignora. Le stagioni vecchie entrano con peso ridotto (vedi model.py).
    """
    start = current_season(today)
    out: list[Match] = []
    for year in range(start - seasons + 1, start + 1):
        out.extend(load_results(div, year))
    out.sort(key=lambda m: m.day)
    return out


def load_fixtures_blind(day: date | None = None, divs: list[str] | None = None) -> list[Fixture]:
    """
    Partite future SENZA quote: identita' dell'evento e nient'altro.

    Serve alla fase A del protocollo (blind acquisition): la stima
    indipendente va congelata prima di vedere il mercato. Non basta
    l'intenzione di non guardare le quote, perche' se sono presenti nella
    struttura dati prima o poi qualcuno le usa. Qui vengono proprio scartate
    in lettura, cosi' la fase A non ha modo di accedervi.
    """
    return [
        Fixture(div=f.div, day=f.day, kickoff=f.kickoff, home=f.home, away=f.away,
                referee=f.referee, odds={})
        for f in load_fixtures(day=day, divs=divs)
    ]


def load_fixtures(day: date | None = None, divs: list[str] | None = None) -> list[Fixture]:
    """
    Partite future. Con `day` filtra su quella data, con `divs` sui campionati.
    """
    raw = _fetch(f"{BASE}/fixtures.csv", "fixtures.csv", TTL_FIXTURES)

    out: list[Fixture] = []
    for row in csv.DictReader(io.StringIO(raw)):
        when = _parse_date(row.get("Date", ""))
        div = (row.get("Div") or "").strip()
        home, away = (row.get("HomeTeam") or "").strip(), (row.get("AwayTeam") or "").strip()
        if not (when and div and home and away):
            continue
        if day and when != day:
            continue
        if divs and div not in divs:
            continue

        # Il file dei fixture espone il mercato 1X2 con le colonne "aperte"
        # (AvgH/MaxH) e i mercati gol solo nella variante con prefisso C
        # (AvgC>2.5). Si prova la prima disponibile per ciascuna chiave.
        odds = {}
        candidates = {
            "1": ("AvgH", "AvgCH", "B365H"), "X": ("AvgD", "AvgCD", "B365D"),
            "2": ("AvgA", "AvgCA", "B365A"),
            "panelmax1": ("MaxH", "MaxCH"), "panelmaxX": ("MaxD", "MaxCD"),
            "panelmax2": ("MaxA", "MaxCA"),
            "O2.5": ("Avg>2.5", "AvgC>2.5", "B365C>2.5"),
            "U2.5": ("Avg<2.5", "AvgC<2.5", "B365C<2.5"),
            "panelmaxO2.5": ("Max>2.5", "MaxC>2.5"), "panelmaxU2.5": ("Max<2.5", "MaxC<2.5"),
        }
        for key, fields in candidates.items():
            for field_name in fields:
                val = _f(row, field_name)
                if val:
                    odds[key] = val
                    break

        # Migliore quota fra i bookmaker NOMINATI, che e' cosa diversa dal
        # massimo del panel. Il campo Max copre una quarantina di operatori e
        # restituisce spesso valori fuori scala: per Fulham-Crystal Palace del
        # 5 settembre 2026 i sei book nominati stavano fra 2.25 e 2.30 mentre
        # Max diceva 3.00. Un prezzo del genere non e' eseguibile da chi gioca
        # su un book italiano, e usarlo come riferimento gonfia ogni edge.
        # Il manuale (§2A) chiede proprio di tenere distinte migliore quota
        # eseguibile, benchmark e mercato di riferimento.
        for key, cols in (("best1", NAMED_BOOKS_HOME), ("bestX", NAMED_BOOKS_DRAW),
                          ("best2", NAMED_BOOKS_AWAY), ("bestO2.5", ("B365>2.5", "BFE>2.5")),
                          ("bestU2.5", ("B365<2.5", "BFE<2.5"))):
            quotes = [v for v in (_f(row, c) for c in cols) if v]
            if quotes:
                odds[key] = max(quotes)
        out.append(Fixture(
            div=div, day=when, kickoff=(row.get("Time") or "").strip(),
            home=home, away=away,
            referee=(row.get("Referee") or "").strip(),
            odds=odds,
        ))

    out.sort(key=lambda f: (f.day, f.kickoff, f.div))
    return out
