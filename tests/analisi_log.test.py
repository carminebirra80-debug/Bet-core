#!/usr/bin/env python3
"""
Verifica di analytics/analisi_log.py.

Il registro serve a decidere quali tipi di notizia tenere nel metodo: un CLV
calcolato al contrario (chiusura/ingresso) o sulla quota sbagliata darebbe
risultati plausibili e opposti al vero, senza nessun errore visibile.
"""

import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "analytics"))
import analisi_log as A


def riga(**kw):
    base = {
        "data": "2026-09-26", "fascia": "20:45", "partita": "Inghilterra - Spagna",
        "campionato": "UNL", "tipo_notizia": "assenza_attacco", "tesi": "",
        "mercato": "2", "quota_t60": "2.20", "quota_t25": "2.12", "quota_chiusura": "",
        "quota_book": "", "book": "", "decisione": "scartata", "motivo": "", "esito": "", "risultato": "",
    }
    base.update(kw)
    return base


def test_clv_segno_e_quota_di_ingresso():
    # Entrati a 2.20 (T-60 soltanto), chiude a 2.00: mercato nella nostra direzione.
    assert A.clv(riga(quota_t25="", quota_chiusura="2.00")) == 10.0
    # T-25 prevale su T-60 come ingresso ipotetico.
    assert A.clv(riga(quota_chiusura="2.00")) == 6.0
    # La quota reale del book prevale su tutto.
    assert A.clv(riga(quota_book="1.90", quota_chiusura="2.00")) == -5.0
    # Senza chiusura niente CLV.
    assert A.clv(riga()) is None


def test_aggiungi_chiudi_riepilogo():
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "analisi.csv")
        A.aggiungi(riga(), p)
        A.aggiungi(riga(partita="Rep. Ceca - Croazia", tipo_notizia="nessuna", quota_t25="3.10"), p)
        try:
            A.aggiungi(riga(), p)
            raise AssertionError("duplicato accettato")
        except ValueError:
            pass
        A.chiudi("2026-09-26", "Inghilterra - Spagna", "2", chiusura="2.00", esito="vinta", risultato="1-2", percorso=p)
        righe = A.leggi(p)
        assert len(righe) == 2
        g = {(x["tipo_notizia"], x["decisione"]): x for x in A.riepilogo(righe)}
        att = g[("assenza_attacco", "scartata")]
        assert (att["casi"], att["con_clv"], att["clv_medio"], att["batte_chiusura"]) == (1, 1, 6.0, 100), att
        assert (att["vinte"], att["chiuse"]) == (1, 1)
        # Una chiusura uguale all'ingresso non "batte" la chiusura.
        A.aggiungi(riga(partita="Macedonia del Nord - Svizzera", quota_t25="1.80", quota_chiusura="1.80"), p)
        g2 = {(x["tipo_notizia"], x["decisione"]): x for x in A.riepilogo(A.leggi(p))}
        assert g2[("assenza_attacco", "scartata")]["batte_chiusura"] == 50, g2
        nes = g[("nessuna", "scartata")]
        assert nes["con_clv"] == 0 and nes["clv_medio"] is None


def test_validazione():
    for cattiva in (riga(tipo_notizia="boh"), riga(decisione="forse"), riga(partita="Inghilterra-Spagna"),
                    riga(quota_t60="0.9"), riga(esito="pareggio")):
        try:
            A.valida(cattiva)
            raise AssertionError(f"accettata: {cattiva}")
        except ValueError:
            pass


def test_file_reale_valido():
    righe = A.leggi()
    for r in righe:
        A.valida(r)
    assert list(A.leggi()[0].keys()) == A.COLONNE if righe else True


if __name__ == "__main__":
    test_clv_segno_e_quota_di_ingresso()
    test_aggiungi_chiudi_riepilogo()
    test_validazione()
    test_file_reale_valido()
    print("analisi_log: ok")
