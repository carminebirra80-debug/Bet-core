"use strict";

// Funzione Supabase "live" provata da capo a fondo, senza rete: database e
// tabellone ESPN sono finti. Serve soprattutto per i sistemi dei codici
// (18/10/2026): con "Sistema (N)" nella nota una gamba persa NON deve far
// proporre "persa", mentre una multipla normale si'.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const {stripTypeScriptTypes}=require("node:module");

process.removeAllListeners("warning"); // stripTypeScriptTypes e' sperimentale
const sorgente=stripTypeScriptTypes(fs.readFileSync(require.resolve("../supabase/functions/live/index.ts"),"utf8"));

function partita(id,casa,ospite,gc,go,lega){
  return {id:String(id),date:"2026-10-18T13:00Z",season:{slug:"2026-27-"+(lega||"italian-serie-a")},
    status:{type:{name:"STATUS_FULL_TIME",state:"post",completed:true},displayClock:"90'+4'"},
    competitions:[{competitors:[
      {homeAway:"home",team:{displayName:casa},score:String(gc)},
      {homeAway:"away",team:{displayName:ospite},score:String(go)}]}]};
}
const espn={events:[
  partita(1,"Fiorentina","Como",1,1),          // GG vinta
  partita(2,"Juventus","Lazio",0,0),           // 1 persa
  partita(3,"Milan","Atalanta",2,1),           // 1 + GG vinta
  partita(4,"Udinese","Lecce",2,0),            // 1 vinta
  partita(5,"Panetolikos","Olympiacos",0,2,"greek-super-league"),
  partita(6,"Brighton & Hove Albion","Crystal Palace",3,0,"english-premier-league"),
  partita(7,"Olympiacos","Panathinaikos",1,0,"greek-super-league")
]};
const picks=[
  // Codice con ticket letto: sistema su 3 partite, una persa.
  {id:"a",legacy_id:"1",data:"2026-10-18",evento:"Codice 111111",mercato:"MULTIPLA",nota:"Sistema (3)",
    gambe:[{evento:"Fiorentina vs Como",mercato:"GG"},{evento:"Juventus vs Lazio",mercato:"1"},{evento:"Milan vs Atalanta",mercato:"1 + GG"}],
    quota:5,stake:2,bookmaker:"Sportbet",origine:"CODICI",codice_schedina:"111111",tipo_schedina:"MULTIPLA"},
  // Codice normale (multipla): la stessa gamba persa la fa perdere.
  {id:"b",legacy_id:"2",data:"2026-10-18",evento:"Codice 222222",mercato:"MULTIPLA",nota:"",
    gambe:[{evento:"Udinese vs Lecce",mercato:"1"},{evento:"Juventus vs Lazio",mercato:"1"}],
    quota:3,stake:1,bookmaker:"Sportbet",origine:"CODICI",codice_schedina:"222222",tipo_schedina:"MULTIPLA"},
  // Sistema con tutte le gambe vinte: comunque nessuna proposta, solo l'avviso.
  {id:"c",legacy_id:"3",data:"2026-10-18",evento:"Codice 333333",mercato:"MULTIPLA",nota:"Sistema (2) · bonus",
    gambe:[{evento:"Fiorentina vs Como",mercato:"GG"},{evento:"Udinese vs Lecce",mercato:"1"}],
    quota:4,stake:1,bookmaker:"Sportbet",origine:"CODICI",codice_schedina:"333333",tipo_schedina:"MULTIPLA"},
  // Codice 948761/331860 del 18/10: "Olympiakos" sul ticket ("Olympiacos" su
  // ESPN) e "V/O 2,5 OVER" letto male dall'OCR.
  {id:"d",legacy_id:"4",data:"2026-10-18",evento:"Codice 444444",mercato:"MULTIPLA",nota:"",
    gambe:[{evento:"Panetolikos FC vs Olympiakos",mercato:"2"},{evento:"Brighton vs Crystal Palace",mercato:"V/O 2,5 OVER"},
      {evento:"Brighton vs Crystal Palace",mercato:"UFO 25 OVER"}],
    quota:3,stake:1,bookmaker:"Sportbet",origine:"CODICI",codice_schedina:"444444",tipo_schedina:"MULTIPLA"},
  // Codice 320296 del 20/10: gol di una squadra, valutabili col risultato.
  // I tiri in porta no.
  {id:"e",legacy_id:"5",data:"2026-10-18",evento:"Codice 555555",mercato:"MULTIPLA",nota:"",
    gambe:[{evento:"Fiorentina vs Como",mercato:"MULTIGOL 1-2 OSPITE SI"},{evento:"Milan vs Atalanta",mercato:"OVER 1.5 CASA"},
      {evento:"Juventus vs Lazio",mercato:"UJO TIRI IN PORTA TEAM 2 OVER"}],
    quota:9,stake:1,bookmaker:"Sportbet",origine:"CODICI",codice_schedina:"555555",tipo_schedina:"MULTIPLA"},
  // Raddoppio del Veggente giocato in variante (20/10): conta la ricevuta.
  {id:"f",legacy_id:"6",data:"2026-10-18",evento:"Multipla · 1 gambe",mercato:"MULTIPLA",nota:"",
    gambe:[{evento:"Udinese vs Lecce",mercato:"1"}],
    quota:1.5,stake:5,bookmaker:"Sportbet",origine:"VEGGENTE",tipo_schedina:"MULTIPLA"},
  // Raddoppio del 20/10: il lettore ha troncato "1 Handicap (-1)" in "1",
  // quota vicina a quella della proposta: vale la proposta.
  {id:"g",legacy_id:"7",data:"2026-10-18",evento:"Multipla · 1 gambe",mercato:"MULTIPLA",nota:"",
    gambe:[{evento:"Udinese vs Lecce",mercato:"1",quota:1.32},{evento:"Milan vs Atalanta",mercato:"",quota:null}],
    quota:1.32,stake:5,bookmaker:"Sportbet",origine:"VEGGENTE",tipo_schedina:"MULTIPLA"},
  // Variante vera: "1" a 1.49 contro "1 + Over 2.5" a 1.95 della proposta.
  {id:"h",legacy_id:"8",data:"2026-10-18",evento:"Multipla · 1 gambe",mercato:"MULTIPLA",nota:"",
    gambe:[{evento:"Milan vs Atalanta",mercato:"1",quota:1.49}],
    quota:1.49,stake:5,bookmaker:"Sportbet",origine:"VEGGENTE",tipo_schedina:"MULTIPLA"},
  // Codice giocato il 18 con partite anche il 20 (23/10/2026: 512302 e
  // 282731 con partite di sabato e domenica): il Live cerca anche quel giorno.
  {id:"i",legacy_id:"9",data:"2026-10-18",evento:"Codice 999999",mercato:"MULTIPLA",nota:"",
    gambe:[{evento:"Fiorentina vs Como",mercato:"GG",data:"2026-10-18"},{evento:"Udinese vs Lecce",mercato:"1",data:"2026-10-20"}],
    quota:2,stake:1,bookmaker:"Sportbet",origine:"CODICI",codice_schedina:"999999",tipo_schedina:"MULTIPLA"}
];

const chiamate=[];
async function fetchFinto(url,init){
  const u=String(url);
  chiamate.push(u);
  const risposta=(dati)=>new Response(dati===undefined?"":JSON.stringify(dati),{status:200});
  if(u.includes("rpc/live_segreto_prova")) return risposta("segreto");
  if(u.includes("/rest/v1/picks?")){
    assert.ok(u.includes("nota"),"la funzione deve leggere la nota delle giocate");
    return risposta(picks);
  }
  if(u.includes("/rest/v1/veggente_proposte_gambe")) return risposta([{proposta_id:900,giocata_id:7},{proposta_id:901,giocata_id:8},{proposta_id:901,giocata_id:10},{proposta_id:902,giocata_id:9}]);
  if(u.includes("/rest/v1/veggente_proposte")) return risposta([{id:900,pick_id:"f",colonne:null},{id:901,pick_id:"g",colonne:null},{id:902,pick_id:"h",colonne:null}]);
  if(u.includes("/rest/v1/veggente_giocate")) return risposta([{id:7,partita:"Udinese - Lecce",mercato:"2 + Multigol 2-5"},
    {id:8,partita:"Udinese - Lecce",mercato:"1 Handicap (-1)",quota_sportbet:"1.45"},
    {id:9,partita:"Milan - Atalanta",mercato:"1 + Over 2.5",quota_sportbet:"1.95"},
    {id:10,partita:"Milan - Atalanta",mercato:"GG"}]);
  if(u.includes("/rest/v1/live_cache")) return init&&init.method==="POST" ? risposta() : risposta([]);
  if(u.startsWith("https://site.api.espn.com/")) return risposta(espn);
  throw new Error("chiamata inattesa: "+u);
}

let gestore=null;
const sandbox={Deno:{env:{get:()=>"https://finto.supabase.co"},serve:h=>{gestore=h;}},
  fetch:fetchFinto,Response,Request,URL,Intl,Date,JSON,Math,Number,String,Object,Array,RegExp,Set,Map,Promise,
  isNaN,Infinity,encodeURIComponent,console};
vm.runInNewContext(sorgente,sandbox,{filename:"live-index.js"});
assert.ok(gestore,"Deno.serve non chiamato");

(async()=>{
  const req=new Request("https://finto.supabase.co/functions/v1/live?utente=67f50b6a-bac2-4e51-9f92-7a8fee648293",
    {method:"POST",headers:{"x-live-prova":"segreto"},body:"{}"});
  const r=await gestore(req);
  const j=await r.json();
  assert.equal(r.status,200,JSON.stringify(j));
  assert.equal(j.fonte,"ESPN");
  const per=Object.fromEntries(j.schedine.map(s=>[s.legacy_id,s]));

  const sis=per["1"];
  assert.deepEqual(sis.gambe.map(g=>g.stato),["vinta","persa","vinta"],"stati delle gambe del sistema");
  assert.equal(sis.proposta,null,"sistema con una gamba persa: nessuna proposta di esito");
  assert.equal(sis.stato,"in_corso","il sistema non risulta perso");
  assert.equal(sis.sistema,true);
  assert.match(sis.motivo,/Sistema: 1 gamba persa su 3/);

  const mult=per["2"];
  assert.equal(mult.proposta,"persa","una multipla con una gamba persa e' persa");
  assert.equal(mult.stato,"persa");

  const tutto=per["3"];
  assert.equal(tutto.proposta,null,"sistema vinto: niente 'vinta' automatica, l'importo dipende dalle combinazioni");
  assert.match(tutto.motivo,/Sistema: 0 gambe perse su 2/);

  const tol=per["4"];
  assert.equal(tol.gambe.find(g=>/Panetolikos/.test(g.partita)).abbinata.ospite,"Olympiacos","una lettera di differenza: partita trovata");
  assert.notEqual(tol.gambe.find(g=>/Panetolikos/.test(g.partita)).abbinata.casa,"Olympiacos","non scambiata con un'altra partita dell'Olympiacos");
  assert.deepEqual(tol.gambe.map(g=>g.mercato).sort(),["2","Over 2.5","Over 2.5"],"V/O 2,5 e UFO 25 sono U/O 2.5");
  assert.equal(tol.proposta,"vinta");

  const sq=per["5"];
  assert.deepEqual(sq.gambe.map(g=>g.mercato),["Multigol 1-2 ospite","Over 1.5 casa","UJO TIRI IN PORTA TEAM 2 OVER"],"mercati di una squadra");
  assert.deepEqual(sq.gambe.map(g=>g.stato),["vinta","vinta","non_seguita"],"gol della squadra dal risultato; tiri in porta non seguiti");

  const vg=per["6"];
  assert.equal(vg.gambe.length,1);
  assert.equal(vg.gambe[0].mercato,"1","conta il mercato giocato (ricevuta), non quello della proposta");
  assert.equal(vg.gambe[0].stato,"vinta");
  assert.equal(vg.proposta,"vinta");
  const tronc=per["7"];
  assert.equal(tronc.gambe.find(g=>/Udinese/.test(g.partita)).mercato,"1 Handicap (-1)","mercato troncato dal lettore: vale quello intero della proposta");
  assert.equal(tronc.gambe.find(g=>/Milan/.test(g.partita)).mercato,"Goal","mercato non letto: vale quello della proposta");
  assert.equal(tronc.gambe.find(g=>/Udinese/.test(g.partita)).stato,"non_seguita","l'handicap non si valuta: niente 'vinta' sul solo segno");
  assert.equal(tronc.proposta,null);
  const variante=per["8"];
  assert.equal(variante.gambe[0].mercato,"1","quota molto diversa: e' una variante, vale la ricevuta");

  const espnGiorni=chiamate.filter(u=>u.startsWith("https://site.api.espn.com/")).map(u=>u.match(/dates=(\d+)/)[1]).sort();
  assert.ok(espnGiorni.includes("20261020"),"partita del 20 in un codice del 18: ESPN va letto anche il 20 ("+espnGiorni.join(",")+")");
  assert.ok(espnGiorni.includes("20261017")&&espnGiorni.includes("20261018"),"restano i giorni della giocata");
  assert.equal(per["9"].gambe.length,2);

  // Orari in ora italiana (ESPN li da' in UTC).
  assert.equal(sis.gambe[0].ora,"2026-10-18T15:00:00+02:00");
  console.log("live-funzione: ok");
})().catch(e=>{console.error(e);process.exitCode=1;});
