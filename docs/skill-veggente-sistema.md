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

- **Fisse: 3 o 4, al massimo 5.** Solo voto A, quota (Sportbet o
  di riferimento) fra 1.35 e 1.55, una per partita. Ordine come per le altre
  proposte (Scelta del Veggente, poi CONCORDE, poi COMPATIBILE…). Con meno di
  3 fisse **il sistema non si fa**: dillo in apertura, insieme a quante A in
  fascia c'erano.
- **Doppie: al massimo 2.** Partite degli articoli del Veggente di OGGI su cui
  c'è una sua giocata A o B sull'esito (1, X, 2, 1X, X2, 12). La doppia copre i
  due segni che contengono la sua indicazione: 1 → 1X, 2 → X2, X → 1X o X2
  verso la squadra con quota più alta, 1X/X2/12 → gli stessi due segni. Solo
  se la quota del segno principale è fra 1.70 e 2.60: sotto è una fissa, sopra
  è una lotteria.
- **Tripla: al massimo 1.** La partita più equilibrata del giorno fra quelle
  degli articoli del Veggente: tutte e tre le quote 1X2 fra 2.20 e 4.20. Se non
  c'è, niente tripla.
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
- Partita — 1X (1 @ q · X @ q · fonte) · indicazione Veggente: mercato, voto
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
  capire quale parte regge.
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
