"""
Prova sul passato della regola delle doppie del Sistema (17/10/2026).

Regola: X fra 2.90 e 3.60, 1 e 2 entrambi almeno 2.00; la doppia copre X piu'
il segno del favorito. Dati: football-data.co.uk, quote medie di chiusura,
via analytics/sources.py di BET Core.

Misura di valore: in un sistema integrale una doppia raddoppia le colonne e
moltiplica la vincita per la quota del segno uscito. Il suo "fattore" e'
E[quota uscita, 0 se fuori] / 2: 1.00 = neutra, sotto 1 toglie valore.
Per la tripla /3, per la fissa /1.
"""
import sys
from collections import defaultdict

sys.path.insert(0, sys.argv[1] if len(sys.argv) > 1 else __import__("os").path.dirname(__file__))
import sources  # noqa: E402

anni = [2023, 2024, 2025, 2026]
partite = []
for div in sources.LEAGUES:
    for anno in anni:
        partite.extend(sources.load_results(div, anno))

def esito(m):
    return "1" if m.fthg > m.ftag else ("X" if m.fthg == m.ftag else "2")

valide = [m for m in partite if all(k in m.close_odds for k in ("1", "X", "2"))]
print(f"partite con quote 1X2 di chiusura: {len(valide)} ({len(sources.LEAGUES)} campionati, stagioni {anni[0]}/{str(anni[0]+1)[2:]}-{anni[-1]}/{str(anni[-1]+1)[2:]})")

def riga(nome, gruppo, segni_di, divisore):
    n = len(gruppo)
    if not n:
        print(f"{nome:<42} nessuna partita"); return
    presi = [m for m in gruppo if esito(m) in segni_di(m)]
    pagato = sum(m.close_odds[esito(m)] for m in presi)
    x = sum(1 for m in gruppo if esito(m) == "X")
    print(f"{nome:<42} n={n:>5}  passa {100*len(presi)/n:5.1f}%  X uscita {100*x/n:5.1f}%  "
          f"fattore {pagato/n/divisore:5.3f}")

def fav(m):
    return "1" if m.close_odds["1"] <= m.close_odds["2"] else "2"

def sfav(m):
    return "2" if fav(m) == "1" else "1"

regola = [m for m in valide if 2.90 <= m.close_odds["X"] <= 3.60
          and min(m.close_odds["1"], m.close_odds["2"]) >= 2.00]

print("\n-- DOPPIE (fattore = quota uscita / 2) --")
riga("Regola: X + favorito", regola, lambda m: {"X", fav(m)}, 2)
riga("Regola: X + sfavorito", regola, lambda m: {"X", sfav(m)}, 2)
riga("Regola: 1 + 2 (senza X)", regola, lambda m: {"1", "2"}, 2)
riga("Tutte le partite: X + favorito", valide, lambda m: {"X", fav(m)}, 2)

print("\n-- SINGOLI SEGNI sulle partite della regola (fattore = quota uscita) --")
riga("Solo X", regola, lambda m: {"X"}, 1)
riga("Solo favorito", regola, lambda m: {fav(m)}, 1)

print("\n-- TRIPLA (fattore = quota uscita / 3) --")
equil = [m for m in valide if all(2.20 <= m.close_odds[k] <= 4.20 for k in ("1", "X", "2"))]
riga("Tutte e tre le quote fra 2.20 e 4.20", equil, lambda m: {"1", "X", "2"}, 3)

print("\n-- FISSE: favorito fra 1.35 e 1.55 (fattore = quota se vince) --")
fisse = [m for m in valide if 1.35 <= min(m.close_odds["1"], m.close_odds["2"]) <= 1.55]
riga("Favorito 1.35-1.55", fisse, lambda m: {fav(m)}, 1)

print("\n-- REGOLA DELLE DOPPIE per campionato (X + favorito) --")
per = defaultdict(list)
for m in regola:
    per[m.div].append(m)
for div in sorted(per, key=lambda d: -len(per[d])):
    riga(f"{div} {sources.LEAGUES[div]}", per[div], lambda m: {"X", fav(m)}, 2)
