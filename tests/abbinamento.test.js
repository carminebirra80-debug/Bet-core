"use strict";

// Abbinamento automatico ricevuta -> proposta del Veggente. Sportbet scrive
// le partite come "Casa vs Trasferta" con nomi diversi da quelli del
// Veggente: l'abbinamento deve reggere a queste differenze senza scambiare
// una proposta per un'altra.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");

const html=fs.readFileSync(require.resolve("../index.html"),"utf8");
function estrai(nome){
  const inizio=html.indexOf("  function "+nome+"(");
  assert.ok(inizio>=0,"funzione non trovata: "+nome);
  const m=[null,html.slice(inizio,html.indexOf("\n  }\n",inizio)+4)];
  assert.ok(m,"funzione non trovata: "+nome);
  return m[1];
}
const sorgente=["chiaveEventoRicevuta","squadre","stessaPartita","abbinaProposta"].map(estrai).join("\n");
const ctx={};
vm.runInNewContext(sorgente+"\nthis.abbina=abbinaProposta;this.stessa=stessaPartita;",ctx);

const proposte=[
  {id:64,data:"2026-10-14",tipo:"RADDOPPIO",giocata:false,gambe:[
    {partita:"Roma - Real Madrid",mercato:"GG + Over 2.5"},{partita:"Manchester City - PSG",mercato:"GG"}]},
  {id:65,data:"2026-10-14",tipo:"MULTIPLA_5",giocata:false,gambe:[
    {partita:"Slovan Bratislava - Stoccarda",mercato:"2"},{partita:"Bodo/Glimt - Borussia Dortmund",mercato:"GG"},
    {partita:"Shakhtar Donetsk - AEK Atene",mercato:"1"}]},
  {id:66,data:"2026-10-14",tipo:"PERSONALE",giocata:false,gambe:[{partita:"Inter - Club Brugge",mercato:"1"}]}
];

// Nomi Sportbet diversi da quelli del Veggente.
assert.ok(ctx.stessa("Manchester City - PSG","Manchester City vs Paris Saint-Germain"));
assert.ok(ctx.stessa("Bodo/Glimt - Borussia Dortmund","Bodo Glimt vs Dortmund"));
assert.ok(!ctx.stessa("Roma - Real Madrid","Lazio vs Genoa"),"partite diverse non vanno abbinate");
// Una parola contenuta in un'altra non basta: "inter" non e' "internazionale".
assert.ok(!ctx.stessa("Inter - Club Brugge","Internacional vs Gremio"));

// Raddoppio giocato tale e quale.
let m=ctx.abbina([{evento:"AS Roma vs Real Madrid"},{evento:"Manchester City vs Paris SG"}],proposte);
assert.equal(m.proposta.id,64); assert.equal(m.esatta,true);

// Multipla con una gamba tolta: stessa proposta, ma variante.
m=ctx.abbina([{evento:"Slovan Bratislava vs VfB Stoccarda"},{evento:"Shakhtar vs AEK Atene"}],proposte);
assert.equal(m.proposta.id,65); assert.equal(m.esatta,false);

// Singola su una partita proposta.
m=ctx.abbina([{evento:"Inter vs Club Brugge"}],proposte);
assert.equal(m.proposta.id,66); assert.equal(m.esatta,true);

// Schedina senza partite del Veggente: nessuna proposta.
assert.equal(ctx.abbina([{evento:"Lazio vs Genoa"},{evento:"Napoli vs Lecce"}],proposte),null);

// Schedina che mescola una partita proposta e una no: non e' quella proposta.
assert.equal(ctx.abbina([{evento:"AS Roma vs Real Madrid"},{evento:"Napoli vs Lecce"}],proposte),null);

console.log("abbinamento: ok");
