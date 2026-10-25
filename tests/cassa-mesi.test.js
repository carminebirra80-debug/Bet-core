"use strict";

// 25/10/2026: nella Cassa il riepilogo giornaliero e' raggruppato per mese.
// Ogni mese si apre e si chiude con un tocco; il piu' recente e' aperto di
// serie, gli altri chiusi, e la scelta resta salvata su questo telefono.
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



const base={quotaCheck:null,confidence:null,debrief:"",statoCore:"ufficiale",osservata:false,faseIngresso:"PRE",
  classificazione:"PERSONALE",ticketId:"",orarioIngresso:"",gambe:[],tipoSchedina:"SINGOLA",nota:"",tipster:"io",
  origine:"LIBERA",bookmaker:"Sportium",mercato:"1",quota:2};
const picks=[
  {...base,id:1,data:"2026-09-12",evento:"A - B",stake:10,esito:"vinta",profitto:10},
  {...base,id:2,data:"2026-09-20",evento:"C - D",stake:4,esito:"persa",profitto:-4},
  {...base,id:3,data:"2026-10-03",evento:"E - F",stake:5,esito:"persa",profitto:-5}
];
const storage={
  "registro-tipster-v1":JSON.stringify({giocate:picks,versamenti:[{id:1,data:"2026-09-01",importo:50,tipoMovimento:"versamento"}],
    tetti:{sabato:10,domenica:10,feriali:5},budgetMese:200}),
  "registro-tipster-guided-v1":"1"
};
const localStorage={getItem:k=>Object.prototype.hasOwnProperty.call(storage,k)?storage[k]:null,
  setItem:(k,v)=>{storage[k]=String(v);},removeItem:k=>{delete storage[k];}};
const document=new Document();
const window={
  BetCoreMarketTaxonomy:require("../market-taxonomy.js"),
  BetCoreMarketMetrics:require("../market-metrics.js"),
  BetCoreSyncMerge:require("../sync-merge.js"),
  BetCoreReceiptParser:require("../receipt-parser.js"),
  addEventListener:()=>{},scrollTo:()=>{},confirm:()=>true,alert:()=>{}
};
const sandbox={window,document,localStorage,navigator:{},console,Date,Math,JSON,Object,Array,String,Number,
  Boolean,RegExp,Promise,Infinity,parseFloat,parseInt,isNaN,setTimeout,clearTimeout,URL,Blob};
window.window=window;window.document=document;window.localStorage=localStorage;window.navigator=sandbox.navigator;
const html=fs.readFileSync(require.resolve("../index.html"),"utf8");
vm.runInNewContext(html.slice(html.lastIndexOf("<script>")+8,html.lastIndexOf("</script>")),sandbox,{filename:"index-inline.js"});

function gruppi(app){
  const out=[];
  (function giro(n){ if(n.className==="gruppo-mese") out.push(n); (n.children||[]).forEach(giro); })(app);
  return out;
}

(async()=>{
  await new Promise(r=>setTimeout(r,5));
  const app=document.getElementById("app");
  clickNav(app,"Cassa");
  let g=gruppi(app);
  assert.equal(g.length,2,"un gruppo per mese");
  const [ott,set]=g;
  assert.ok(ott.children[0].textContent.includes("Ottobre 2026"),"prima il mese piu' recente: "+ott.children[0].textContent);
  assert.ok(set.children[0].textContent.includes("Settembre 2026"));
  // Totali del mese in testa, gli stessi del riepilogo mensile.
  assert.ok(set.children[0].textContent.includes("+\u20AC6,00"),"saldo di settembre 10 - 4: "+set.children[0].textContent);
  assert.ok(set.children[0].textContent.includes("2 giorni di gioco"),"giorni di gioco: "+set.children[0].textContent);
  assert.ok(set.children[0].textContent.includes("2 ticket"),"ticket del mese: "+set.children[0].textContent);
  assert.ok(ott.children[0].textContent.includes("-\u20AC5,00"),"saldo di ottobre: "+ott.children[0].textContent);
  // Di serie: aperto il piu' recente, chiuso l'altro.
  assert.equal(ott.children[1].style.display,"","ottobre aperto");
  assert.equal(set.children[1].style.display,"none","settembre chiuso");
  assert.ok(set.children[1].textContent.includes("12/09"),"i giorni ci sono, solo nascosti");
  assert.ok(!ott.children[1].textContent.includes("12/09"),"ogni giorno nel suo mese");
  // Un tocco apre settembre, un altro chiude ottobre.
  set.children[0].listeners.click();
  ott.children[0].listeners.click();
  assert.equal(set.children[1].style.display,"","settembre aperto col tocco");
  assert.equal(ott.children[1].style.display,"none","ottobre chiuso col tocco");
  assert.equal(set.children[0].attributes["aria-expanded"],"true");
  // La scelta resta anche ridisegnando la pagina.
  clickNav(app,"Registro"); clickNav(app,"Cassa");
  g=gruppi(app);
  assert.equal(g[0].children[1].style.display,"none","ottobre resta chiuso");
  assert.equal(g[1].children[1].style.display,"","settembre resta aperto");
  // Memoria illeggibile: si torna al comportamento di serie, senza errori.
  storage["registro-tipster-cassa-mesi-aperti"]="{rotto";
  clickNav(app,"Registro"); clickNav(app,"Cassa");
  g=gruppi(app);
  assert.equal(g[0].children[1].style.display,"","di serie di nuovo");
  assert.equal(g[1].children[1].style.display,"none");
  console.log("cassa-mesi: ok");
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
