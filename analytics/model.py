"""
Modello di forza delle squadre e probabilita' di partita.

Impostazione: ogni squadra ha un indice di attacco e uno di difesa, stimati
sui gol attesi (xG dove disponibili, gol reali dove no). I gol attesi della
singola partita sono

    lambda_casa    = media_lega * attacco_casa * difesa_ospite * vantaggio_campo
    lambda_ospite  = media_lega * attacco_ospite * difesa_casa

Tre correzioni rispetto al Poisson ingenuo, tutte pensate per gli stessi
problemi incontrati nell'analisi manuale:

1. Decadimento temporale: una partita di maggio pesa meno di una di agosto.
2. Shrinkage verso la media: con 2-3 partite giocate la stima grezza dice che
   una neopromossa vale 2.4 gol a partita in casa. Non e' vero, e' rumore. Il
   rating viene tirato verso 1.0 con forza proporzionale a quanto sono pochi i
   dati, cosi' il modello ammette di non sapere invece di inventare.
3. Correzione Dixon-Coles: il Poisson indipendente sbaglia sistematicamente
   sui risultati bassi (0-0, 1-0, 0-1, 1-1), che sono proprio quelli decisivi
   per i mercati Under e NoGol.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date

from sources import Match

# Emivita del peso temporale: una partita di 180 giorni fa vale meta' di una
# di oggi. Valore standard in letteratura per il calcio per club.
HALF_LIFE_DAYS = 180.0

# Numero di partite "virtuali" a rating neutro aggiunte a ogni squadra. Piu'
# alto = piu' prudente a inizio stagione. 6 significa che alla 3a giornata il
# rating e' per due terzi ancora la media di lega.
SHRINKAGE_MATCHES = 6.0

MAX_GOALS = 10


def _decay(match_day: date, ref_day: date) -> float:
    age = max((ref_day - match_day).days, 0)
    return 0.5 ** (age / HALF_LIFE_DAYS)


@dataclass
class LeagueModel:
    """Rating stimati per un campionato a una certa data."""

    div: str
    ref_day: date
    attack: dict[str, float]
    defence: dict[str, float]
    base_home: float          # gol attesi medi della squadra di casa
    base_away: float
    rho: float                # parametro Dixon-Coles
    matches_used: int
    team_matches: dict[str, float]
    xg_share: float           # quota di partite con xG reali (non gol)

    def teams(self) -> list[str]:
        return sorted(self.attack)

    def has(self, *names: str) -> bool:
        return all(n in self.attack for n in names)

    def expected_goals(self, home: str, away: str) -> tuple[float, float]:
        """Gol attesi per la partita. Squadra sconosciuta = rating neutro."""
        lam_h = self.base_home * self.attack.get(home, 1.0) * self.defence.get(away, 1.0)
        lam_a = self.base_away * self.attack.get(away, 1.0) * self.defence.get(home, 1.0)
        # Limiti di sicurezza: nessuna squadra vale 0.05 o 6 gol attesi.
        return max(0.15, min(lam_h, 5.0)), max(0.15, min(lam_a, 5.0))

    def confidence_matches(self, home: str, away: str) -> float:
        """Partite pesate disponibili sulla meno documentata delle due squadre."""
        return min(self.team_matches.get(home, 0.0), self.team_matches.get(away, 0.0))


def fit(matches: list[Match], ref_day: date | None = None, div: str = "",
        iterations: int = 60) -> LeagueModel:
    """
    Stima i rating con adattamento iterativo dei rapporti attacco/difesa.

    E' l'equivalente pratico di una regressione di Poisson, ma senza scipy:
    si parte da rating neutri e a ogni giro si aggiorna ciascun rating come
    rapporto fra quanto la squadra ha prodotto e quanto ci si aspettava che
    producesse dati i rating correnti degli avversari. Converge in poche
    decine di iterazioni.
    """
    matches = [m for m in matches if m.home and m.away]
    if not matches:
        raise ValueError("nessuna partita disponibile per la stima")

    ref_day = ref_day or max(m.day for m in matches)
    matches = [m for m in matches if m.day <= ref_day]
    if not matches:
        raise ValueError("nessuna partita precedente alla data di riferimento")

    weights = [_decay(m.day, ref_day) for m in matches]
    total_w = sum(weights) or 1.0

    base_home = sum(w * m.target_home for w, m in zip(weights, matches)) / total_w
    base_away = sum(w * m.target_away for w, m in zip(weights, matches)) / total_w
    base_home = max(base_home, 0.3)
    base_away = max(base_away, 0.3)

    teams = sorted({m.home for m in matches} | {m.away for m in matches})
    attack = {t: 1.0 for t in teams}
    defence = {t: 1.0 for t in teams}

    # Partite pesate per squadra: guida lo shrinkage e la confidence.
    team_w: dict[str, float] = {t: 0.0 for t in teams}
    for w, m in zip(weights, matches):
        team_w[m.home] += w
        team_w[m.away] += w

    for _ in range(iterations):
        scored: dict[str, float] = {t: 0.0 for t in teams}
        exp_scored: dict[str, float] = {t: 0.0 for t in teams}
        conceded: dict[str, float] = {t: 0.0 for t in teams}
        exp_conceded: dict[str, float] = {t: 0.0 for t in teams}

        for w, m in zip(weights, matches):
            eh = base_home * attack[m.home] * defence[m.away]
            ea = base_away * attack[m.away] * defence[m.home]

            scored[m.home] += w * m.target_home
            exp_scored[m.home] += w * eh
            scored[m.away] += w * m.target_away
            exp_scored[m.away] += w * ea

            conceded[m.away] += w * m.target_home
            exp_conceded[m.away] += w * eh
            conceded[m.home] += w * m.target_away
            exp_conceded[m.home] += w * ea

        for t in teams:
            n = team_w[t]
            # Peso della stima empirica contro il rating neutro: con poche
            # partite vince la media di lega.
            k = n / (n + SHRINKAGE_MATCHES)

            if exp_scored[t] > 0:
                raw = scored[t] / exp_scored[t]
                attack[t] = max(0.25, min(1.0 + k * (raw - 1.0), 3.0))
            if exp_conceded[t] > 0:
                raw = conceded[t] / exp_conceded[t]
                defence[t] = max(0.25, min(1.0 + k * (raw - 1.0), 3.0))

        # Normalizzazione: i rating sono relativi, la media di lega resta 1.0.
        for table in (attack, defence):
            mean = sum(table.values()) / len(table)
            if mean > 0:
                for t in teams:
                    table[t] /= mean

    rho = _fit_rho(matches, weights, base_home, base_away, attack, defence)
    xg_share = sum(w for w, m in zip(weights, matches) if m.has_xg) / total_w

    return LeagueModel(
        div=div or matches[0].div, ref_day=ref_day,
        attack=attack, defence=defence,
        base_home=base_home, base_away=base_away,
        rho=rho, matches_used=len(matches), team_matches=team_w,
        xg_share=xg_share,
    )


def _fit_rho(matches, weights, base_home, base_away, attack, defence) -> float:
    """
    Stima rho (Dixon-Coles) per ricerca su griglia massimizzando la
    verosimiglianza sui risultati bassi. rho negativo = piu' 0-0 e 1-1 di
    quanti ne preveda il Poisson indipendente, che e' il caso tipico.
    """
    best_rho, best_ll = 0.0, -1e18
    for step in range(-20, 11):
        rho = step / 100.0
        ll = 0.0
        ok = True
        for w, m in zip(weights, matches):
            lam_h = base_home * attack[m.home] * defence[m.away]
            lam_a = base_away * attack[m.away] * defence[m.home]
            p = _poisson(m.fthg, lam_h) * _poisson(m.ftag, lam_a)
            p *= _tau(m.fthg, m.ftag, lam_h, lam_a, rho)
            if p <= 0:
                ok = False
                break
            ll += w * math.log(p)
        if ok and ll > best_ll:
            best_ll, best_rho = ll, rho
    return best_rho


def _poisson(k: int, lam: float) -> float:
    if lam <= 0:
        return 1.0 if k == 0 else 0.0
    return math.exp(-lam) * lam ** k / math.factorial(k)


def _tau(h: int, a: int, lam_h: float, lam_a: float, rho: float) -> float:
    """Correzione Dixon-Coles sui quattro risultati bassi."""
    if h == 0 and a == 0:
        return 1.0 - lam_h * lam_a * rho
    if h == 0 and a == 1:
        return 1.0 + lam_h * rho
    if h == 1 and a == 0:
        return 1.0 + lam_a * rho
    if h == 1 and a == 1:
        return 1.0 - rho
    return 1.0


def score_matrix(lam_h: float, lam_a: float, rho: float = 0.0,
                 max_goals: int = MAX_GOALS) -> list[list[float]]:
    """Probabilita' di ogni punteggio, normalizzata a somma 1."""
    grid = [[0.0] * (max_goals + 1) for _ in range(max_goals + 1)]
    total = 0.0
    for h in range(max_goals + 1):
        ph = _poisson(h, lam_h)
        for a in range(max_goals + 1):
            p = ph * _poisson(a, lam_a) * _tau(h, a, lam_h, lam_a, rho)
            p = max(p, 0.0)
            grid[h][a] = p
            total += p
    if total > 0:
        for h in range(max_goals + 1):
            for a in range(max_goals + 1):
                grid[h][a] /= total
    return grid


def markets(grid: list[list[float]]) -> dict[str, float]:
    """Dalla matrice dei punteggi ai mercati, in percentuale."""
    n = len(grid)
    out = {k: 0.0 for k in (
        "1", "X", "2", "1X", "12", "X2",
        "over1.5", "under1.5", "over2.5", "under2.5", "over3.5", "under3.5",
        "gg", "ng", "home_cs", "away_cs", "home_-1", "away_+1",
    )}
    for h in range(n):
        for a in range(n):
            p = grid[h][a]
            if p <= 0:
                continue
            tot = h + a
            if h > a:
                out["1"] += p
            elif h == a:
                out["X"] += p
            else:
                out["2"] += p
            if h >= a:
                out["1X"] += p
            if h != a:
                out["12"] += p
            if h <= a:
                out["X2"] += p
            for line in (1.5, 2.5, 3.5):
                if tot > line:
                    out[f"over{line:g}"] += p
                else:
                    out[f"under{line:g}"] += p
            if h > 0 and a > 0:
                out["gg"] += p
            else:
                out["ng"] += p
            if a == 0:
                out["home_cs"] += p   # clean sheet della squadra di casa
            if h == 0:
                out["away_cs"] += p
            if h - a >= 2:
                out["home_-1"] += p   # casa vince con handicap -1
            if h - a <= 1:
                out["away_+1"] += p   # ospite non perde con piu' di un gol di scarto
    return {k: round(v * 100, 2) for k, v in out.items()}


def predict(model: LeagueModel, home: str, away: str) -> dict:
    """Probabilita' complete di una partita, piu' i gol attesi usati."""
    lam_h, lam_a = model.expected_goals(home, away)
    grid = score_matrix(lam_h, lam_a, model.rho)
    return {
        "lambda_home": round(lam_h, 3),
        "lambda_away": round(lam_a, 3),
        "rho": model.rho,
        "markets": markets(grid),
    }


def uncertainty_band(model: LeagueModel, home: str, away: str,
                     spread: float = 0.12) -> tuple[dict, dict, dict]:
    """
    Tre scenari invece di un numero secco: centrale, favorevole alla casa,
    favorevole all'ospite. Il protocollo richiede di usare il limite inferiore
    della stima per calcolare il value, e questo lo rende esplicito invece di
    lasciarlo al giudizio a occhio.

    `spread` e' l'ampiezza relativa dei gol attesi, allargata automaticamente
    quando le squadre hanno poche partite alle spalle.
    """
    lam_h, lam_a = model.expected_goals(home, away)

    n = model.confidence_matches(home, away)
    # Con poche partite pesate la banda si allarga: a 2 partite vale circa il
    # doppio che a 20.
    widen = 1.0 + 8.0 / (n + 4.0)
    delta = spread * widen

    scenarios = {}
    for name, (fh, fa) in {
        "centrale": (1.0, 1.0),
        "pro_casa": (1.0 + delta, 1.0 - delta),
        "pro_ospite": (1.0 - delta, 1.0 + delta),
    }.items():
        grid = score_matrix(lam_h * fh, lam_a * fa, model.rho)
        scenarios[name] = markets(grid)

    return scenarios["centrale"], scenarios["pro_casa"], scenarios["pro_ospite"]


def floor_probability(central: dict, high: dict, low: dict, market: str) -> float:
    """Il valore piu' pessimista fra i tre scenari per un dato mercato."""
    return min(central.get(market, 0.0), high.get(market, 0.0), low.get(market, 0.0))
