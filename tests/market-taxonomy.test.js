"use strict";

const assert=require("node:assert/strict");
const T=require("../market-taxonomy.js");

function family(m){return T.classifica(m,"SINGOLA",[]).famiglia;}

assert.equal(family("1"),"ESITO_1X2");
assert.equal(family("X2"),"DOPPIA_CHANCE");
assert.equal(family("Over 2.5"),"TOTALI_GOL");
assert.equal(family("Goal"),"GOAL_NO_GOAL");
assert.equal(family("No Goal"),"GOAL_NO_GOAL");
assert.equal(family("Multigol 2-4"),"MULTIGOL");
assert.equal(family("Handicap 1 -1"),"HANDICAP");
assert.equal(family("Over 9.5 corner"),"CORNER");
assert.equal(family("Over 4.5 cartellini"),"CARTELLINI");
assert.equal(family("Yamal 1+ tiro in porta"),"PLAYER_PROP");

const arsenal=T.classifica("DC OUT + MG 2-4 | X2+ MULTIG","SINGOLA",[]);
assert.equal(arsenal.famiglia,"COMBO");
assert.equal(arsenal.selezione,"X2 + Multigol 2-4");
assert.deepEqual(arsenal.componenti.map(x=>x.famiglia),["DOPPIA_CHANCE","MULTIGOL"]);

const barca=T.classifica("MULTIGOAL 3-5 CASA + MULTIGOAL 0-1 OSPITE","SINGOLA",[]);
assert.equal(barca.famiglia,"COMBO");
assert.equal(barca.componenti.length,2);
assert.equal(barca.componenti[0].famiglia,"MULTIGOL_SQUADRA");
assert.equal(barca.componenti[1].ambito,"OSPITE");

const napoli=T.classifica("1x+ov1.5","SINGOLA",[]);
assert.equal(napoli.famiglia,"COMBO");
assert.equal(napoli.selezione,"1X + Over 1.5");

const roma=T.classifica("2 + Over 1.5","SINGOLA",[]);
assert.equal(roma.famiglia,"COMBO");
assert.equal(roma.selezione,"2 + Over 1.5");
assert.deepEqual(roma.componenti.map(x=>x.famiglia),["ESITO_1X2","TOTALI_GOL"]);

const multi=T.classifica("MULTIPLA","MULTIPLA",[
  {evento:"A",mercato:"1"},{evento:"B",mercato:"Over 2.5"}
]);
assert.equal(multi.famiglia,"MULTIPLA");
assert.equal(multi.componenti.length,2);
assert.equal(multi.componenti[1].famiglia,"TOTALI_GOL");

assert.equal(T.faseCampione(19).codice,"OSSERVAZIONE");
assert.equal(T.faseCampione(20).codice,"SEGNALE_PRELIMINARE");
assert.equal(T.faseCampione(50).codice,"EVIDENZA_UTILE");
assert.equal(T.faseCampione(100).codice,"BASE_SOLIDA");

console.log("market-taxonomy: ok");
