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

console.log("receipt-parser: ok");
