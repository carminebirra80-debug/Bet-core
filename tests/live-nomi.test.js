"use strict";

// Abbinamento delle gambe al tabellone ESPN nella funzione "live".
// 20/10/2026: "Manchester City vs AEK Atene" e "Fenerbahge vs Slavia Praga"
// (Champions League) risultavano "partita non trovata" perche' ESPN scrive
// "AEK Athens" e "Slavia Prague"; "Bodø/Glimt" perdeva la ø.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const {stripTypeScriptTypes}=require("node:module");

process.removeAllListeners("warning");
const sorgente=stripTypeScriptTypes(fs.readFileSync(require.resolve("../supabase/functions/live/index.ts"),"utf8"))
  +"\n;globalThis.__prova={abbina,compatta};";
const sb={Deno:{env:{get:()=>"https://finto.supabase.co"},serve:()=>{}},fetch:()=>{},console};
vm.runInNewContext(sorgente,sb,{filename:"live-index.js"});
const {abbina,compatta}=sb.__prova;

function partita(id,casa,ospite){
  return compatta({id:String(id),date:"2026-10-20T19:00Z",season:{slug:"league-phase"},
    status:{type:{name:"STATUS_SCHEDULED",state:"pre",completed:false}},
    competitions:[{competitors:[
      {homeAway:"home",team:{displayName:casa},score:"0"},
      {homeAway:"away",team:{displayName:ospite},score:"0"}]}]});
}
// Nomi come li scrive ESPN il 20/10/2026.
const tabellone=[
  partita(1,"Fenerbahce","Slavia Prague"),
  partita(2,"Manchester City","AEK Athens"),
  partita(3,"Napoli","Bodo/Glimt"),
  partita(4,"Sabah FK","Borussia Dortmund"),
  partita(5,"Sparta Prague","Slovan Bratislava"),
  partita(6,"Panathinaikos","Olympiacos"),
];
function trovata(evento){ const f=abbina(evento,tabellone); return f ? f.casa+" - "+f.ospite : null; }

// Nomi del ticket Sportbet (con l'errore di lettura "Fenerbahge").
assert.equal(trovata("Fenerbahge vs Slavia Praga"),"Fenerbahce - Slavia Prague");
assert.equal(trovata("Manchester City vs AEK Atene"),"Manchester City - AEK Athens");
assert.equal(trovata("Napoli vs Bodø/Glimt"),"Napoli - Bodo/Glimt");
assert.equal(trovata("Napoli vs Bodo/Glimt"),"Napoli - Bodo/Glimt");
assert.equal(trovata("Sabah Masazir vs Borussia Dortmund"),"Sabah FK - Borussia Dortmund");
// La traduzione non deve confondere due squadre della stessa citta'.
assert.equal(trovata("Slavia Praga vs Slovan Bratislava"),null);
assert.equal(trovata("Panathinaikos vs AEK Atene"),null);

console.log("live-nomi: ok");
