"use strict";

// 31/10/2026: nella pagina Codici, il riepilogo giorno per giorno. Dal 31/10 i
// codici Sportbet non si registrano uno per uno: una rettifica "codici" a fine
// giornata porta schedine, vinte, giocati e vinti. I giorni prima si ricavano
// dai codici registrati singolarmente.
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
  classificazione:"PERSONALE",ticketId:"",orarioIngresso:"",gambe:[],tipoSchedina:"SINGOLA",nota:"",tipster:"io",mercato:"1"};
const picks=[
  {...base,id:1,data:"2026-10-25",origine:"CODICI",bookmaker:"Sportbet",evento:"Codice 1",codiceSchedina:"111111",quota:10,stake:2,esito:"vinta",profitto:18},
  {...base,id:2,data:"2026-10-25",origine:"CODICI",bookmaker:"Sportbet",evento:"Codice 2",codiceSchedina:"222222",quota:5,stake:1,esito:"persa",profitto:-1},
  {...base,id:3,data:"2026-10-25",origine:"VEGGENTE",bookmaker:"Sportium",evento:"A - B",quota:2,stake:10,esito:"vinta",profitto:10}
];
const versamenti=[
  {id:1,data:"2026-10-20",importo:20,tipoMovimento:"versamento",cassa:"CODICI"},
  {id:2,data:"2026-10-31",importo:25,tipoMovimento:"rettifica",cassa:"CODICI",nota:"Spostamento fra casse: da Sportium"},
  {id:3,data:"2026-10-31",importo:-25,tipoMovimento:"rettifica",cassa:"PRINCIPALE",nota:"Spostamento fra casse: verso Sportbet"},
  {id:4,data:"2026-10-31",importo:19,tipoMovimento:"rettifica",cassa:"CODICI",nota:"Rettifica: codici · 22 schedine · 2 vinte · giocati €25,00 · vinti €44,00"},
  {id:5,data:"2026-10-30",importo:-3,tipoMovimento:"rettifica",cassa:"CODICI",nota:"Rettifica: codici (sul sito €40,00, in app €43,00)"},
  {id:6,data:"2026-10-29",importo:1,tipoMovimento:"rettifica",cassa:"CODICI",nota:"Bonus Sportbet"}
];
const storage={
  "registro-tipster-v1":JSON.stringify({giocate:picks,versamenti,budgetMese:50}),
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

(async()=>{
  await new Promise(r=>setTimeout(r,5));
  const app=document.getElementById("app");
  clickNav(app,"Codici");
  const box=findElement(app,x=>x.className==="cod-giorni");
  assert.ok(box,"c'e' il riepilogo giorno per giorno");
  const righe=box.children.map(x=>x.textContent);
  assert.equal(righe.length,4,"tre giorni piu' il totale: "+JSON.stringify(righe));
  // Il piu' recente in cima; spostamento e bonus non contano.
  assert.equal(righe[0],"31/1022 schedine · 2 vinte, 20 perse · giocati €25,00 · vinti €44,00+€19,00");
  assert.equal(righe[1],"30/10solo il risultato (rettifica senza dettagli)-€3,00");
  // 25/10: due codici registrati uno per uno (la giocata Veggente no).
  assert.equal(righe[2],"25/102 schedine · 1 vinta, 1 persa · giocati €3,00 · vinti €20,00+€17,00");
  assert.equal(righe[3],"Totalegiorni con e senza dettagli: conta solo il risultato+€33,00");
  assert.equal(box.children[0].children[1].style.color,"#4FB286","giorno in attivo in verde");
  assert.equal(box.children[1].children[1].style.color,"#D4635F","giorno in perdita in rosso");
  console.log("codici-giorni: ok");
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
