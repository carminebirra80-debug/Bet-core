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
    quota:3,stake:1,bookmaker:"Sportbet",origine:"CODICI",codice_schedina:"444444",tipo_schedina:"MULTIPLA"}
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
  if(u.includes("/rest/v1/veggente_")) return risposta([]);
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

  // Orari in ora italiana (ESPN li da' in UTC).
  assert.equal(sis.gambe[0].ora,"2026-10-18T15:00:00+02:00");
  console.log("live-funzione: ok");
})().catch(e=>{console.error(e);process.exitCode=1;});
