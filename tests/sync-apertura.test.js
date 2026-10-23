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
  {id:4,data:"2026-08-30",tipster:"io",evento:"Storico",mercato:"",nota:"",quota:2,quotaCheck:null,confidence:3,debrief:"",statoCore:"scartata",stake:0,osservata:true,bookmaker:"Sportium",faseIngresso:"PRE",classificazione:"SCARTATA",ticketId:"",orarioIngresso:"",tipoSchedina:"SINGOLA",gambe:[],esito:"persa",profitto:0},
  // Multipla inserita a mano prima che esistesse il campo gambe: nel registro
  // reale ce ne sono 20 su 71, ed erano tutte impossibili da correggere.
  {id:5,data:"2026-08-27",tipster:"io",evento:"",mercato:"MULTIPLA",nota:"Multipla storica senza gambe",quota:5.31,quotaCheck:null,confidence:3,debrief:"",statoCore:"ufficiale",stake:3.50,osservata:false,bookmaker:"Sportium",faseIngresso:"PRE",classificazione:"PERSONALE",ticketId:"",orarioIngresso:"",tipoSchedina:"MULTIPLA",gambe:[],esito:"vinta",profitto:15.08}
];
// Sync all'apertura (23/10/2026): quattro codici scritti nel cloud non si
// vedevano in Codici perche' l'app scaricava il cloud solo dopo una modifica.
const oggi=new Date(); const z=n=>String(n).padStart(2,"0");
const oggiIso=oggi.getFullYear()+"-"+z(oggi.getMonth()+1)+"-"+z(oggi.getDate());
const storage={
  "registro-tipster-v1":JSON.stringify({giocate:[],versamenti:[],tetti:{sabato:10,domenica:10,feriali:5},budgetMese:200}),
  "registro-tipster-cloud-sync":"1",
  "registro-tipster-guided-v1":"1"
};
const localStorage={
  getItem:key=>Object.prototype.hasOwnProperty.call(storage,key)?storage[key]:null,
  setItem:(key,value)=>{storage[key]=String(value);},
  removeItem:key=>{delete storage[key];}
};
const document=new Document();
const session={user:{id:"user-test",email:"test@example.com"}};
const nelCloud=[{id:"u1",user_id:"user-test",legacy_id:"ticket:DF07EA0A19329564D505",data:oggiIso,tipster:"io",origine:"CODICI",
  evento:"Codice 512302",mercato:"MULTIPLA",quota:25.08,stake:1,bonus:4.26,esito:"Aperta",profitto:0,tipo:"reale",bookmaker:"Sportbet",
  ticket_id:"DF07EA0A19329564D505",tipo_schedina:"MULTIPLA",codice_schedina:"512302",
  gambe:[{evento:"Como vs Sassuolo",mercato:"OVER 2.5",quota:1.43,esito:null,data:"2026-10-24"},
         {evento:"Barcelona vs Real Madrid",mercato:"GG",quota:1.26,esito:null,data:"2026-10-25"}]}];
let letture=0;
const db={
  auth:{
    getSession:async()=>({data:{session}}),
    getUser:async()=>({data:{user:session.user}}),
    onAuthStateChange:()=>{}
  },
  rpc:async()=>({error:null,data:[]}),
  from:table=>({
    upsert:async()=>({error:null}),
    select:()=>{
      if(table==="picks") letture++;
      const result={error:null,data:table==="impostazioni"?null:(table==="picks"?nelCloud:[]),count:table==="picks"?nelCloud.length:0};
      const chain={eq:()=>chain,order:async()=>result,maybeSingle:async()=>({error:null,data:null}),
        then:(resolve,reject)=>Promise.resolve(result).then(resolve,reject)};
      return chain;
    },
    delete:()=>({eq:()=>({eq:async()=>({error:null})})}),
    update:()=>({eq:()=>({eq:async()=>({error:null})})})
  })
};
const window={
  BetCoreMarketTaxonomy:require("../market-taxonomy.js"),
  BetCoreMarketMetrics:require("../market-metrics.js"),
  BetCoreSyncMerge:require("../sync-merge.js"),
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
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.ok(letture>=1,"all'apertura l'app deve leggere le giocate dal cloud");
  const salvate=JSON.parse(storage["registro-tipster-v1"]).giocate;
  const cod=salvate.find(g=>g.codiceSchedina==="512302");
  assert.ok(cod,"il codice scritto nel cloud arriva sul telefono senza toccare nulla");
  assert.deepEqual(cod.gambe.map(g=>g.data),["2026-10-24","2026-10-25"],"il giorno di ogni partita resta salvato");
  console.log("sync-apertura: ok");
})().catch(e=>{console.error(e);process.exitCode=1;});
