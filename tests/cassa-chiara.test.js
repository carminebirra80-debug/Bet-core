"use strict";

// 28/10/2026: Cassa riorganizzata. In cima una scheda per book con il
// confronto contro il saldo del sito (che mostra solo i soldi liberi) e la
// rettifica guidata; il budget conta i versamenti dei due book; il mese per
// mese tiene separati giocate, movimenti e saldo a fine mese; un solo
// registro dei movimenti, con le righe piu' vecchie nascoste di serie.
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



const oggiIso=(()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);})();
const base={quotaCheck:null,confidence:null,debrief:"",statoCore:"ufficiale",osservata:false,faseIngresso:"PRE",
  classificazione:"PERSONALE",ticketId:"",orarioIngresso:"",gambe:[],tipoSchedina:"SINGOLA",nota:"",tipster:"io",mercato:"1"};
const picks=[
  {...base,id:1,data:"2026-09-10",origine:"LIBERA",bookmaker:"Sportium",evento:"A - B",quota:2,stake:10,esito:"vinta",profitto:10},
  {...base,id:2,data:oggiIso,origine:"CODICI",bookmaker:"Sportbet",evento:"Codice 1",quota:2,stake:5,esito:"vinta",profitto:5},
  {...base,id:3,data:oggiIso,origine:"LIBERA",bookmaker:"Sportbet",evento:"C - D",quota:3,stake:2,esito:"aperta",profitto:0}
];
const versamenti=[
  {id:1,data:"2026-09-01",importo:50,tipoMovimento:"versamento"},
  {id:2,data:"2026-09-15",importo:5,tipoMovimento:"prelievo"},
  {id:3,data:oggiIso,importo:20,tipoMovimento:"versamento",cassa:"CODICI"},
  {id:4,data:oggiIso,importo:10,tipoMovimento:"versamento",cassa:"PRINCIPALE"}
];
// Sei movimenti d'agosto a somma zero: servono solo a superare le 10 righe.
for(let i=0;i<3;i++){
  versamenti.push({id:100+i,data:"2026-08-0"+(i+1),importo:1,tipoMovimento:"versamento"});
  versamenti.push({id:200+i,data:"2026-08-0"+(i+1),importo:1,tipoMovimento:"prelievo"});
}
const storage={
  "registro-tipster-v1":JSON.stringify({giocate:picks,versamenti,tetti:{sabato:10,domenica:10,feriali:5},budgetMese:50}),
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

const scheda=(app,b)=>findElement(app,x=>x.className==="cassa-book"&&x.attributes["data-book"]===b);
const salvati=()=>JSON.parse(storage["registro-tipster-v1"]).versamenti;
function scriviSaldo(app,b,valore){
  // Dal 31/10/2026 il confronto col sito si apre con un tocco.
  const apri=findElement(scheda(app,b),x=>x.tagName==="BUTTON"&&x.textContent==="Confronta col saldo del sito");
  if(apri) apri.listeners.click();
  const campo=findElement(scheda(app,b),x=>x.tagName==="INPUT");
  campo.value=valore; campo.listeners.change();
}

(async()=>{
  await new Promise(r=>setTimeout(r,5));
  const app=document.getElementById("app");
  clickNav(app,"Cassa");

  // Saldi: Sportium 50 - 5 + 10 + 10 = 65; Sportbet 20 + 5 = 25, con 2 in gioco.
  assert.ok(scheda(app,"PRINCIPALE").textContent.startsWith("Sportium€65,00"),scheda(app,"PRINCIPALE").textContent.slice(0,40));
  const sb=scheda(app,"CODICI").textContent;
  assert.ok(sb.startsWith("Sportbet€25,00di cui €2,00 in gioco · liberi €23,00"),sb.slice(0,80));
  assert.equal(findElement(app,x=>x.className==="cassa-totali").textContent,"Totale€90,00In gioco€2,00Liberi€88,00");

  // Il budget conta i versamenti di oggi su tutti e due i book: 20 + 10.
  const tetto=findElement(app,x=>x.className==="tetto").textContent;
  assert.ok(tetto.includes("Versato questo mese · Sportium + Sportbet€30,00 di €50,00"),tetto);

  // Di serie il confronto col sito e' chiuso: solo il tasto per aprirlo.
  assert.equal(findElement(scheda(app,"CODICI"),x=>x.tagName==="INPUT"),null,"campo del sito chiuso di serie");
  assert.ok(findElement(scheda(app,"CODICI"),x=>x.tagName==="BUTTON"&&x.textContent==="Confronta col saldo del sito"),"tasto per aprirlo");
  // Confronto col sito: il sito di Sportbet mostra 22,70 liberi, l'app 23,00.
  scriviSaldo(app,"CODICI","22,70");
  let testo=scheda(app,"CODICI").textContent;
  assert.ok(testo.includes("Sul sito hai €0,30 in meno rispetto all'app (confronto con i soldi liberi: €2,00 in gioco non sono nel saldo del sito)."),testo);
  const motivo=findElement(scheda(app,"CODICI"),x=>x.tagName==="SELECT");
  // 31/10/2026: su Sportbet il motivo proposto e' "Codici" (risultato delle
  // schedine codici non registrate una per una).
  assert.equal(motivo.value,"Codici","su Sportbet il motivo di serie e' Codici");
  assert.equal(motivo.children[0].textContent,"Codici","Codici e' fra i motivi");
  assert.equal(findElement(scheda(app,"PRINCIPALE"),x=>x.tagName==="SELECT"),null,"su Sportium nessuna differenza, nessun motivo");
  motivo.value="Arrotondamento"; motivo.listeners.change.call(motivo);
  findElement(scheda(app,"CODICI"),x=>x.tagName==="BUTTON"&&x.textContent==="Allinea l'app al sito (rettifica -€0,30)").listeners.click();
  const rett=salvati().find(v=>v.tipoMovimento==="rettifica");
  assert.ok(rett,"rettifica salvata");
  assert.equal(rett.cassa,"CODICI","la rettifica va nel book controllato");
  assert.equal(rett.importo,-0.3,"importo della rettifica: sito - liberi");
  assert.equal(rett.nota,"Rettifica: arrotondamento (sul sito €22,70, in app €23,00)","il motivo scelto resta nella nota");
  assert.equal(rett.cloudDirty,true,"la rettifica va al cloud");
  assert.ok(scheda(app,"CODICI").textContent.startsWith("Sportbet€24,70"),"dopo la rettifica: "+scheda(app,"CODICI").textContent.slice(0,40));
  assert.equal(findElement(scheda(app,"CODICI"),x=>x.tagName==="INPUT"),null,"dopo la rettifica il confronto si richiude");

  // Un centesimo di differenza torna; una scritta non numerica no.
  scriviSaldo(app,"PRINCIPALE","65,01");
  assert.ok(scheda(app,"PRINCIPALE").textContent.includes("Torna (differenza €0,01, arrotondamento)."),scheda(app,"PRINCIPALE").textContent);
  assert.ok(!findElement(scheda(app,"PRINCIPALE"),x=>x.tagName==="BUTTON"&&x.textContent.startsWith("Allinea")),"niente rettifica quando torna");
  scriviSaldo(app,"PRINCIPALE","boh");
  assert.ok(scheda(app,"PRINCIPALE").textContent.includes("Scrivi solo la cifra"),"testo non numerico");
  scriviSaldo(app,"PRINCIPALE","");

  // Risultato: giocate +15 (10 + 5); soldi veri 89,70 + 8 prelevati - 83 versati = +14,70.
  const ris=findElement(app,x=>String(x.className).indexOf("verdetto-soldi")>=0).textContent;
  assert.ok(!ris.includes("Dalle giocate"),"il risultato delle giocate sta nello storico: "+ris);
  assert.ok(ris.includes("Soldi veri+€14,70"),ris);
  assert.ok(ris.includes("€89,70 in cassa + €8,00 prelevati − €83,00 versati. Comprende -€0,30 di rettifiche e bonus."),ris);

  // Movimenti: il modulo e' chiuso finche' non serve (31/10/2026).
  assert.equal(findElement(app,x=>x.tagName==="INPUT"&&x.id==="movimento-importo"),null,"modulo chiuso di serie");
  findElement(app,x=>x.tagName==="BUTTON"&&x.textContent==="Registra movimento").listeners.click();
  // Si sceglie il book, il bonus e' una rettifica con nota.
  findElement(app,x=>x.tagName==="BUTTON"&&x.className.indexOf("scelta")===0&&x.textContent==="Sportbet").listeners.click();
  const importo=findElement(app,x=>x.tagName==="INPUT"&&x.id==="movimento-importo");
  importo.value="1";
  assert.ok(findElement(app,x=>x.tagName==="BUTTON"&&x.textContent==="Sposta su Sportium"),"con Sportbet scelto si sposta verso Sportium");
  findElement(app,x=>x.tagName==="BUTTON"&&x.textContent==="Bonus").listeners.click();
  const bonus=salvati().find(v=>v.nota==="Bonus Sportbet");
  assert.ok(bonus&&bonus.cassa==="CODICI"&&bonus.importo===1&&bonus.tipoMovimento==="rettifica","bonus salvato: "+JSON.stringify(bonus));
  assert.ok(findElement(app,x=>x.tagName==="LI"&&x.className==="vers"&&x.textContent.startsWith(oggiIso.slice(8,10)+"/"+oggiIso.slice(5,7)+" · bonus · Sportbet+€1,00")),"il bonus si riconosce nel registro");

  // Registro: 12 movimenti, se ne vedono 5; un tasto mostra tutto.
  const righe=()=>findElement(app,x=>x.className==="cassa-registro").children.length;
  assert.equal(righe(),5,"di serie gli ultimi 5");
  findElement(app,x=>x.tagName==="BUTTON"&&x.textContent==="Mostra tutti i movimenti (12)").listeners.click();
  assert.equal(righe(),12,"poi tutti");
  assert.equal(findElement(app,x=>x.className==="cassa-registro").children[0].textContent.slice(0,5),
    oggiIso.slice(8,10)+"/"+oggiIso.slice(5,7),"i piu' recenti in cima");

  // Mese per mese: il mese corrente ha il saldo per book, settembre no.
  const mese=m=>findElement(app,x=>String(x.className).indexOf("riep-mese")===0&&x.attributes["data-mese"]===m);
  const corrente=mese(oggiIso.slice(0,7)).textContent;
  assert.ok(corrente.includes("Saldo a fine mese (finora)Sportium€65,00Sportbet€25,70Totale€90,70"),corrente);
  assert.ok(corrente.includes("Giocate+€5,00"),corrente);
  const settembre=mese("2026-09").textContent;
  assert.ok(settembre.includes("Giocate+€10,00"),settembre);
  assert.ok(settembre.includes("Movimenti+€45,00versati €50,00 · prelevati €5,00"),settembre);
  assert.ok(settembre.includes("Saldo a fine mese non disponibile"),"prima del 17/10 i due book erano una cassa: "+settembre);

  // Dai Codici un tasto porta ai movimenti con Sportbet gia' scelto.
  findElement(app,x=>x.tagName==="BUTTON"&&x.className.indexOf("scelta")===0&&x.textContent==="Sportium").listeners.click();
  clickNav(app,"Codici");
  findElement(app,x=>x.tagName==="BUTTON"&&x.textContent==="Vai ai movimenti Sportbet").listeners.click();
  assert.ok(findElement(app,x=>x.tagName==="BUTTON"&&x.className==="scelta on"&&x.textContent==="Sportbet"),"Sportbet scelto");

  // Fine giornata dei codici: Sportbet sul sito 30,00, in app 25,70 liberi -2 in gioco.
  clickNav(app,"Cassa");
  scriviSaldo(app,"CODICI","30");
  const sel=findElement(scheda(app,"CODICI"),x=>x.tagName==="SELECT");
  sel.value="Codici"; sel.listeners.change.call(sel);
  findElement(scheda(app,"CODICI"),x=>x.tagName==="BUTTON"&&x.textContent.startsWith("Allinea l'app al sito")).listeners.click();
  const cod=salvati().find(v=>String(v.nota).startsWith("Rettifica: codici"));
  assert.ok(cod&&cod.cassa==="CODICI"&&cod.importo===6.3,"rettifica codici: "+JSON.stringify(cod));
  const riga=findElement(app,x=>x.tagName==="LI"&&x.className==="vers"&&x.textContent.includes(" · codici · Sportbet"));
  assert.ok(riga,"nel registro la rettifica si legge come codici");
  assert.ok(riga.textContent.includes("Rettifica: codici (sul sito €30,00"),"con la nota: "+riga.textContent);
  console.log("cassa-chiara: ok");
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
