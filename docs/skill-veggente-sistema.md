# Aggiunta alla skill veggente-schedine: il Sistema

Da incollare nella skill **veggente-schedine** su claude.ai, nei punti indicati.
Richiede la migrazione `supabase/migrations/20261017120000_sistema_veggente.sql`.

---

## In §4. Proposte — subito dopo la riga "**Multipla 5:** …"

```
- **Sistema** (integrale su Sportium): in prova sulla carta dal 17/10/2026 al
  07/11/2026, regole sotto
```

## In §4. Proposte — nuova sottosezione in fondo alla sezione

```
### Sistema (in prova sulla carta)

Deciso da Carmine il 17/10/2026. Un sistema integrale di fisse, doppie e una
tripla, da giocare su Sportium. Fino al 07/11/2026 si propone soltanto: non si
gioca e non si chiede conferma. A fine prova si fa il bilancio (§6) e si
decide con Carmine se giocarlo.

Il valore del sistema sta nelle fisse: doppie e triple coprono più segni e
pagano il margine del bookmaker su ognuno, quindi abbassano il rischio ma non
migliorano il rendimento atteso. Per questo le fisse sono le più selettive.
Con gambe scelte "come il mercato" un sistema da 4 fisse, 2 doppie e 1 tripla
renderebbe circa −18%; diventa positivo solo se le fisse A del Veggente
passano più spesso di quanto dicono le quote (al 17/10/2026: 9 vinte su 12 nei
campionati, 75% contro 69% atteso). È la prima cosa che la prova misura.

- **Fisse: 3 o 4, al massimo 5.** Solo voto A, quota (Sportbet o
  di riferimento) fra 1.35 e 1.55, una per partita. Ordine come per le altre
  proposte (Scelta del Veggente, poi CONCORDE, poi COMPATIBILE…). Con meno di
  3 fisse **il sistema non si fa**: dillo in apertura, insieme a quante A in
  fascia c'erano.
- **Doppie: al massimo 2, solo su "partite da X"** (deciso da Carmine il
  17/10/2026: la doppia serve a prendere il pareggio, che a quota 3 o più fa
  la vincita grossa). Una partita degli articoli di OGGI è candidata se:
  - c'è un'indicazione di pareggio: X secca o X in un pronostico del Veggente,
    oppure X di Cassandra, oppure una giocata del Veggente Under 2.5 o No
    Goal (partita chiusa, pochi gol);
  - la quota della X è fra 2.90 e 3.60: il mercato stesso la ritiene
    possibile;
  - le quote di 1 e di 2 sono entrambe almeno 2.00: nessun favorito netto;
  - il campionato è fra **Serie A, Serie B, La Liga, Bundesliga, Super Lig,
    Premier League, Eredivisie, Liga Portugal, Jupiler Pro League**. Prova su
    19.374 partite (football-data, 2023/24 – ottobre 2026, quote medie di
    chiusura): in questi la doppia X + favorito è stata in pari o in attivo
    (fattore 0.99–1.06), in Championship, League One, Liga 2, Ligue 1 e 2,
    Scozia e Grecia ha perso (0.91–0.94). Coppe europee e nazionali non sono
    coperte dalla prova: lì niente doppie.

  La doppia copre **X più il segno del favorito** (1X o X2, verso la quota
  più bassa fra 1 e 2). Ordine: prima la X secca del Veggente con voto A o B,
  poi la X di Cassandra, poi le partite Under 2.5 / No Goal; a parità, X con
  quota più alta. Nello storico al 17/10/2026 la X secca del Veggente ha 4
  vinte su 7 chiuse a quota media 3.21: campione troppo piccolo, è proprio
  quello che la prova deve misurare.
- **Tripla: facoltativa, al massimo 1.** È la parte che costa di più (nella
  stessa prova toglie circa il 6% del valore): si mette solo se fra le partite
  degli articoli del Veggente, negli stessi campionati delle doppie, ce n'è una
  con tutte e tre le quote 1X2 fra 2.20 e 4.20. Altrimenti niente tripla, ed è
  la scelta normale.
- **Quote 1X2 complete** per ogni doppia e tripla, da almeno una fonte con le
  regole del §2. Senza le tre quote la partita non entra. Si salvano in
  `quote_esiti` come `{"1":2.10,"X":3.30,"2":3.60,"fonte":"…"}`.
- **Colonne** = 2^doppie × 3^triple, **al massimo 12**. Importo per colonna
  **0,50 €** (il minimo su Sportium lo verifica Carmine); costo = colonne ×
  importo.
- **Vincita minima e massima.** Minima: escono i segni più bassi di ogni
  doppia e tripla. Massima: i più alti. Vincita = importo per colonna ×
  prodotto delle quote delle fisse × quota del segno uscito in ogni doppia e
  tripla. **Se la vincita minima è sotto il costo scrivilo in chiaro**: "con i
  favoriti il sistema perde X €".
- Le fisse possono essere le stesse gambe del raddoppio o della multipla: il
  sistema è una prova a parte.
```

## In §5. Output — dopo il blocco MULTIPLA 5

```
SISTEMA (in prova sulla carta) | [n] colonne × 0,50 € = X,XX € | vincita minima X,XX € · massima X,XX €
Fisse:
- Partita — mercato @ quota (fonte) · voto · Cassandra: esito · hh:mm
Doppie:
- Partita — 1X (1 @ q · X @ q · fonte) · perché da X: indicazione (Veggente X / Cassandra X / Under-No Goal), voto
Tripla:
- Partita — 1X2 (1 @ q · X @ q · 2 @ q · fonte)
Con i favoriti: vince/perde X,XX €
```

Se il sistema non si fa: `SISTEMA: non oggi — [n] fisse A in fascia 1.35–1.55
(ne servono almeno 3)`.

## In §6. Esiti e bilancio — in fondo alla "Chiusura esiti"

```
**Sistema.** Vinto (`WIN`) se tutte le fisse sono vinte e in ogni doppia e
tripla il risultato finale è fra i segni coperti; una gamba `VOID` vale quota
1. Per le doppie e la tripla il segno uscito si ricava da `risultato_finale`
della giocata collegata. Salva in `veggente_proposte.vincita` la vincita
calcolata come al §4 (0 se perso).
```

## In §6. Esiti e bilancio — nel "Bilancio", nuova voce

```
- **sistema (sulla carta):** giorni con e senza sistema, costo totale,
  vincite totali, saldo, quante volte vinto e quante di queste con i
  favoriti in perdita; fisse, doppie e triple saltate separatamente, per
  capire quale parte regge; per le doppie, quante volte è uscita la X
  (è la cosa che decide se l'idea funziona).
```

## In §7. Supabase — nell'elenco delle tabelle

```
- `veggente_proposte` con `tipo = 'SISTEMA'`: `colonne`, `importo_colonna`,
  `costo`, `vincita`; `stato` resta `PROPOSTA` per tutta la prova;
- `veggente_proposte_gambe` per il sistema: `ruolo` (`FISSA`, `DOPPIA`,
  `TRIPLA`), `segni` (es. `1X`, `1X2`, `2`), `quote_esiti`. Per doppie e
  tripla `giocata_id` è la giocata del Veggente su quella partita e `quota` è
  vuota.
```
