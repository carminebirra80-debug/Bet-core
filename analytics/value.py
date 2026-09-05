"""
Dalla probabilita' del modello al value: de-vig, edge, rating a stelle.

Regola guida: il value si calcola sempre confrontando la probabilita' del
modello con la quota REALE che si puo' giocare (la migliore disponibile), non
con la media di mercato. La media di mercato de-vigata serve a un'altra cosa:
capire se lo scarto del modello e' informazione o rumore. Se il modello dice
60% e il consenso de-vigato dice 59%, non c'e' nessun edge da giocare, c'e'
solo il margine del bookmaker.
"""

from __future__ import annotations

from dataclasses import dataclass

# Soglia minima di edge per considerare una selezione. Sotto questa non si
# scommette: il modello non e' abbastanza preciso da distinguere un 3% di
# vantaggio dal proprio errore di stima.
MIN_EDGE = 5.0


def implied(odds: float) -> float:
    """Probabilita' implicita di una quota decimale, in percentuale."""
    if odds <= 1.0:
        raise ValueError(f"quota non valida: {odds}")
    return 100.0 / odds


def devig(odds: dict[str, float]) -> dict[str, float]:
    """
    Toglie il margine del bookmaker da un mercato completo.

    Metodo proporzionale: semplice e adeguato per mercati a due o tre esiti
    con margini normali. Su quote molto sbilanciate (favoriti sotto 1.20)
    sottostima leggermente il favorito, ma li' non si scommette comunque.
    """
    if not odds:
        return {}
    raw = {k: implied(v) for k, v in odds.items()}
    overround = sum(raw.values())
    if overround <= 0:
        return {}
    return {k: round(v / overround * 100, 2) for k, v in raw.items()}


def margin(odds: dict[str, float]) -> float:
    """Margine del bookmaker in percentuale (0 = quote eque)."""
    if not odds:
        return 0.0
    return round(sum(implied(v) for v in odds.values()) - 100.0, 2)


def blend(p_model: float, p_market: float, weight: float) -> float:
    """
    Media pesata fra la probabilita' del modello e il consenso di mercato
    de-vigato. `weight` e' il peso dato al modello.

    Perche' serve: il backtest walk-forward mostra che il modello puro ha un
    log-loss peggiore di quello del mercato (1.013 contro 0.962 in Serie A) e
    che puntare i suoi "edge" perde il 21% su 500 scommesse. Le sue deviazioni
    dal mercato sono quindi in media rumore, non informazione. Il mercato va
    trattato come stima di partenza, e il modello come una correzione parziale
    su cui si mette solo il peso che i dati giustificano.

    Con weight=0 si sta dicendo "il mercato ha sempre ragione" (non si punta
    quasi mai); con weight=1 si torna al modello puro, che il backtest ha gia'
    bocciato. Il valore giusto lo decide calibrate.py, non l'intuito.
    """
    weight = max(0.0, min(weight, 1.0))
    return weight * p_model + (1.0 - weight) * p_market


def edge(probability: float, odds: float) -> float:
    """
    Value percentuale. Passare SEMPRE il limite inferiore della stima:
    usare la stima centrale gonfia sistematicamente il numero di selezioni.
    """
    return round((probability / implied(odds) - 1.0) * 100, 2)


def stars(value_pct: float) -> int:
    """Rating 1-5. Sopra il 20% conviene sospettare un errore di quota."""
    if value_pct >= 20:
        return 5
    if value_pct >= 15:
        return 4
    if value_pct >= 10:
        return 3
    if value_pct >= 7:
        return 2
    if value_pct >= MIN_EDGE:
        return 1
    return 0


def combo(odds_list: list[float]) -> float:
    """
    Quota totale di una multipla.

    Attenzione: moltiplicare le quote e' corretto solo se gli eventi sono
    indipendenti. Due mercati della stessa partita (Over 2.5 e Goal, per dire)
    non lo sono, e la probabilita' reale della combo e' diversa da quella che
    il prodotto suggerisce.
    """
    total = 1.0
    for o in odds_list:
        total *= o
    return round(total, 2)


@dataclass
class Candidate:
    """Una selezione valutata."""

    match: str
    league: str
    kickoff: str
    market: str
    label: str
    odds: float
    prob_central: float
    prob_floor: float
    consensus: float | None
    value_floor: float
    value_central: float
    stars: int
    confidence: str
    referee: str
    note: str = ""

    @property
    def qualifies(self) -> bool:
        return self.value_floor >= MIN_EDGE

    def line(self) -> str:
        cons = f"{self.consensus:5.1f}%" if self.consensus is not None else "  n/d"
        return (f"{self.match:34s} {self.label:14s} q={self.odds:5.2f} "
                f"mod={self.prob_central:5.1f}% floor={self.prob_floor:5.1f}% "
                f"cons={cons} value={self.value_floor:+6.1f}% "
                f"{'*' * self.stars:5s} {self.confidence}")


def confidence_level(model_matches: float, has_xg: bool, has_referee: bool) -> str:
    """
    A = dati completi (xG reali, campione adeguato, arbitro noto)
    B = dati parziali
    C = pochi indicatori
    """
    if model_matches < 4:
        return "C"
    if has_xg and has_referee and model_matches >= 8:
        return "A"
    return "B"
