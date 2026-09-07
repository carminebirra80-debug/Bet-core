#!/usr/bin/env python3
"""
Verifica di analytics/leggi_app.py.

Perche' esiste: questo modulo e' il canale con cui il debrief legge i dati
veri del registro. Se sbaglia i conti nessuno se ne accorge — i numeri
sembrano plausibili e finiscono in un debrief che poi guida le decisioni.

Due rischi concreti coperti qui:
- l'estrazione di URL e chiave da index.html si rompe in silenzio se qualcuno
  rinomina le variabili, e il modulo smetterebbe di funzionare senza una
  ragione evidente;
- le rettifiche contabili non devono contare come denaro versato, altrimenti
  falsano il rendimento sul versato. E' la stessa distinzione introdotta
  nell'app con tipoMovimento.
"""

import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "analytics"))
import leggi_app as L


def test_credenziali_dal_html():
    url, chiave = L.credenziali_pubbliche()
    assert url.startswith("https://") and "supabase.co" in url, url
    # La chiave deve essere quella PUBBLICA. Se un giorno finisse qui una
    # service_role key, il test lo segnala: quella non va nel client.
    assert chiave.startswith("sb_publishable_") or chiave.startswith("eyJ"), chiave
    assert "service_role" not in chiave

    # Se le variabili vengono rinominate, il modulo deve dirlo invece di
    # restituire valori vuoti.
    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False, encoding="utf-8") as fh:
        fh.write("<script>var ALTRO = 'x';</script>")
        percorso = fh.name
    try:
        L.credenziali_pubbliche(percorso)
        raise AssertionError("doveva sollevare CanaleChiuso su html senza credenziali")
    except L.CanaleChiuso as e:
        assert "index.html" in str(e)
    finally:
        os.unlink(percorso)


def test_segreto_mancante():
    prima = os.environ.pop(L.VAR_SEGRETO, None)
    try:
        L.segreto()
        raise AssertionError("doveva sollevare CanaleChiuso senza la variabile")
    except L.CanaleChiuso as e:
        assert L.VAR_SEGRETO in str(e)
        assert "chat" in str(e), "il messaggio deve dire di non incollarlo in chat"
    finally:
        if prima is not None:
            os.environ[L.VAR_SEGRETO] = prima

    # Una variabile impostata ma vuota vale come mancante.
    os.environ[L.VAR_SEGRETO] = "   "
    try:
        L.segreto()
        raise AssertionError("una variabile vuota deve valere come mancante")
    except L.CanaleChiuso:
        pass
    finally:
        os.environ.pop(L.VAR_SEGRETO, None)
        if prima is not None:
            os.environ[L.VAR_SEGRETO] = prima


def test_conta_solo_giocate_reali():
    assert L.conta({"stato_core": "ufficiale"}) is True
    assert L.conta({}) is True                                   # stato assente = ufficiale
    assert L.conta({"osservata": True}) is False
    assert L.conta({"stato_core": "scartata"}) is False
    assert L.conta({"stato_core": "ufficiale", "osservata": True}) is False


def test_giornata():
    dati = {"picks": [
        {"data": "2026-09-06", "stake": 2, "profitto": 3.24, "esito": "vinta",
         "classificazione": "PERSONALE", "evento": "J4F", "quota": 2.76},
        {"data": "2026-09-06", "stake": 2, "profitto": -2, "esito": "persa",
         "classificazione": "TIPSTER", "evento": "Fabrizio", "quota": 5.62},
        # Profitto diverso da zero di proposito: una giocata aperta non deve
        # entrare nel netto ANCHE se per qualche motivo porta un valore
        # residuo. Con profitto 0 il test non distinguerebbe le due logiche.
        {"data": "2026-09-06", "stake": 5, "profitto": 7.77, "esito": "aperta",
         "classificazione": "PERSONALE", "evento": "Aperta", "quota": 2},
        # osservata: non deve incidere sui soldi
        {"data": "2026-09-06", "stake": 99, "profitto": 99, "esito": "vinta",
         "osservata": True, "classificazione": "WATCHLIST", "evento": "Finta", "quota": 2},
        # altro giorno: fuori
        {"data": "2026-09-05", "stake": 5, "profitto": 5.5, "esito": "vinta",
         "classificazione": "PERSONALE", "evento": "Ieri", "quota": 2.1},
    ]}
    g = L.giornata(dati, "2026-09-06")
    assert len(g["reali"]) == 3, len(g["reali"])
    assert len(g["osservate"]) == 1
    assert abs(g["giocato"] - 9) < 0.005, g["giocato"]
    # il netto conta solo le chiuse: 3.24 - 2 = 1.24, l'aperta non entra
    assert abs(g["netto"] - 1.24) < 0.005, g["netto"]
    assert len(g["aperte"]) == 1
    assert set(g["per_origine"]) == {"PERSONALE", "TIPSTER"}


def test_cassa_esclude_le_rettifiche_dal_versato():
    dati = {
        "versamenti": [
            {"importo": 10, "tipo_movimento": "versamento"},
            {"importo": 10},                                   # senza tipo = versamento
            {"importo": 1.36, "tipo_movimento": "rettifica"},  # NON e' denaro versato
        ],
        "picks": [
            {"stato_core": "ufficiale", "esito": "vinta", "profitto": 5.5},
            {"stato_core": "ufficiale", "esito": "persa", "profitto": -5},
            {"stato_core": "ufficiale", "esito": "aperta", "profitto": 0},
            {"osservata": True, "esito": "vinta", "profitto": 100},
        ],
    }
    c = L.cassa(dati)
    assert abs(c["versato"] - 20) < 0.005, f"la rettifica non e' un versamento: {c['versato']}"
    assert abs(c["rettifiche"] - 1.36) < 0.005, c["rettifiche"]
    assert abs(c["profitto"] - 0.5) < 0.005, c["profitto"]
    # cassa = versato + rettifiche + profitti = 20 + 1.36 + 0.5
    assert abs(c["cassa"] - 21.86) < 0.005, c["cassa"]


def test_stessa_partita_fra_fonti_diverse():
    """
    I nomi arrivano da due fonti che non coincidono mai alla lettera: nel
    registro li scrive Carmine, nei consigli li scrivo io dalle API.

    Questo confronto ha gia' fallito una volta in modo silenzioso: abbinava
    zero righe e il debrief avrebbe detto che nessun consiglio era stato
    seguito proprio nella giornata in cui erano stati seguiti tutti. Due
    cause distinte, entrambe coperte qui.
    """
    # 1. separatore senza spazi, che split_event da solo non riconosce
    assert L._stessa_partita("Juventus-AC Milan", "Juventus - Milan")
    # 2. alias in direzione opposta a quella della tabella (it -> en)
    assert L._stessa_partita("Espanyol-Sevilla", "Espanyol - Siviglia")
    assert L._stessa_partita("Espanyol - Siviglia", "Espanyol-Sevilla")
    assert L._stessa_partita("Nottingham Forest - Tottenham",
                             "Nottingham Forest-Tottenham")

    # E deve continuare a dire di no quando le partite sono davvero diverse:
    # un confronto troppo generoso e' peggio di uno che non abbina, perche'
    # attribuisce al metodo l'esito di un'altra giocata.
    assert not L._stessa_partita("Juventus - Milan", "Espanyol - Siviglia")
    assert not L._stessa_partita("Juventus - Milan", "Milan - Juventus")
    assert not L._stessa_partita("Multipla Fabrizio", "Juventus - Milan")


def test_mercato_opposto_non_e_lo_stesso_consiglio():
    assert L._stesso_mercato("Under2.5", "Under 2.5")
    assert L._stesso_mercato("No Goal", "nogoal")
    # Under e Over sulla stessa partita sono la scommessa opposta.
    assert not L._stesso_mercato("Under 2.5", "Over 2.5")
    assert not L._stesso_mercato("1", "2")
    # Un mercato vuoto non abbina nulla: meglio nessun abbinamento che uno
    # inventato.
    assert not L._stesso_mercato("", "")


def _dati_confronto():
    return {"picks": [
        {"data": "2026-09-06", "evento": "Juventus - Milan", "mercato": "Under 2.5",
         "quota": 1.62, "stake": 1.5, "profitto": 0.93, "esito": "vinta",
         "classificazione": "PERSONALE"},
        # Stessa partita del consiglio ma scommessa opposta: non e' il
        # consiglio seguito, e il suo esito non deve finire nel ROI del metodo.
        {"data": "2026-09-06", "evento": "Espanyol - Siviglia", "mercato": "Over 2.5",
         "quota": 2.30, "stake": 1.5, "profitto": -1.5, "esito": "persa",
         "classificazione": "PERSONALE"},
        {"data": "2026-09-06", "evento": "Multipla Fabrizio", "mercato": "",
         "quota": 5.62, "stake": 2, "profitto": -2, "esito": "persa",
         "classificazione": "TIPSTER"},
        {"data": "2026-09-05", "evento": "Juventus - Milan", "mercato": "Under 2.5",
         "quota": 1.7, "stake": 9, "profitto": 6.3, "esito": "vinta",
         "classificazione": "PERSONALE"},
    ]}


def test_confronto_separa_consigli_seguiti_e_no():
    c = L.confronto(_dati_confronto(), "2026-09-06")

    seguiti = [(cons["partita"], g["evento"]) for cons, g in c["abbinati"]]
    assert seguiti == [("Juventus - AC Milan", "Juventus - Milan")], seguiti

    diversi = [cons["partita"] for cons, _ in c["mercato_diverso"]]
    assert diversi == ["Espanyol - Sevilla"], diversi

    fuori = [g["evento"] for g in c["fuori_consiglio"]]
    assert fuori == ["Multipla Fabrizio"], fuori

    # Il consiglio giocato al contrario non conta come non giocato...
    assert c["non_giocati"] == [], c["non_giocati"]
    # ...e la giocata del 5 non deve entrare in una giornata del 6.
    assert all(g["data"] == "2026-09-06" for _, g in c["abbinati"])

    # La riga NESSUNA_SELEZIONE resta a parte: descrive il metodo, non e' un
    # consiglio da abbinare.
    assert len(c["nessuna_selezione"]) == 1


def test_confronto_legge_il_registro_dei_consigli():
    """
    Il file dei consigli e' l'unica traccia scritta di cosa avevo proposto.
    Se si rompe (colonne rinominate, virgole non quotate) il confronto
    diventa muto senza dirlo.
    """
    righe = L.consigli("2026-09-05")
    assert len(righe) == 3, righe
    for r in righe:
        assert r.get("partita"), r
        assert r.get("mercato"), r
        assert None not in r, f"virgola non quotata in consigli.csv: {r}"


if __name__ == "__main__":
    test_credenziali_dal_html()
    test_segreto_mancante()
    test_conta_solo_giocate_reali()
    test_giornata()
    test_cassa_esclude_le_rettifiche_dal_versato()
    test_stessa_partita_fra_fonti_diverse()
    test_mercato_opposto_non_e_lo_stesso_consiglio()
    test_confronto_separa_consigli_seguiti_e_no()
    test_confronto_legge_il_registro_dei_consigli()
    print("leggi-app: ok")
