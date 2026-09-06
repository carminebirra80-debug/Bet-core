"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");

class Element {
  constructor(tag,document){
    this.tagName=String(tag).toUpperCase();
    this.ownerDocument=document;
    this.children=[];
    this.parentNode=null;
    this.style={};
    this.listeners={};
    this.attributes={};
    this.className="";
    this._text="";
  }
  appendChild(child){
    child.parentNode=this;
    this.children.push(child);
    return child;
  }
  removeChild(child){
    const i=this.children.indexOf(child);
    if(i>=0)this.children.splice(i,1);
    child.parentNode=null;
    return child;
  }
  replaceChild(next,old){
    const i=this.children.indexOf(old);
    if(i>=0){this.children[i]=next;next.parentNode=this;old.parentNode=null;}
    return old;
  }
  addEventListener(name,handler){this.listeners[name]=handler;}
  setAttribute(name,value){
    this.attributes[name]=String(value);
    if(name==="id")this.ownerDocument.ids[String(value)]=this;
    this[name]=value;
  }
  get firstChild(){return this.children[0]||null;}
  set textContent(value){this._text=String(value==null?"":value);}
  get textContent(){return this._text+this.children.map(x=>x.textContent).join("");}
  set innerHTML(value){this._text=String(value||"");this.children=[];}
  get innerHTML(){return this.textContent;}
}

class Document {
  constructor(){
    this.ids={};
    this.head=new Element("head",this);
    this.body=new Element("body",this);
    const app=new Element("div",this);
    app.setAttribute("id","app");
    this.body.appendChild(app);
  }
  createElement(tag){return new Element(tag,this);}
  getElementById(id){return this.ids[id]||null;}
}

const picks=[
  {id:1,data:"2026-08-31",tipster:"io",evento:"Roma - Lecce",mercato:"2 + Over 1.5",nota:"",quota:1.60,quotaChiusura:1.50,probabilitaStimata:.70,probabilitaTimestamp:"2026-08-31T12:00:00Z",quotaCheck:null,confidence:3,debrief:"ok",statoCore:"ufficiale",stake:2,osservata:false,bookmaker:"Sportium",faseIngresso:"PRE",classificazione:"BET PILOT",ticketId:"ABC1",orarioIngresso:"2026-08-31T12:10:00Z",tipoSchedina:"SINGOLA",gambe:[],esito:"vinta",profitto:1.20},
  {id:2,data:"2026-08-31",tipster:"io",evento:"Roma - Lecce",mercato:"2 + Over 1.5",nota:"",quota:1.55,quotaChiusura:1.50,probabilitaStimata:.70,probabilitaTimestamp:"2026-08-31T12:00:00Z",quotaCheck:null,confidence:3,debrief:"ok",statoCore:"ufficiale",stake:1,osservata:false,bookmaker:"Sportium",faseIngresso:"LIVE",classificazione:"BET PILOT",ticketId:"ABC2",orarioIngresso:"2026-08-31T12:11:00Z",tipoSchedina:"SINGOLA",gambe:[],esito:"vinta",profitto:.55},
  {id:3,data:"2026-08-31",tipster:"io",evento:"Barcellona vs Rayo",mercato:"MULTIGOAL 3-5 CASA + MULTIGOAL 0-1 OSPITE",nota:"",quota:2,quotaCheck:null,confidence:3,debrief:"",statoCore:"ufficiale",stake:5,osservata:false,bookmaker:"Sportium",faseIngresso:"PRE",classificazione:"PERSONALE",ticketId:"ABC3",orarioIngresso:"2026-08-31T21:09:00Z",tipoSchedina:"SINGOLA",gambe:[],esito:"aperta",profitto:0},
  {id:4,data:"2026-08-30",tipster:"io",evento:"Storico",mercato:"",nota:"",quota:2,quotaCheck:null,confidence:3,debrief:"",statoCore:"scartata",stake:0,osservata:true,bookmaker:"Sportium",faseIngresso:"PRE",classificazione:"SCARTATA",ticketId:"",orarioIngresso:"",tipoSchedina:"SINGOLA",gambe:[],esito:"persa",profitto:0}
];
const storage={
  "registro-tipster-v1":JSON.stringify({giocate:picks,versamenti:[{id:1,data:"2026-08-01",importo:10}],tetti:{sabato:10,domenica:10,feriali:5},budgetMese:200}),
  "registro-tipster-cloud-sync":"1",
  "registro-tipster-guided-v1":"1"
};
const localStorage={
  getItem:key=>Object.prototype.hasOwnProperty.call(storage,key)?storage[key]:null,
  setItem:(key,value)=>{storage[key]=String(value);},
  removeItem:key=>{delete storage[key];}
};
const document=new Document();
const calls=[];
const session={user:{id:"user-test",email:"test@example.com"}};
const db={
  auth:{
    getSession:async()=>({data:{session}}),
    getUser:async()=>({data:{user:session.user}}),
    onAuthStateChange:cb=>{setTimeout(()=>cb("INITIAL_SESSION",session),0);}
  },
  from:table=>({
    upsert:async(rows,options)=>{calls.push({azione:"upsert",table,rows,options});return {error:null};},
    select:()=>({eq:async()=>({error:null,count:picks.length})}),
    delete:()=>{calls.push({azione:"delete",table});return {eq:()=>({eq:async()=>({error:null})})};},
    update:()=>({eq:()=>({eq:async()=>({error:null})})})
  })
};
const window={
  BetCoreMarketTaxonomy:require("../market-taxonomy.js"),
  BetCoreReceiptParser:require("../receipt-parser.js"),
  supabase:{createClient:()=>db},
  addEventListener:()=>{},scrollTo:()=>{},confirm:()=>true,alert:()=>{}
};
const sandbox={window,document,localStorage,navigator:{},console,Date,Math,JSON,Object,Array,String,Number,
  Boolean,RegExp,Promise,Infinity,parseFloat,parseInt,isNaN,setTimeout,clearTimeout,URL,Blob};
window.window=window;window.document=document;window.localStorage=localStorage;window.navigator=sandbox.navigator;

const html=fs.readFileSync(require.resolve("../index.html"),"utf8");
const inline=html.slice(html.lastIndexOf("<script>")+8,html.lastIndexOf("</script>"));
vm.runInNewContext(inline,sandbox,{filename:"index-inline.js"});

(async()=>{
  await new Promise(resolve=>setTimeout(resolve,5));
  const app=document.getElementById("app");
  assert.equal(app.children[1].tagName,"NAV");
  clickNav(app,"Core");

  const text=app.textContent;
  for(const expected of ["Market Lab v0.1","Combo","1 chiuse · 1 aperte","CLV chiusura","Brier 0.090","Osservazione"]){
    assert.ok(text.includes(expected),"Testo UI mancante: "+expected);
  }
  assert.ok(!text.includes("Core — errore di visualizzazione"));

  clickNav(app,"Nuova");
  assert.ok(app.textContent.includes("Importa ricevuta Sportium"));
  // La probabilità stimata sta nel form principale accanto alla quota, non
  // più chiusa dentro "Analisi e dati secondari": è il campo su cui poggiano
  // Brier, log loss e calibrazione, e da secondario restava sempre vuoto.
  assert.ok(app.textContent.includes("Probabilità stimata"));
  assert.ok(!app.textContent.includes("Probabilità indipendente congelata"));
  // Senza probabilità la riga di supporto dice cosa si sta perdendo.
  assert.ok(app.textContent.includes("non sarà misurabile"));

  // Quota equa ed EV si aggiornano mentre si digita: e' il motivo per cui la
  // probabilita' dovrebbe smettere di restare vuota, quindi si verifica che il
  // calcolo arrivi a schermo, non solo che il campo esista.
  const inQuota=findElement(app,x=>x.tagName==="INPUT"&&x.attributes.placeholder==="2.30");
  const inProb=findElement(app,x=>x.tagName==="INPUT"&&x.attributes.placeholder==="52.0");
  assert.ok(inQuota&&inProb,"quota e probabilità devono stare entrambe nel form principale");

  inProb.value="50"; inProb.listeners.input.call(inProb);
  inQuota.value="2.30"; inQuota.listeners.input.call(inQuota);
  const rigaEV=document.getElementById("ev-live").textContent;
  // p=50% -> quota equa 2.00 ; EV a 2.30 = 0.5 x 2.30 - 1 = +15%
  assert.ok(rigaEV.includes("2.00"),"quota equa attesa 2.00: "+rigaEV);
  assert.ok(rigaEV.includes("+15.0%"),"EV atteso +15.0%: "+rigaEV);

  // Prezzo che non copre la stima: p=30% -> quota equa 3.33 contro 2.30
  inProb.value="30"; inProb.listeners.input.call(inProb);
  const rigaBassa=document.getElementById("ev-live").textContent;
  assert.ok(rigaBassa.includes("non copre la tua stima"),"atteso avviso prezzo insufficiente: "+rigaBassa);
  assert.ok(rigaBassa.includes("-31.0%"),"EV atteso -31.0%: "+rigaBassa);
  clickNav(app,"Tipster");
  assert.ok(app.textContent.includes("Fabrizio Rubino"));
  clickNav(app,"Cassa");
  assert.ok(app.textContent.includes("Riepilogo mensile"));

  // Tetto come percentuale della cassa. Cassa attesa dai dati di prova:
  // 10 versati + 1.20 + 0.55 di profitti chiusi = 11.75 (la pick aperta e
  // quella osservata non contano). Al 50% il tetto e' 5.875, arrotondato ai
  // 50 centesimi = 6.00.
  const bottonePct=findElement(app,x=>x.tagName==="BUTTON"&&x.textContent==="% della cassa");
  assert.ok(bottonePct,"Selettore '% della cassa' non trovato nelle impostazioni");
  bottonePct.listeners.click();
  const testoPct=app.textContent;
  // Ancorato all'etichetta: un semplice includes("€6,00") passava anche con
  // la percentuale sbagliata, perche' quella cifra compare altrove.
  assert.ok(testoPct.includes("Sabato= €6,00")&&testoPct.includes("Domenica= €6,00"),
    "Tetto atteso €6,00 (50% di €11,75) non mostrato accanto al giorno");
  assert.ok(testoPct.includes("Lun–ven= €3,00"),
    "Tetto feriali atteso €3,00 (25% di €11,75)");
  assert.ok(testoPct.includes("Tetto ai versamenti del mese"),
    "Il budget mensile deve dichiarare che riguarda i versamenti, non le giocate");
  assert.ok(testoPct.includes("I tetti seguono la cassa"),
    "Manca la spiegazione del modo percentuale");

  // Tornando a cifra fissa il comportamento precedente deve restare identico:
  // i tetti seminati valgono 10/10/5, quindi la proiezione mensile e'
  // (10+10+5) x 52 / 12 = 108.33.
  const bottoneFisso=findElement(app,x=>x.tagName==="BUTTON"&&x.textContent==="Cifra fissa");
  assert.ok(bottoneFisso,"Selettore 'Cifra fissa' non trovato");
  bottoneFisso.listeners.click();
  assert.ok(app.textContent.includes("€108,33"),
    "In modo fisso la proiezione mensile deve restare quella di prima");
  assert.ok(!app.textContent.includes("I tetti seguono la cassa"),
    "La spiegazione percentuale non deve comparire in modo fisso");
  clickNav(app,"?");
  assert.ok(app.textContent.includes("Market Lab"));
  clickNav(app,"Dati");
  const invia=findElement(app,x=>x.tagName==="BUTTON"&&x.textContent==="Invia ora");
  assert.ok(invia,"Pulsante Invia ora non trovato");
  invia.listeners.click();
  await new Promise(resolve=>setTimeout(resolve,5));

  const picksUpsert=calls.find(x=>x.azione==="upsert"&&x.table==="picks");
  assert.ok(picksUpsert,"Upsert picks non eseguito");
  assert.equal(picksUpsert.options.onConflict,"user_id,legacy_id");
  assert.equal(picksUpsert.rows[0].legacy_id,"ticket:ABC1");
  assert.equal(picksUpsert.rows[0].famiglia_mercato,"COMBO");
  assert.equal(calls.filter(x=>x.azione==="delete").length,0,"La sync non deve cancellare tabelle");

  console.log("app smoke: ok");
})().catch(e=>{console.error(e);process.exitCode=1;});

function findElement(root,predicate){
  if(predicate(root))return root;
  for(const child of root.children||[]){
    const found=findElement(child,predicate);
    if(found)return found;
  }
  return null;
}

function clickNav(app,label){
  const button=app.children[1].children.find(x=>x.textContent===label);
  assert.ok(button,"Pulsante di navigazione non trovato: "+label);
  button.listeners.click();
}

