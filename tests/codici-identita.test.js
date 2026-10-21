"use strict";

// 19 e 20/10/2026: un codice registrato a mano e poi completato con la
// ricevuta finiva due volte nel cloud (riga senza ticket e, 22 secondi dopo,
// la stessa giocata sotto "ticket:..."). Qui il telefono ha gia' la giocata
// col ticket ma senza identita' fissata, e il cloud ha la riga di prima:
// la sincronizzazione deve aggiornare quella riga, non crearne un'altra.
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



const ora="2026-10-20T19:21:31.497Z";
const base={quotaCheck:null,confidence:null,debrief:"",statoCore:"ufficiale",osservata:false,faseIngresso:"PRE",
  classificazione:"PERSONALE",tipoSchedina:"MULTIPLA",nota:"",tipster:"io",origine:"CODICI",bookmaker:"Sportbet"};
const locale={...base,id:1792524091497,data:"2026-10-20",codiceSchedina:"836079",evento:"Codice 836079",mercato:"MULTIPLA",
  quota:7.49,stake:1,esito:"aperta",profitto:0,orarioIngresso:ora,ticketId:"DF07EA0A14328320FC05",
  gambe:[{evento:"Fenerbahce vs Slavia Praga",mercato:"OVER 2.5"}],cloudSynced:true,cloudDirty:true};
// Un'altra giocata con un'ora tonda (modulo): non deve prendere identita' altrui.
const tonda={...base,id:1792500000000,data:"2026-10-20",codiceSchedina:"111111",evento:"Codice 111111",mercato:"MULTIPLA",
  quota:5,stake:1,esito:"aperta",profitto:0,orarioIngresso:"2026-10-20T14:16:00.000Z",ticketId:"AAAA1111",gambe:[],cloudSynced:true,cloudDirty:true};
// Sul telefono c'e' gia' la copia della riga del cloud: due giocate locali
// non devono finire sulla stessa riga.
const oraX="2026-10-20T10:00:00.123Z";
const conTicket={...base,id:1792400000123,data:"2026-10-20",codiceSchedina:"222222",evento:"Codice 222222",mercato:"MULTIPLA",
  quota:3,stake:1,esito:"aperta",profitto:0,orarioIngresso:oraX,ticketId:"BBBB2222",gambe:[],cloudSynced:true,cloudDirty:true};
const copia={...conTicket,id:"1792400000123",cloudLegacyId:"1792400000123",ticketId:"",cloudDirty:false};
const storage={
  "registro-tipster-v1":JSON.stringify({giocate:[locale,tonda,conTicket,copia],versamenti:[],tetti:{sabato:10,domenica:10,feriali:5},budgetMese:200}),
  "registro-tipster-cloud-sync":"1","registro-tipster-guided-v1":"1"
};
const riga=(legacy,o,extra)=>({user_id:"u",legacy_id:legacy,data:"2026-10-20",tipster:"io",origine:"CODICI",evento:o.evento,mercato:"MULTIPLA",
  quota:o.quota,stake:o.stake,esito:"Aperta",profitto:0,tipo:"reale",stato_core:"ufficiale",bookmaker:"Sportbet",fase_ingresso:"PRE",
  ticket_id:null,orario_ingresso:o.orarioIngresso.replace("Z","+00:00"),tipo_schedina:"MULTIPLA",gambe:[],codice_schedina:o.codiceSchedina,...extra});
const cloud={picks:new Map([["1792524091497",riga("1792524091497",locale,{})],
  ["1792500000000",riga("1792500000000",{...tonda,orarioIngresso:"2026-10-20T14:16:00.000Z"},{})],
  ["1792400000123",riga("1792400000123",conTicket,{})]]),versamenti:new Map()};
const localStorage={getItem:k=>Object.prototype.hasOwnProperty.call(storage,k)?storage[k]:null,
  setItem:(k,v)=>{storage[k]=String(v);},removeItem:k=>{delete storage[k];}};
const document=new Document();
const session={user:{id:"u",email:"t@example.com"}};
const db={
  auth:{getSession:async()=>({data:{session}}),getUser:async()=>({data:{user:session.user}}),onAuthStateChange:()=>{}},
  rpc:async()=>({error:null,data:[]}),
  from:t=>({
    upsert:async rows=>{const m=cloud[t]||(cloud[t]=new Map());for(const r of [].concat(rows))m.set(r.legacy_id,{...r});return {error:null};},
    select:()=>{const fn=async()=>({error:null,data:t==="impostazioni"?null:[...((cloud[t]||new Map()).values())].map(r=>({...r})),count:0});
      const c={eq:()=>c,order:fn,maybeSingle:async()=>({error:null,data:null}),then:(a,b)=>fn().then(a,b)};return c;},
    delete:()=>({eq:()=>({eq:async()=>({error:null})})}),update:()=>({eq:()=>({eq:async()=>({error:null})})})
  })
};
const window={
  BetCoreMarketTaxonomy:require("../market-taxonomy.js"),BetCoreMarketMetrics:require("../market-metrics.js"),
  BetCoreSyncMerge:require("../sync-merge.js"),BetCoreReceiptParser:require("../receipt-parser.js"),
  supabase:{createClient:()=>db},addEventListener:()=>{},scrollTo:()=>{},confirm:()=>true,alert:()=>{}
};
const sandbox={window,document,localStorage,navigator:{},console,Date,Math,JSON,Object,Array,String,Number,
  Boolean,RegExp,Promise,Infinity,parseFloat,parseInt,isNaN,isFinite,setTimeout,clearTimeout,URL,Blob};
window.window=window;window.document=document;window.localStorage=localStorage;window.navigator=sandbox.navigator;
const html=fs.readFileSync(require.resolve("../index.html"),"utf8");
vm.runInNewContext(html.slice(html.lastIndexOf("<script>")+8,html.lastIndexOf("</script>")),sandbox,{filename:"index-inline.js"});

(async()=>{
  await new Promise(r=>setTimeout(r,20));
  const app=document.getElementById("app");
  clickNav(app,"Dati");
  findElement(app,x=>x.tagName==="BUTTON"&&x.textContent==="Invia ora").listeners.click();
  await new Promise(r=>setTimeout(r,50));
  const del836=[...cloud.picks.values()].filter(r=>r.codice_schedina==="836079");
  assert.equal(del836.length,1,"una sola riga per il codice 836079: "+del836.map(r=>r.legacy_id).join(", "));
  assert.equal(del836[0].legacy_id,"1792524091497","aggiornata la riga che c'era");
  assert.equal(del836[0].ticket_id,"DF07EA0A14328320FC05","col ticket");
  assert.equal(del836[0].gambe.length,1,"e con le partite");
  // L'ora tonda non basta: quella giocata va sotto il suo ticket, come prima.
  const del111=[...cloud.picks.values()].filter(r=>r.codice_schedina==="111111").map(r=>r.legacy_id).sort();
  assert.deepEqual(del111,["1792500000000","ticket:AAAA1111"],"con un'ora tonda nessun riconoscimento");
  assert.equal(cloud.picks.get("1792400000123").ticket_id,null,"la riga della copia non viene sovrascritta dall'altra giocata");
  const salvata=JSON.parse(storage["registro-tipster-v1"]).giocate.find(g=>g.codiceSchedina==="836079");
  assert.equal(salvata.cloudLegacyId,"1792524091497","identita' fissata sul telefono");
  console.log("codici-identita: ok");
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
