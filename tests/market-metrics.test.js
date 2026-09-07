"use strict";

const assert=require("node:assert/strict");
const metrics=require("../market-metrics.js");

const base={data:"2026-09-07",tipster:"io",evento:"A - B",mercato:"1",famigliaMercato:"ESITO_1X2",
  faseIngresso:"PRE",probabilitaStimata:.70,probabilitaTimestamp:"2026-09-07T10:00:00Z",quota:2,
  quotaChiusura:1.90,statoCore:"ufficiale",osservata:false,esito:"vinta",profitto:0};

const righe=[
  {...base,id:1,stake:2},
  // Stessa ipotesi e stessa fase: due ticket economici, una sola osservazione.
  {...base,id:2,stake:1,profitto:1},
  // Una PASS/osservata a stake zero deve entrare nelle metriche probabilistiche.
  {...base,id:3,evento:"C - D",osservata:true,statoCore:"scartata",stake:0,esito:"persa",probabilitaStimata:.40,quota:2.5,quotaChiusura:null},
  // PRE e LIVE non possono essere accorpati.
  {...base,id:4,faseIngresso:"LIVE",stake:1,esito:"persa",probabilitaStimata:.30,quota:3},
  // Un push conta nella copertura, ma non nei proper scoring rules.
  {...base,id:5,evento:"E - F",stake:1,esito:"rimborsata",probabilitaStimata:.60,quota:1.8},
  // Probabilità senza timestamp: dato mancante esplicito, niente score.
  {...base,id:6,evento:"G - H",stake:0,osservata:true,statoCore:"scartata",esito:"persa",probabilitaStimata:.45,probabilitaTimestamp:""}
];

const risultato=metrics.calcola(righe);
const pre=risultato.find(x=>x.famiglia==="ESITO_1X2"&&x.fase==="PRE");
const live=risultato.find(x=>x.famiglia==="ESITO_1X2"&&x.fase==="LIVE");

assert.equal(metrics.VERSIONE,"v0.2");
assert.equal(pre.n,4);
assert.equal(pre.scoreN,2);
assert.equal(pre.osservate,2);
assert.equal(pre.rimborsate,1);
assert.equal(pre.missingTimestamp,1);
assert.equal(pre.stake,4);
assert.ok(Math.abs(pre.brier-.125)<1e-12);
assert.ok(Math.abs(pre.marketBrier-.205)<1e-12);
assert.ok(Math.abs(pre.shrinkBrier-.16)<1e-12);
// L'esito esplicito vinta vale 1 anche se il profitto del primo ticket e' 0.
assert.equal(pre.vinte,1);
assert.equal(pre.perse,2);

assert.equal(live.n,1);
assert.equal(live.scoreN,1);
assert.ok(Math.abs(live.brier-.09)<1e-12);
assert.ok(Math.abs(live.logLoss-(-Math.log(.7)))<1e-12);

console.log("market-metrics: ok");
