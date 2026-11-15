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


// Grafica v4.60 (15/11/2026): intestazione compatta, schede in basso,
// Registro per giornata, Nuova a bottoni, grafico in Cassa, Rendimento a
// confronto. Qui si controlla il comportamento, non l'aspetto: cosa c'e'
// nella pagina, cosa resta chiuso finche' non lo si tocca, cosa viene salvato.
const base={quotaCheck:null,confidence:null,debrief:"",statoCore:"ufficiale",osservata:false,bookmaker:"Sportium",
  faseIngresso:"PRE",classificazione:"PERSONALE",ticketId:"",orarioIngresso:"",gambe:[],tipoSchedina:"SINGOLA",nota:"",tipster:"io"};
let prossimoId=100;
const g=o=>({...base,id:prossimoId++,...o});
const gamba=(evento,mercato,quota,esito)=>({evento,mercato,quota,esito:esito||""});
const giocate=[
  g({data:"2026-11-14",origine:"LIBERA",evento:"Tenerife - Ceuta",mercato:"1",quota:1.62,stake:5,esito:"aperta",profitto:0}),
  g({data:"2026-11-08",origine:"VEGGENTE",evento:"Inter - Lazio",mercato:"1",quota:1.55,stake:10,esito:"vinta",profitto:5.5,bookmaker:"Sportbet"}),
  g({data:"2026-11-08",origine:"BET_CORE",classificazione:"BET CORE",evento:"Bologna - Napoli",mercato:"X2",quota:1.48,stake:10,esito:"persa",profitto:-10}),
  // Un codice vinto: sta nella cassa Sportbet insieme alle Veggente giocate li'.
  g({data:"2026-11-08",origine:"CODICI",codiceSchedina:"771204",evento:"Codice 771204",mercato:"MULTIPLA",tipoSchedina:"MULTIPLA",
    bookmaker:"Sportbet",quota:5.1,stake:1,esito:"vinta",profitto:4.1}),
  g({data:"2026-11-07",origine:"VEGGENTE",evento:"Multipla 3 partite",mercato:"MULTIPLA",tipoSchedina:"MULTIPLA",bookmaker:"Sportbet",quota:3.2,stake:5,esito:"persa",profitto:-5,
    gambe:[gamba("Chelsea - Wolves","1",1.4,"vinta"),gamba("Sunderland - Arsenal","2",1.55,"persa"),gamba("Tottenham - Man United","Goal",1.6,"vinta")]}),
  g({data:"2026-11-02",origine:"BET_CORE",classificazione:"BET CORE",evento:"Milan - Roma",mercato:"No Goal",quota:2.05,stake:10,esito:"vinta",profitto:10.5}),
  g({data:"2026-11-01",origine:"LIBERA",evento:"Cremonese - Juventus",mercato:"2",quota:1.7,stake:5,esito:"vinta",profitto:3.5}),
  g({data:"2026-10-25",origine:"VEGGENTE",evento:"Napoli - Inter",mercato:"Goal",quota:1.75,stake:10,esito:"vinta",profitto:7.5,bookmaker:"Sportbet"}),
  g({data:"2026-10-25",origine:"LIBERA",evento:"Lazio - Juventus",mercato:"Under 2.5",quota:1.8,stake:5,esito:"persa",profitto:-5}),
  g({data:"2026-10-18",origine:"BET_CORE",classificazione:"BET CORE",evento:"Roma - Inter",mercato:"X2",quota:1.52,stake:10,esito:"vinta",profitto:5.2})
];
const versamenti=[
  {id:1,data:"2026-10-01",importo:100,tipoMovimento:"versamento",cassa:"PRINCIPALE"},
  {id:2,data:"2026-10-16",importo:20,tipoMovimento:"versamento",cassa:"CODICI"}
];
const storage={
  "registro-tipster-v1":JSON.stringify({giocate,versamenti,tetti:{sabato:10,domenica:10,feriali:5},budgetMese:200}),
  "registro-tipster-guided-v1":"1"
};
const localStorage={
  getItem:k=>Object.prototype.hasOwnProperty.call(storage,k)?storage[k]:null,
  setItem:(k,v)=>{storage[k]=String(v);},
  removeItem:k=>{delete storage[k];}
};
const document=new Document();
const window={
  BetCoreMarketTaxonomy:require("../market-taxonomy.js"),
  BetCoreMarketMetrics:require("../market-metrics.js"),
  BetCoreSyncMerge:require("../sync-merge.js"),
  BetCoreReceiptParser:require("../receipt-parser.js"),
  addEventListener:()=>{},scrollTo:()=>{},confirm:()=>true,alert:()=>{},scrollY:0
};
const sandbox={window,document,localStorage,navigator:{},console,Date,Math,JSON,Object,Array,String,Number,
  Boolean,RegExp,Promise,Infinity,parseFloat,parseInt,isNaN,setTimeout,clearTimeout,URL,Blob};
window.window=window;window.document=document;window.localStorage=localStorage;window.navigator=sandbox.navigator;
const html=fs.readFileSync(process.env.BETCORE_INDEX||require.resolve("../index.html"),"utf8");
vm.runInNewContext(html.slice(html.lastIndexOf("<script>")+8,html.lastIndexOf("</script>")),sandbox,{filename:"index-inline.js"});

function trova(nodo,test){
  if(test(nodo)) return nodo;
  for(const f of nodo.children){ const r=trova(f,test); if(r) return r; }
  return null;
}
function tutti(nodo,test,acc=[]){
  if(test(nodo)) acc.push(nodo);
  nodo.children.forEach(f=>tutti(f,test,acc));
  return acc;
}
const classe=(x,c)=>String(x.className||"").split(/\s+/).indexOf(c)>=0;
const app=document.getElementById("app");
const testa=()=>app.children[0], barra=()=>app.children[1];
const vai=nome=>{
  const b=trova(app,x=>x.tagName==="BUTTON"&&x.attributes["data-vista"]===nome);
  assert.ok(b,"voce di navigazione mancante: "+nome);
  b.listeners.click();
};
const salvate=()=>JSON.parse(storage["registro-tipster-v1"]).giocate;

// SOLO=1..6 esegue un caso solo (serve per la prova di mutazione).
const SOLO=process.env.SOLO||"";
const caso=n=>!SOLO||SOLO===String(n);

// 1. Schede in basso, Dati e Guida nell'intestazione.
if(caso(1)){
  assert.equal(barra().tagName,"NAV");
  assert.equal(barra().children.map(x=>x.textContent).join(","),"Registro,Live,Nuova,Codici,Cassa,Rendimento",
    "sei schede nella barra, Nuova al centro");
  assert.equal(tutti(testa(),x=>x.tagName==="BUTTON").map(x=>x.textContent).join(","),"Dati,Guida","Dati e Guida stanno nell'intestazione");
  vai("dati");
  assert.ok(app.textContent.includes("Backup e trasferimento dati"),"Dati si apre dall'intestazione");
  assert.ok(classe(trova(testa(),x=>x.textContent==="Dati"&&x.tagName==="BUTTON"),"on"),"la voce aperta e' segnata");
  assert.ok(!barra().children.some(x=>classe(x,"on")),"con Dati aperta nessuna scheda della barra e' attiva");
  vai("guida");
  assert.ok(trova(app,x=>classe(x,"guida-tit")),"Guida si apre dall'intestazione");
  vai("cassa");
  assert.equal(barra().children.filter(x=>classe(x,"on")).map(x=>x.textContent).join(","),"Cassa");
}

// 2. Intestazione compatta: la distanza dal massimo si legge solo in Cassa.
if(caso(2)){
  vai("registro");
  // Sportium: 100 versati -10 +10,50 +3,50 -5 +5,20 = 104,20. Sportbet: 20 +5,50 -5 +7,50 +4,10 = 32,10.
  assert.ok(testa().textContent.includes("€104,20+€4,20risultato reale"),"cassa Sportium in alto: "+testa().textContent.slice(0,80));
  assert.ok(testa().textContent.includes("Sportbet · codici€32,10"),"saldo Sportbet in alto: "+testa().textContent);
  assert.ok(testa().textContent.includes("€5,00 in gioco · €99,20 liberi"),"in gioco e liberi restano: "+testa().textContent);
  assert.ok(!testa().textContent.includes("dal massimo documentato"),"fuori dalla Cassa l'intestazione resta corta");
  vai("cassa");
  assert.ok(testa().textContent.includes("↓ €10,00 dal massimo documentato di €114,20"),"in Cassa c'e' la distanza dal massimo: "+testa().textContent);
}

// 3. Registro per giornata.
if(caso(3)){
  vai("registro");
  const daChiudere=trova(app,x=>classe(x,"da-chiudere"));
  assert.ok(daChiudere,"riquadro delle giocate aperte mancante");
  assert.ok(daChiudere.textContent.startsWith("Da chiudere · 1"),daChiudere.textContent.slice(0,40));
  assert.ok(daChiudere.textContent.includes("Tenerife - Ceuta"),"l'aperta sta nel riquadro in cima");
  assert.equal(tutti(daChiudere,x=>x.tagName==="BUTTON").map(x=>x.textContent).join(","),"Vinta,Persa,Rimb.,Modifica,Elimina",
    "un'aperta ha subito i tasti per chiuderla");
  const giorni=tutti(app,x=>classe(x,"giorno-testa")).map(x=>x.textContent);
  assert.deepEqual(giorni,["Dom 08/11giornata -€4,50","Sab 07/11giornata -€5,00","Lun 02/11giornata +€10,50",
    "Dom 01/11giornata +€3,50","Dom 25/10giornata +€2,50","Dom 18/10giornata +€5,20"],"giorni col loro totale, dal piu' recente");
  assert.ok(!giorni.some(x=>x.includes("14/11")),"l'aperta non compare anche fra i giorni");
  assert.ok(!app.textContent.includes("Codice 771204"),"i codici restano fuori da Tutte, e dal totale della giornata");
  const riga=()=>trova(app,x=>x.tagName==="LI"&&x.textContent.includes("Bologna - Napoli"));
  assert.equal(trova(riga(),x=>classe(x,"meta")).textContent,"X2 · @1.48 · €10,00 · Sportium","una riga sola di dettaglio");
  assert.equal(trova(riga(),x=>classe(x,"voce-dett")).style.display,"none","le azioni di una chiusa restano nascoste");
  trova(riga(),x=>classe(x,"voce-testa")).listeners.click();
  assert.equal(trova(riga(),x=>classe(x,"voce-dett")).style.display,"","toccando la riga compaiono");
  assert.equal(tutti(riga(),x=>x.tagName==="BUTTON"&&classe(x,"riga-link")).map(x=>x.textContent).join(","),"Modifica,Correggi esito,Elimina");
  assert.equal(trova(trova(app,x=>x.tagName==="LI"&&x.textContent.includes("Inter - Lazio")),x=>classe(x,"voce-dett")).style.display,"none",
    "si apre una riga alla volta");
  trova(riga(),x=>classe(x,"voce-testa")).listeners.click();
  assert.equal(trova(riga(),x=>classe(x,"voce-dett")).style.display,"none","un secondo tocco la richiude");
  const multipla=trova(app,x=>x.tagName==="LI"&&x.textContent.includes("Multipla 3 partite"));
  assert.ok(trova(multipla,x=>classe(x,"saltata")).textContent==="Saltata: Sunderland - Arsenal, 2 @1.55","la gamba persa si legge senza aprire la riga");
}

// 4. Nuova giocata a bottoni.
if(caso(4)){
  vai("nuova");
  const scelta=testo=>trova(app,x=>x.tagName==="BUTTON"&&classe(x,"scelta")&&x.textContent===testo);
  assert.ok(!trova(app,x=>x.tagName==="SELECT"&&x.children.some(o=>/origine/i.test(o.textContent))),"l'origine non e' piu' una tendina");
  for(const t of ["Veggente","BET Core","Libera","Singola","Multipla","1","X","2","1X","X2","Over 2,5","Goal","No Goal","Sportbet","Sportium"])
    assert.ok(scelta(t),"bottone mancante: "+t);
  const dettagli=()=>trova(app,x=>classe(x,"dettagli-corpo"));
  assert.equal(dettagli().style.display,"none","data, bonus e nota restano chiusi");
  assert.ok(trova(dettagli(),x=>x.tagName==="TEXTAREA"&&x.id==="campo-nota"),"ma i campi ci sono");
  trova(app,x=>classe(x,"dettagli-apri")).listeners.click();
  assert.equal(dettagli().style.display,"","si aprono dalla loro riga");
  scelta("Libera").listeners.click();
  assert.equal(scelta("Libera").attributes["aria-pressed"],"true");
  assert.equal(scelta("Veggente").attributes["aria-pressed"],"false");
  const campo=ph=>trova(app,x=>x.tagName==="INPUT"&&x.attributes.placeholder===ph);
  const scrivi=(ph,v)=>{ const i=campo(ph); i.value=v; i.listeners.input.call(i); };
  scrivi("Lazio - Genoa","Eibar - Cadiz");
  scelta("No Goal").listeners.click();
  assert.equal(scelta("No Goal").attributes["aria-pressed"],"true","il mercato scelto resta segnato");
  scelta("Sportium").listeners.click();
  scrivi("2.30","2.10"); scrivi("5.00","5");
  assert.ok(app.textContent.includes("se vince torna €10,50"),"sotto la puntata, quanto torna se vince");
  trova(app,x=>x.tagName==="BUTTON"&&x.id==="bottone-registra").listeners.click();
  const nuova=salvate().find(x=>x.evento==="Eibar - Cadiz");
  assert.ok(nuova,"giocata non salvata");
  assert.deepEqual([nuova.origine,nuova.mercato,nuova.bookmaker,nuova.tipoSchedina,nuova.quota,nuova.stake],["LIBERA","No Goal","Sportium","SINGOLA",2.1,5]);
  // Un mercato fuori dai bottoni si prende dalla tendina accanto.
  vai("nuova");
  const altri=trova(app,x=>x.tagName==="SELECT"&&x.attributes["aria-label"]==="Altri mercati");
  assert.ok(altri&&altri.children.some(o=>o.value==="Under 2.5")&&!altri.children.some(o=>o.value==="1"),"negli altri mercati non si ripetono i bottoni");
  // Una modifica riapre i dettagli da sola.
  vai("registro");
  const chiusa=trova(app,x=>x.tagName==="LI"&&x.textContent.includes("Milan - Roma"));
  trova(chiusa,x=>x.tagName==="BUTTON"&&x.textContent==="Modifica").listeners.click();
  assert.equal(dettagli().style.display,"","in modifica i dettagli sono aperti");
  assert.equal(scelta("No Goal").attributes["aria-pressed"],"true","la giocata in modifica riporta il suo mercato");
  assert.equal(scelta("BET Core").attributes["aria-pressed"],"true");
  trova(app,x=>x.tagName==="BUTTON"&&x.textContent==="Annulla modifica").listeners.click();
}

// 5. Cassa: il risultato delle giocate nel tempo.
if(caso(5)){
  vai("cassa");
  const grafico=trova(app,x=>classe(x,"grafico"));
  assert.ok(grafico,"grafico mancante");
  const t=grafico.textContent;
  // Giorno per giorno, tutte le casse: 18/10 5,20 - 25/10 7,70 - 01/11 11,20 -
  // 02/11 21,70 (il massimo) - 07/11 16,70 - 08/11 16,30 (col codice vinto).
  assert.ok(t.startsWith("Risultato giocate↓ €5,40 dal massimo"),"distanza dal massimo: "+t.slice(0,60));
  assert.ok(t.includes("18/10massimo +€21,70 · 02/11"),"partenza, massimo e sua data: "+t.slice(-80));
  assert.ok(t.endsWith("+€16,30"),"il risultato di adesso: "+t.slice(-30));
  // La linea parte da zero (y=84), tocca il massimo in cima (y=4) e chiude
  // a 16,30 su 21,70: 4 + (21,70-16,30)/21,70*80 = 23,9.
  const linea=/<path d="([^"]+)"/.exec(t)[1];
  assert.ok(linea.startsWith("M0,84 H0 V"),"partenza da zero: "+linea);
  assert.ok(/ V4 H/.test(linea),"il massimo tocca la cima: "+linea);
  assert.ok(linea.endsWith(" V23.9 H318"),"chiude al valore di adesso: "+linea);
}

// 6. Rendimento a confronto.
if(caso(6)){
  vai("tipster");
  const righe=()=>tutti(app,x=>classe(x,"confronto-riga"));
  assert.deepEqual(righe().map(x=>x.textContent),[
    "Veggente32/3+32%+€8,003 di 20 per giudicare",
    "BET Core32/3+19%+€5,703 di 20 per giudicare",
    "Libera21/2-15%-€1,502 di 20 per giudicare",
    // Nella riga Codici solo i codici: le tre Veggente giocate su Sportbet
    // stanno nella loro riga e non si contano due volte.
    "Codici11/1+410%+€4,101 di 20 per giudicare"],"una riga per origine");
  const barraV=trova(righe()[0],x=>classe(x,"barra-piena"));
  assert.equal(barraV.style.width,"15%","3 giocate su 20");
  const scheda=nome=>trova(app,x=>x.className==="scheda"&&x.textContent.startsWith(nome));
  assert.equal(scheda("Veggente").style.display,"none","il dettaglio resta chiuso");
  righe()[0].listeners.click();
  assert.equal(scheda("Veggente").style.display,"","toccando la riga si apre");
  assert.equal(scheda("Libera").style.display,"none","solo quello dell'origine toccata");
  assert.equal(righe()[0].attributes["aria-expanded"],"true");
  righe()[0].listeners.click();
  assert.equal(scheda("Veggente").style.display,"none","un secondo tocco lo richiude");
}
console.log("grafica-v460: ok");
