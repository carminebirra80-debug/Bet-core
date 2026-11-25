"use strict";

// 25/11/2026: gambe sui giocatori ("segna", "segna o assist", "segna o palo o
// suo sostituto") valutate dal riepilogo ESPN, e combo "Multigol casa +
// Multigol ospite" valutate dal risultato. Senza rete: tutto finto.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const {stripTypeScriptTypes}=require("node:module");

process.removeAllListeners("warning");
const sorgente=stripTypeScriptTypes(fs.readFileSync(require.resolve("../supabase/functions/live/index.ts"),"utf8"));

function partita(id,casa,ospite,gc,go,stato){
  const nome=stato||"STATUS_FULL_TIME";
  return {id:String(id),date:"2026-11-25T20:00Z",season:{slug:"2026-27-uefa-champions"},
    status:{type:{name:nome,state:nome==="STATUS_FULL_TIME"?"post":"in",completed:nome==="STATUS_FULL_TIME"},displayClock:"60'"},
    competitions:[{competitors:[
      {homeAway:"home",team:{displayName:casa},score:String(gc)},
      {homeAway:"away",team:{displayName:ospite},score:String(go)}]}]};
}
const espn={events:[
  partita(11,"Internazionale","VfB Stuttgart",2,1),
  partita(12,"Lille","Bayern Munich",1,2),
  partita(13,"Sporting CP","Manchester United",2,1),
  partita(14,"Club Brugge","Liverpool",1,3),
  partita(15,"Paris Saint-Germain","AS Roma",3,1),
  partita(16,"Atlético Madrid","Viking FK",1,0,"STATUS_SECOND_HALF")
]};
const gol=(n,p,ass,extra)=>Object.assign({scoringPlay:true,period:{number:p},type:{text:"Goal"},participants:[{athlete:{displayName:n}}].concat(ass?[{athlete:{displayName:ass}}]:[])},extra||{});
const legno=(n,p)=>({text:n+" (X) hits the right post with a right footed shot.",play:{type:{type:"shot-hit-woodwork"},period:{number:p},participants:[{athlete:{displayName:n}}]}});
const cambio=(dentro,fuori,p)=>({text:"Substitution. "+dentro+" replaces "+fuori+".",play:{type:{type:"substitution"},period:{number:p},participants:[{athlete:{displayName:dentro}},{athlete:{displayName:fuori}}]}});
const rosa=(...g)=>[{roster:g.map(([n,gioca])=>({athlete:{displayName:n},starter:gioca,subbedIn:false}))}];
const fin={header:{competitions:[{status:{type:{completed:true}}}]}};
const riepiloghi={
  // Demirovic non segna ma colpisce il palo: "segna o palo" presa.
  11:{...fin,keyEvents:[gol("Lautaro Martínez",1),gol("Marcus Thuram",2),gol("Deniz Undav",2)],commentary:[legno("Ermedin Demirovic",2)],
    rosters:rosa(["Ermedin Demirovic",true],["Lautaro Martínez",true])},
  // Brown fa l'assist: "segna o assist" presa.
  12:{...fin,keyEvents:[gol("Musiala",1,"Nathaniel Brown"),gol("Lennart Karl",2),gol("Olivier Giroud",2)],commentary:[],
    rosters:rosa(["Nathaniel Brown",true])},
  // Suarez esce, il sostituto segna: "o suo sostituto" presa.
  13:{...fin,keyEvents:[gol("Geovany Quenda",2),gol("Bruno Fernandes",1),gol("Conrad Harder",2)],commentary:[cambio("Conrad Harder","Luis Suárez",2)],
    rosters:rosa(["Luis Suárez",true],["Conrad Harder",false])},
  // Tresoldi gioca e non fa niente; il suo gol in autorete non conta.
  14:{...fin,keyEvents:[gol("Nicolò Tresoldi",1,null,{ownGoal:true})],commentary:[],rosters:rosa(["Nicolò Tresoldi",true])},
  // Dembele in panchina senza entrare: forse rimborso, da verificare.
  15:{...fin,keyEvents:[gol("Vitinha",1)],commentary:[],rosters:rosa(["Ousmane Dembélé",false])},
  // In corso: Griezmann non ha ancora segnato.
  16:{header:{competitions:[{status:{type:{completed:false}}}]},keyEvents:[gol("Julián Álvarez",1)],commentary:[],rosters:rosa(["Antoine Griezmann",true])}
};
const picks=[
  {id:"a",legacy_id:"1",data:"2026-11-25",evento:"Multipla (codice)",mercato:"MULTIPLA",nota:"",
    gambe:[{data:"2026-11-25",evento:"Inter vs Stoccarda",mercato:"SEGNA o PALO o SUO SOSTITUTO (INC.TS.) Demirovic, Ermedin (Stoccarda) SI"},
      {data:"2026-11-25",evento:"Lille vs Bayern Monaco",mercato:"Segna o Assist DUO Brown, Nathaniel (Bayern Monaco)"},
      {data:"2026-11-25",evento:"Sporting Lisbona vs Manchester United",mercato:"Suarez segna o palo o suo sostituto (inc. TS)"}],
    quota:20,stake:1,bookmaker:"Sportbet",origine:"CODICI",tipo_schedina:"MULTIPLA"},
  {id:"b",legacy_id:"2",data:"2026-11-25",evento:"Multipla (codice)",mercato:"MULTIPLA",nota:"",
    gambe:[{data:"2026-11-25",evento:"Club Brugge vs Liverpool",mercato:"Tresoldi segna o palo (inc. TS)"},
      {data:"2026-11-25",evento:"PSG vs Roma",mercato:"Dembele segna"}],
    quota:5,stake:1,bookmaker:"Sportbet",origine:"CODICI",tipo_schedina:"MULTIPLA"},
  {id:"c",legacy_id:"3",data:"2026-11-25",evento:"Multipla (codice)",mercato:"MULTIPLA",nota:"",
    gambe:[{data:"2026-11-25",evento:"PSG vs Roma",mercato:"MultiGol 2-5 Casa + MultiGol 1-3 Ospite SI"},
      {data:"2026-11-25",evento:"Club Brugge vs Liverpool",mercato:"Multigol 1-3 casa + Multigol 2-4 ospite"},
      {data:"2026-11-25",evento:"Inter vs Stoccarda",mercato:"MultiGol 2-4 Casa + MultiGol 2-3 Ospite"}],
    quota:8,stake:1,bookmaker:"Sportbet",origine:"CODICI",tipo_schedina:"MULTIPLA"},
  {id:"d",legacy_id:"4",data:"2026-11-25",evento:"Multipla (codice)",mercato:"MULTIPLA",nota:"",
    gambe:[{data:"2026-11-25",evento:"Atletico Madrid vs Viking",mercato:"Griezmann segna"},
      {data:"2026-11-25",evento:"Inter vs Stoccarda",mercato:"Primo marcatore Lautaro"}],
    quota:5,stake:1,bookmaker:"Sportbet",origine:"CODICI",tipo_schedina:"MULTIPLA"}
];

const chiamate=[];
async function fetchFinto(url,init){
  const u=String(url);
  chiamate.push(u);
  const risposta=(dati)=>new Response(dati===undefined?"":JSON.stringify(dati),{status:200});
  if(u.includes("rpc/live_segreto_prova")) return risposta("segreto");
  if(u.includes("/rest/v1/picks?")) return risposta(picks);
  if(u.includes("/rest/v1/veggente_")) return risposta([]);
  if(u.includes("/rest/v1/live_cache")) return init&&init.method==="POST" ? risposta() : risposta([]);
  const m=u.match(/summary\?event=(\d+)/);
  if(m) return risposta(riepiloghi[m[1]]||{});
  if(u.startsWith("https://site.api.espn.com/")) return risposta(espn);
  throw new Error("chiamata inattesa: "+u);
}
let gestore=null;
const sandbox={Deno:{env:{get:()=>"https://finto.supabase.co"},serve:h=>{gestore=h;}},
  fetch:fetchFinto,Response,Request,URL,Intl,Date,JSON,Math,Number,String,Object,Array,RegExp,Set,Map,Promise,
  isNaN,Infinity,encodeURIComponent,console};
vm.runInNewContext(sorgente,sandbox,{filename:"live-index.js"});

(async()=>{
  const req=new Request("https://finto.supabase.co/functions/v1/live?utente=67f50b6a-bac2-4e51-9f92-7a8fee648293",
    {method:"POST",headers:{"x-live-prova":"segreto"},body:"{}"});
  const r=await gestore(req);
  const j=await r.json();
  assert.equal(r.status,200,JSON.stringify(j));
  const per=Object.fromEntries(j.schedine.map(s=>[s.legacy_id,s]));
  const st=(s,re)=>s.gambe.find(g=>re.test(g.partita));

  const a=per["1"];
  assert.equal(st(a,/Inter/).stato,"vinta","Demirovic: palo nel secondo tempo");
  assert.match(st(a,/Inter/).mercato,/Demirovic Ermedin segna o palo \(o sostituto\)/);
  assert.equal(st(a,/Lille/).stato,"vinta","Brown: assist");
  assert.equal(st(a,/Sporting/).stato,"vinta","sostituto di Suarez a segno");
  assert.equal(a.proposta,"vinta");

  const b=per["2"];
  assert.equal(st(b,/Brugge/).stato,"persa","Tresoldi ha giocato, solo un autogol");
  assert.equal(st(b,/PSG/).stato,"da_verificare","Dembele non e' entrato: niente persa automatica");
  assert.equal(b.proposta,"persa");

  const c=per["3"];
  assert.deepEqual(c.gambe.map(g=>g.mercato),["Multigol 2-5 casa + Multigol 1-3 ospite","Multigol 1-3 casa + Multigol 2-4 ospite","Multigol 2-4 casa + Multigol 2-3 ospite"]);
  assert.deepEqual(c.gambe.map(g=>g.stato),["vinta","vinta","persa"],"PSG 3-1 si, Brugge 1-3 si, Inter 2-1 no (ospite 1)");

  const d=per["4"];
  assert.equal(st(d,/Atletico/).stato,"non_passa","in corso, non ha ancora segnato");
  assert.equal(st(d,/Inter/).stato,"non_seguita","primo marcatore: non seguito");

  assert.equal(chiamate.filter(u=>/summary\?event=11/.test(u)).length,1,"un solo riepilogo per partita");
  assert.ok(!chiamate.some(u=>/summary\?event=99/.test(u)));
  console.log("live-giocatori: ok");
})().catch(e=>{console.error(e);process.exitCode=1;});
