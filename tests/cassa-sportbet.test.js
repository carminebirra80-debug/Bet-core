"use strict";

// 19/10/2026: due giocate libere fatte su Sportbet in live finivano nella
// cassa principale (Sportium). Dal 17/10 ogni giocata Sportbet va nella cassa
// Sportbet (quella dei codici); lo storico prima di quel giorno resta com'era.
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
  classificazione:"PERSONALE",ticketId:"",orarioIngresso:"",gambe:[],tipoSchedina:"SINGOLA",nota:"",tipster:"io"};
const picks=[
  {...base,id:1,data:"2026-10-19",origine:"LIBERA",bookmaker:"Sportbet",evento:"Tottenham vs Coventry City",mercato:"1",quota:1.95,stake:10,esito:"vinta",profitto:9.5},
  {...base,id:2,data:"2026-10-19",origine:"LIBERA",bookmaker:"Sportium",evento:"Inter - Roma",mercato:"1",quota:2,stake:5,esito:"vinta",profitto:5},
  // Prima del 17/10 una giocata Sportbet resta nella principale.
  {...base,id:3,data:"2026-10-16",origine:"VEGGENTE",bookmaker:"Sportbet",evento:"Milan - Lazio",mercato:"1",quota:1.6,stake:5,esito:"vinta",profitto:3},
  // Aperta su Sportbet oggi: in gioco nella cassa Sportbet.
  {...base,id:4,data:"2026-10-19",origine:"LIBERA",bookmaker:"Sportbet",evento:"Juve - Napoli",mercato:"X",quota:3,stake:2,esito:"aperta",profitto:0}
];
const storage={
  "registro-tipster-v1":JSON.stringify({giocate:picks,versamenti:[
    {id:1,data:"2026-10-01",importo:50,tipoMovimento:"versamento"},
    {id:2,data:"2026-10-17",importo:20,tipoMovimento:"versamento",cassa:"CODICI"},
    // Prelievo Sportbet registrato per sbaglio nella principale, gia' nel cloud.
    {id:3,data:"2026-10-20",importo:10,tipoMovimento:"prelievo",cassa:"PRINCIPALE",cloudSynced:true,cloudDirty:false}
  ],tetti:{sabato:10,domenica:10,feriali:5},budgetMese:200}),
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
  const inAlto=app.children[0].textContent;
  // Principale: 50 versati + 5 (Sportium) + 3 (Sportbet del 16/10) - 10 prelevati = 48.
  assert.ok(inAlto.includes("\u20AC48,00"),"cassa principale senza le giocate Sportbet dal 17/10: "+inAlto.slice(0,60));
  clickNav(app,"Codici");
  const verd=findElement(app,x=>x.className==="verdetto").textContent;
  // Sportbet: 20 versati + 9,50 della libera vinta; 2 in gioco.
  assert.ok(verd.includes("\u20AC29,50"),"la libera Sportbet vinta va nella cassa Sportbet: "+verd);
  assert.ok(verd.includes("\u20AC2,00 in gioco"),"l'aperta Sportbet e' in gioco nella cassa Sportbet: "+verd);
  // Rendimento: la libera Sportbet resta fra le Libere, l'aperta fra le pendenti.
  clickNav(app,"Rendimento");
  const libere=findElement(app,x=>x.className==="scheda"&&x.textContent.startsWith("Libera"));
  assert.ok(libere,"scheda Libere mancante");
  assert.ok(libere.textContent.includes("Giocate2"),"le libere sono due, una per cassa: "+libere.textContent);
  assert.ok(libere.textContent.includes("+\u20AC14,50"),"9,50 + 5: "+libere.textContent);
  assert.ok(libere.textContent.includes("1 giocata ancora aperta"),"l'aperta Sportbet conta fra le pendenti: "+libere.textContent);
  assert.ok(!libere.textContent.includes("Pre-partita"),"senza giocate live niente divisione");

  // Live (19/10/2026): dal modulo di modifica la giocata diventa live, si
  // vede nel Registro e il Rendimento separa prima della partita e live.
  clickNav(app,"Registro");
  const voce=findElement(app,x=>x.tagName==="LI"&&String(x.className).indexOf("voce")===0&&x.textContent.includes("Tottenham vs Coventry City"));
  assert.ok(voce,"giocata nel Registro");
  findElement(voce,x=>x.tagName==="BUTTON"&&x.textContent==="Modifica").listeners.click();
  const fase=findElement(app,x=>x.tagName==="SELECT"&&x.id==="campo-fase");
  assert.ok(fase,"campo Quando mancante nel modulo");
  assert.equal(fase.children.find(o=>o.selected).value,"PRE","di serie: prima della partita");
  fase.value="LIVE"; fase.listeners.change.call(fase);
  findElement(app,x=>x.tagName==="BUTTON"&&x.id==="bottone-registra").listeners.click();
  await new Promise(r=>setTimeout(r,5));
  const salvata=JSON.parse(storage["registro-tipster-v1"]).giocate.find(g=>g.evento==="Tottenham vs Coventry City");
  assert.equal(salvata.faseIngresso,"LIVE","la fase si salva");
  clickNav(app,"Registro");
  const voceLive=findElement(app,x=>x.tagName==="LI"&&String(x.className).indexOf("voce")===0&&x.textContent.includes("Tottenham vs Coventry City"));
  assert.ok(findElement(voceLive,x=>x.className==="badge-meta"&&x.textContent==="Live"),"etichetta Live nel Registro");
  const altra=findElement(app,x=>x.tagName==="LI"&&String(x.className).indexOf("voce")===0&&x.textContent.includes("Inter - Roma"));
  assert.ok(!findElement(altra,x=>x.className==="badge-meta"&&x.textContent==="Live"),"le altre restano senza etichetta");
  clickNav(app,"Rendimento");
  const libere2=findElement(app,x=>x.className==="scheda"&&x.textContent.startsWith("Libera")).textContent;
  assert.ok(libere2.includes("Pre-partita+\u20AC5,00"),"prima della partita: "+libere2);
  assert.ok(libere2.includes("Live+\u20AC9,50"),"live: "+libere2);

  // Movimento nella cassa sbagliata (20/10/2026): un prelievo Sportbet
  // registrato dalla scheda Cassa si sposta con un tasto, senza rifarlo.
  clickNav(app,"Cassa");
  // Dal 28/10/2026 un solo registro: ogni riga dice di quale book e'.
  const riga=findElement(app,x=>x.tagName==="LI"&&x.className==="vers"&&x.textContent.includes("prelievo · Sportium"));
  assert.ok(riga,"prelievo nel registro, segnato Sportium");
  const versSportium=findElement(app,x=>x.tagName==="LI"&&x.className==="vers"&&x.textContent.includes("versamento · Sportium"));
  assert.ok(findElement(versSportium,x=>x.tagName==="BUTTON"&&x.textContent==="Sposta in Sportbet"),"da Sportium il tasto porta verso Sportbet");
  const versSportbet=findElement(app,x=>x.tagName==="LI"&&x.className==="vers"&&x.textContent.includes("versamento · Sportbet"));
  assert.ok(findElement(versSportbet,x=>x.tagName==="BUTTON"&&x.textContent==="Sposta in Sportium"),"da Sportbet il tasto porta verso Sportium");
  findElement(riga,x=>x.tagName==="BUTTON"&&x.textContent==="Sposta in Sportbet").listeners.click();
  assert.ok(app.children[0].textContent.includes("\u20AC58,00"),"la principale torna a 58: "+app.children[0].textContent.slice(0,60));
  const mov=JSON.parse(storage["registro-tipster-v1"]).versamenti.find(v=>v.tipoMovimento==="prelievo");
  assert.equal(mov.cassa,"CODICI","il prelievo e' ora nella cassa Sportbet");
  assert.equal(mov.cloudDirty,true,"la correzione va al cloud");
  clickNav(app,"Codici");
  const verd2=findElement(app,x=>x.className==="verdetto").textContent;
  assert.ok(verd2.includes("\u20AC19,50"),"Sportbet: 29,50 - 10: "+verd2);
  clickNav(app,"Cassa");
  const spostato=findElement(app,x=>x.tagName==="LI"&&x.className==="vers"&&x.textContent.includes("prelievo · Sportbet"));
  assert.ok(spostato&&findElement(spostato,x=>x.tagName==="BUTTON"&&x.textContent==="Sposta in Sportium"),"e da li' si puo' riportare indietro");
  console.log("cassa-sportbet: ok");
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
