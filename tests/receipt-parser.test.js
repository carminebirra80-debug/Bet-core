"use strict";

const assert=require("node:assert/strict");
const P=require("../receipt-parser.js");

// Testi reali prodotti dall'OCR sulle ricevute Sportium del 31/08/2026.
const barca=`< Giocata
Giocata del: 31/08/2026 21:09
ADM: DF07EA081F319A693C05
31/08/2026 21:30 - Calcio - LaLiga
Barcellona vs Rayo Vallecano
MULTIGOAL 3-5 CASA + MULTIGOAL 0-1
© OsPire “SI |2.00
Quota totale : 2.00
Importo pagato: 5,00 €
Vincita potenziale 10,00 €`;

const arsenalAltoContrasto=`< Giocata
Stato: @ VENDUTO
Giocata del: 31/08/2026 20:45
ADM: DF07EA081F319A4BA004
W 31/08/2026 21:00 - Calcio - Premier League
Aston Villa vs Arsenal ( 0: 0 )
DC OUT + MG 2-4 X2+ MULTIG | 1.65
Quota totale : 1.65
Importo pagato: 6,00 €
Vincita potenziale 9,90 €`;

const b=P.parseSportium(barca);
assert.equal(b.ticketId,"DF07EA081F319A693C05");
assert.equal(b.data,"2026-08-31");
assert.equal(b.quota,2);
assert.equal(b.stake,5);
assert.equal(b.eventi.length,1);
assert.equal(b.eventi[0].evento,"Barcellona vs Rayo Vallecano");
assert.equal(b.eventi[0].mercato,"MULTIGOAL 3-5 CASA + MULTIGOAL 0-1 OSPITE");
assert.deepEqual(b.avvisi,[]);

const a=P.parseSportium(arsenalAltoContrasto);
assert.equal(a.ticketId,"DF07EA081F319A4BA004");
assert.equal(a.quota,1.65);
assert.equal(a.stake,6);
assert.equal(a.eventi[0].evento,"Aston Villa vs Arsenal");
assert.equal(a.eventi[0].mercato,"X2 + MULTIGOAL 2-4");
assert.equal(a.eventi[0].struttura.tipo,"COMBO");
assert.deepEqual(a.eventi[0].struttura.componenti.map(x=>x.tipo),["DOPPIA_CHANCE","MULTIGOAL"]);
assert.deepEqual(a.avvisi,[]);


// Sportbet: testi reali prodotti da Tesseract (stessi parametri dell'app) sullo
// screenshot "Mie scommesse" del 25/09/2026. Tema scuro: l'app inverte i
// colori prima dell'OCR; il secondo testo e' la lettura SENZA inversione, in
// cui gli importi sono illeggibili.
const sportbetInvertito=`07:44 @ — N                             e Riu
oy a                     sportbet.it                     @
=                          Sportber               a
=
= [WEE (sporese             3121€
LIVE 0  IN CORSO 0  CONCLUSE ES  CASHOUT 0
Multipla (2)                                  Dettagli -
Evento                      SEGNO           QUOTA ESITO
#2 Internazionale | UEFA Nations League | 25/09/2026 20:45
Svezia - Romania 2-1
HT: 2:1
x2                                        1                1.44      )
#2 Internazionale | UEFA Nations League | 25/09/2026 20:45
Turchia - Francia 0-1
Cards: 4:3 | Corners: 5:3 | HT: 0:0
x2                                        2)                1.35      )
Importo              Bonus                Quota totale
9,00 €              0,04 €              1.94                  Vinita 17,54 €
Multipla              Ref. DFO7EA091931B226C50A | 25/09/2026 20:42
Multipla (5)                                 Dettagli +
Importo                      Quota totale
100 €                 21.99                    Perdente 23,09 €
Multipla                     Ref. DFO7EA09193211DA6903 | 25/09/2026 19:59
® 0
Prematch      Live      Carrello Mie scommesse Casino
+                                    .
<          >         ®        & =          :`;

const sportbetNonInvertito=`07:44 @ — N                             © Abul
wy a                     sportbet.it                     @)
=                          Sportber               a
=
=      Ricarica     Cla t LLL             31.21€
LIVE 0  IN CORSO 0  CONCLUSE Eo  CASHOUT ©
Multipla (2)                                  Dettagli -
Evento                      SEGNO           QUOTA ESITO
#2 Internazionale | UEFA Nations League | 25/09/2026 20:45
Svezia - Romania 2-1
HT: 2:1
1x2                                        1                1.44      ®
#2 Internazionale | UEFA Nations League | 25/09/2026 20:45
Turchia - Francia 0-1
Cards: 4:3 | Corners: 5:3 | HT: 0:0
x2                                        2                135      ®
Importo              Bonus                Quota totale
so0e  ovhe 1%              Vincita 17,54 €
Multipla              Ref. DFO7EA091931B226C50A | 25/09/2026 20:42
Multipla (5)                                 Dettagli +
Importo                      Quota totale
T00€                  2199                   ‘Perdente 2309 €
Multipla                     Ref. DFO7EA09193211DA6903 | 25/09/2026 19:59
Prematch      Live  Carrello Mie scommesse Casino
+                                    .
<          >         ®        & =          :`;

assert.equal(P.riconosciBookmaker(sportbetInvertito),"Sportbet");
assert.equal(P.riconosciBookmaker(barca),"Sportium");
assert.equal(P.parseRicevuta(barca).bookmaker,"Sportium");
assert.equal(P.parseRicevuta(barca).eventi[0].mercato,"MULTIGOAL 3-5 CASA + MULTIGOAL 0-1 OSPITE");

const sb=P.parseRicevuta(sportbetInvertito);
assert.equal(sb.bookmaker,"Sportbet");
assert.equal(sb.ticketId,"DF07EA091931B226C50A");
assert.equal(sb.data,"2026-09-25");
assert.equal(sb.orarioIngresso,"2026-09-25T20:42");
assert.equal(sb.quota,1.94);
assert.equal(sb.stake,9);
assert.equal(sb.bonus,0.04);
assert.equal(sb.esitoBook,"vinta");
assert.equal(sb.tipoSchedina,"MULTIPLA");
assert.deepEqual(sb.eventi.map(x=>[x.evento,x.mercato,x.quota]),[
  ["Svezia vs Romania","1",1.44],
  ["Turchia vs Francia","2",1.35]
]);
assert.deepEqual(sb.avvisi,["Nello screenshot ci sono 2 schedine: letta solo quella con i dettagli aperti"]);

// Senza inversione l'importo non si legge: deve dirlo, non inventarlo.
const sbGrezzo=P.parseRicevuta(sportbetNonInvertito);
assert.equal(sbGrezzo.stake,null);
assert.ok(sbGrezzo.avvisi.includes("Importo non riconosciuto"));
assert.equal(sbGrezzo.quota,1.94);

// Importi e quote senza separatore: Sportbet usa sempre due decimali.
const compatto=P.parseSportbet(`Singola (1) Dettagli -
Evento SEGNO QUOTA ESITO
Serie A | 27/09/2026 15:00
Juventus - Milan
1X2 X 320
Importo Quota totale
500 € 320 Vincita potenziale 1600 €
Singola Ref. DF07EA0000000000ABCD | 27/09/2026 14:10`);
assert.equal(compatto.stake,5);
assert.equal(compatto.quota,3.2);
assert.equal(compatto.esitoBook,"aperta");
assert.equal(compatto.vincitaPotenziale,16);
assert.equal(compatto.tipoSchedina,"SINGOLA");
assert.deepEqual(compatto.eventi.map(x=>[x.evento,x.mercato]),[["Juventus vs Milan","X"]]);
assert.deepEqual(compatto.avvisi,[]);

// Schedina chiusa (senza dettagli) sopra quella aperta: va letta la seconda.
const dueSchedine=P.parseSportbet(`Multipla (5) Dettagli +
Importo Quota totale
1,00 € 21.99 Perdente 23,09 €
Multipla Ref. DF07EA09193211DA6903 | 25/09/2026 19:59
`+sportbetInvertito.split("\n").slice(6,20).join("\n"));
assert.equal(dueSchedine.ticketId,"DF07EA091931B226C50A");
assert.equal(dueSchedine.eventi.length,2);

// Schedina vera del 07/10/2026 (multipla con selezioni ancora aperte): testo
// OCR dell'immagine ingrandita 2x. Sportbet aggiunge la colonna "Selezioni
// aperte 2/2", cosi' "Importo" non e' a inizio riga e i valori stanno su
// tre righe; "Vincita" esce come "\\/jncita". Prima: importo non letto e
// primo mercato letto "1X + UNDER/OVER 3.5 1X + UN" (classificato Over!).
const aperte=P.parseRicevuta(`13:48 © —                                            BAR
—                             Spartbet                -
=
= [WE (sportier             94,02 €
LIVE 0  IN CORSO @  CONCLUSE 7  CASHOUT Q
Multipla (2)                                  Dettagli -
Evento                        SEGNO            QUOTA ESITO

«2 Brasile | Brasileiro Serie A | 08/10/2026 00:30

Internacional - Corinthians

1X + Under/Over 3.5                     1X + UN              1.64       o

&2 Brasile | Brasileiro Serie A | 08/10/2026 01:00

EC Vitoria BA - Chapecoense SC

1X2                                            1                  1.52       ®
Selezioni  Importo Bonus    Quota
aperte                totale \\/jncita potenziale 25,00 €

10,00 € 0,07 €

2/2                           2.49

Questo ticket puo essere riscosso prima          Ce |      Cashout

della sua chiusura, per una cifra di 1,99 €                       1,99 €
Multipla                    Ref. DFO7EAOA083IDCOIBEOC | 07/10/2026 13:48

® Esitovincente         Esito perdente  @ Esito in corsc
@    ®     4     od
Prematch      Live      Carrello Mie scommesse Casino
`);
assert.equal(aperte.bookmaker,"Sportbet");
assert.equal(aperte.stake,10);
assert.equal(aperte.bonus,0.07);
assert.equal(aperte.quota,2.49);
assert.equal(aperte.esitoBook,"aperta");
assert.equal(aperte.vincitaPotenziale,25);
assert.equal(aperte.orarioIngresso,"2026-10-07T13:48");
assert.deepEqual(aperte.eventi.map(x=>[x.evento,x.mercato,x.quota]),[
  ["Internacional vs Corinthians","1X + UNDER 3.5",1.64],
  ["EC Vitoria BA vs Chapecoense SC","1",1.52]
]);
// Limite noto: l'OCR legge "9" come "O" nel Ref. (vero: DF07EA0A0831DC91BE0C).
assert.equal(aperte.ticketId,"DF07EA0A0831DC01BE0C");

console.log("receipt-parser: ok");
