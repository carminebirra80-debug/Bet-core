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


// Sincronizzazione sicura (v4.59, 15/11/2026). Tre difetti trovati nella
// revisione del codice:
//  1. una modifica fatta mentre l'invio al cloud era in viaggio andava persa;
//  2. dopo la sincronizzazione la giocata cambiava id ("ticket:...") e una
//     modifica aperta non trovava piu' la sua giocata;
//  3. oltre le 1000 righe la lettura dal cloud arrivava troncata e le giocate
//     mancanti sparivano dal telefono.
function avvia(opzioni){
  const storage={
    "registro-tipster-v1":JSON.stringify({giocate:opzioni.locali||[],versamenti:[],tetti:{sabato:10,domenica:10,feriali:5},budgetMese:200}),
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
  const cloud=new Map((opzioni.cloud||[]).map(r=>[r.legacy_id,r]));
  const stato={storage,document,cloud,upsert:[],sblocca:null,inAttesa:null};
  const db={
    auth:{getSession:async()=>({data:{session}}),getUser:async()=>({data:{user:session.user}}),onAuthStateChange:()=>{}},
    rpc:async()=>({error:null,data:[]}),
    from:table=>({
      upsert:async rows=>{
        if(table==="picks"){
          stato.upsert.push(rows.map(r=>({...r})));
          // Il primo invio resta in viaggio finche' la prova non lo sblocca.
          if(opzioni.invioLento && stato.upsert.length===1){
            await new Promise(resolve=>{stato.sblocca=resolve; if(stato.inAttesa) stato.inAttesa();});
          }
          rows.forEach(r=>cloud.set(r.legacy_id,{id:"c-"+r.legacy_id,...r}));
        }
        return {error:null};
      },
      select:()=>{
        // Come il cloud vero: mai piu' di 1000 righe per richiesta.
        const tutte=()=>table==="picks"?[...cloud.values()].map(r=>({...r})):[];
        const chain={eq:()=>chain,order:()=>chain,
          range:async(a,b)=>({error:null,data:tutte().slice(a,Math.min(b+1,a+1000)),count:tutte().length}),
          maybeSingle:async()=>({error:null,data:null}),
          then:(resolve,reject)=>Promise.resolve({error:null,data:table==="impostazioni"?null:tutte().slice(0,1000),count:tutte().length}).then(resolve,reject)};
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
  const html=fs.readFileSync(process.env.BETCORE_INDEX||require.resolve("../index.html"),"utf8");
  const inline=html.slice(html.lastIndexOf("<script>")+8,html.lastIndexOf("</script>"));
  vm.runInNewContext(inline,sandbox,{filename:"index-inline.js"});
  stato.salvate=()=>JSON.parse(storage["registro-tipster-v1"]).giocate;
  return stato;
}
const pausa=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function bottone(nodo,testo){
  if(nodo.tagName==="BUTTON" && nodo.textContent===testo) return nodo;
  for(const f of nodo.children){ const b=bottone(f,testo); if(b) return b; }
  return null;
}
function riga(extra){
  return {user_id:"user-test",data:"2026-11-14",tipster:"io",origine:"LIBERA",evento:"Roma - Lecce",mercato:"1",quota:1.8,stake:5,
    esito:"Aperta",profitto:0,tipo:"reale",stato_core:"ufficiale",bookmaker:"Sportium",tipo_schedina:"SINGOLA",gambe:[],...extra};
}
function locale(extra){
  return {data:"2026-11-14",tipster:"io",origine:"LIBERA",evento:"Roma - Lecce",mercato:"1",nota:"",quota:1.8,stake:5,esito:"aperta",profitto:0,
    statoCore:"ufficiale",osservata:false,bookmaker:"Sportium",faseIngresso:"PRE",classificazione:"PERSONALE",ticketId:"",orarioIngresso:"",
    tipoSchedina:"SINGOLA",gambe:[],...extra};
}

// SOLO=1|2|3 esegue un caso solo (serve per la prova di mutazione).
const SOLO=process.env.SOLO||"";
(async()=>{
  // 1. Modifica fatta mentre l'invio e' in viaggio.
  if(!SOLO||SOLO==="1"){
    const A=locale({id:1001,evento:"Milan - Inter",cloudDirty:true});
    const B=locale({id:1002,evento:"Napoli - Juve",statoCore:"candidata",classificazione:"CANDIDATA",cloudSynced:true,cloudLegacyId:"1002"});
    const app=avvia({locali:[A,B],invioLento:true,
      cloud:[riga({id:"c-1002",legacy_id:"1002",evento:"Napoli - Juve",stato_core:"candidata",classificazione:"CANDIDATA"})]});
    await new Promise(resolve=>{ if(app.sblocca) resolve(); else app.inAttesa=resolve; });
    const tasto=bottone(app.document.body,"Ufficiale");
    assert.ok(tasto,"la giocata candidata mostra il tasto Ufficiale");
    tasto.listeners.click();                       // modifica con l'invio ancora in viaggio
    app.sblocca();
    await pausa(400);
    const b=app.salvate().find(g=>g.evento==="Napoli - Juve");
    assert.equal(b.statoCore,"ufficiale","la modifica fatta durante l'invio resta sul telefono");
    assert.equal(app.cloud.get("1002").stato_core,"ufficiale","e arriva nel cloud con la sincronizzazione successiva");
    assert.ok(app.salvate().some(g=>g.evento==="Milan - Inter"),"la giocata inviata resta nel registro");
  }
  // 2. L'id sul telefono non cambia dopo la sincronizzazione.
  if(!SOLO||SOLO==="2"){
    const app=avvia({locali:[locale({id:2001,ticketId:"T1",cloudSynced:true,cloudLegacyId:"ticket:T1"})],
      cloud:[riga({id:"c-t1",legacy_id:"ticket:T1",ticket_id:"T1"})]});
    await pausa(60);
    const g=app.salvate()[0];
    assert.equal(String(g.id),"2001","la giocata tiene il suo id: una modifica aperta la ritrova");
    assert.equal(g.cloudLegacyId,"ticket:T1","l'identita' nel cloud resta quella");
  }
  // 3. Piu' di 1000 giocate nel cloud.
  if(!SOLO||SOLO==="3"){
    const tante=[];
    for(let i=0;i<1200;i++) tante.push(riga({id:"c-"+i,legacy_id:"L"+i,evento:"Partita "+i+" - Altra",ticket_id:"TK"+i}));
    const locali=tante.map((r,i)=>locale({id:5000+i,evento:r.evento,ticketId:r.ticket_id,cloudSynced:true,cloudLegacyId:r.legacy_id}));
    const app=avvia({locali,cloud:tante});
    await pausa(300);
    assert.equal(app.salvate().length,1200,"con 1200 giocate nel cloud sul telefono ne restano 1200");
  }
  console.log("sync-sicura: ok");
})().catch(e=>{console.error(e);process.exitCode=1;});
