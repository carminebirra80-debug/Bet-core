"use strict";

// 06/10/2026: Rubino e Mercante eliminati (anche le loro giocate), scheda
// Tipster diventata Rendimento. Agosto e settembre restano nei conti: Carmine
// ha scelto di contare tutto da agosto, statistiche e cassa.

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


// Una giocata principale e una cassa principale con 50 versati.
const base={quotaCheck:null,confidence:null,debrief:"",statoCore:"ufficiale",osservata:false,bookmaker:"Sportium",
  faseIngresso:"PRE",classificazione:"PERSONALE",ticketId:"",orarioIngresso:"",gambe:[],tipoSchedina:"SINGOLA",nota:""};
const oggiIso=(()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);})();
const picks=[
  {...base,id:1,data:"2026-10-16",tipster:"io",origine:"VEGGENTE",evento:"Inter - Roma",mercato:"1",quota:2,stake:5,esito:"vinta",profitto:5},
  // Un codice di ieri ancora aperto: deve comparire in "Ancora da chiudere".
  {...base,id:2,data:"2026-10-16",tipster:"io",origine:"CODICI",codiceSchedina:"111111",evento:"Codice 111111",mercato:"MULTIPLA",
    tipoSchedina:"MULTIPLA",bookmaker:"Sportbet",quota:4,stake:1,esito:"aperta",profitto:0,orarioIngresso:"2026-10-16T10:00:00.000Z"}
];
const storage={
  "registro-tipster-v1":JSON.stringify({giocate:picks,versamenti:[
    {id:1,data:"2026-10-01",importo:50,tipoMovimento:"versamento"}
  ],tetti:{sabato:10,domenica:10,feriali:5},budgetMese:200}),
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
  // Le proposte del Veggente arrivano da una funzione, non da una tabella.
  rpc:async(nome,parametri)=>{
    calls.push({azione:"rpc",nome,parametri});
    return {error:null,data:[
      {id:64,data:"2026-10-14",tipo:"RADDOPPIO",stato:"PROPOSTA",quota_totale:2.16,giocata:false,
        gambe:[{partita:"Italia - Israele",mercato:"Over 2.5",quota:1.44,voto:"A"},{partita:"Norvegia - Slovenia",mercato:"1",quota:1.50,voto:"A"}]},
      {id:65,data:"2026-10-14",tipo:"MULTIPLA_5",stato:"PROPOSTA",quota_totale:4.59,giocata:false,
        gambe:[{partita:"A - B",mercato:"1",quota:1.5},{partita:"C - D",mercato:"Goal",quota:1.7},{partita:"E - F",mercato:"X2",quota:1.8}]}
    ]};
  },
  from:table=>({
    upsert:async(rows,options)=>{calls.push({azione:"upsert",table,rows,options});return {error:null};},
    select:()=>{
      const result={error:null,data:table==="impostazioni"?null:[],count:0};
      const chain={eq:()=>chain,order:async()=>result,maybeSingle:async()=>({error:null,data:null}),
        then:(resolve,reject)=>Promise.resolve(result).then(resolve,reject)};
      return chain;
    },
    delete:()=>{calls.push({azione:"delete",table});return {eq:()=>({eq:async()=>({error:null})})};},
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
  await new Promise(resolve=>setTimeout(resolve,5));
  const app=document.getElementById("app");
  const cassaInAlto=()=>app.children[0].textContent;
  assert.ok(cassaInAlto().includes("€55,00"),"cassa principale attesa 50 + 5: "+cassaInAlto().slice(0,40));

  // Registrare un codice: tre campi e +. La puntata parte da 1 €.
  clickNav(app,"Codici");
  assert.ok(app.textContent.includes("Cassa codici · Sportbet"));
  assert.ok(app.textContent.includes("Ancora da chiudere"),"il codice di ieri ancora aperto va mostrato");
  function campo(ph){ return findElement(app,x=>x.tagName==="INPUT"&&x.attributes.placeholder===ph); }
  const puntata=findElement(app,x=>x.tagName==="INPUT"&&x.parentNode&&x.parentNode.className==="codici-riga"&&x.attributes.value==="1");
  assert.ok(puntata,"la puntata deve partire da 1 €");
  async function registra(codice,quota,stake){
    const c=campo("Codice"), q=campo("Quota");
    c.value=codice; q.value=quota;
    const p=findElement(app,x=>x.tagName==="INPUT"&&x.parentNode&&x.parentNode.className==="codici-riga"&&x.attributes.placeholder===undefined);
    if(stake!==undefined) p.value=stake; else p.value=p.attributes.value;
    findElement(app,x=>x.tagName==="BUTTON"&&x.textContent==="+").listeners.click();
  }
  await registra("186516","4.20");
  await registra("521267","7.85","3");
  await registra("186516","4.20","1");   // stesso codice giocato due volte: due giocate
  let salvate=JSON.parse(storage["registro-tipster-v1"]).giocate.filter(g=>g.origine==="CODICI");
  assert.equal(salvate.length,4,"tre codici nuovi piu' quello di ieri");
  const nuovo=salvate.find(g=>g.codiceSchedina==="521267");
  assert.equal(nuovo.quota,7.85); assert.equal(nuovo.stake,3); assert.equal(nuovo.bookmaker,"Sportbet");
  assert.equal(nuovo.data,oggiIso); assert.equal(nuovo.esito,"aperta");
  assert.equal(storage["registro-ultima-puntata-codici"],"1","si ricorda l'ultima puntata usata");
  // Quota mancante: niente codice, e l'errore lo dice.
  await registra("999999","");
  assert.ok(cassaInAlto().includes("Inserisci la quota del codice"));
  assert.equal(JSON.parse(storage["registro-tipster-v1"]).giocate.filter(g=>g.origine==="CODICI").length,4);

  // Cassa codici: si parte spostando 20 € dalla principale.
  clickNav(app,"Codici");
  const importo=findElement(app,x=>x.tagName==="INPUT"&&x.attributes.placeholder==="20.00");
  importo.value="20";
  findElement(app,x=>x.tagName==="BUTTON"&&x.textContent==="Sposta dalla principale").listeners.click();
  // Principale: 55 - 20 = 35. Codici: 20 versati, nessuna giocata chiusa.
  assert.ok(!cassaInAlto().includes("dal massimo documentato"),"spostare soldi non e' un calo della cassa: "+cassaInAlto());
  assert.ok(cassaInAlto().includes("€35,00+€5,00"),"la principale scende di 20, il risultato reale resta +5: "+cassaInAlto().slice(0,40));
  let verd=findElement(app,x=>x.className==="verdetto").textContent;
  assert.ok(verd.includes("€20,00"),"la cassa codici sale a 20: "+verd);
  assert.ok(verd.includes("€6,00 in gioco"),"1+3+1+1 in gioco: "+verd);
  assert.ok(verd.includes("risultato +€0,00"),"spostare soldi non e' un risultato: "+verd);
  const mov=JSON.parse(storage["registro-tipster-v1"]).versamenti;
  assert.ok(mov.some(v=>v.cassa==="CODICI"&&v.importo===20&&v.tipoMovimento==="rettifica"));
  assert.ok(mov.some(v=>v.cassa==="PRINCIPALE"&&v.importo===-20&&v.tipoMovimento==="rettifica"));

  // Chiusura direttamente dalla lista: 521267 vinto (3 x 7.85 - 3 = 20.55).
  const rigaVinta=findElement(app,x=>x.tagName==="LI"&&x.className==="codici-voce"&&x.textContent.includes("521267"));
  findElement(rigaVinta,x=>x.tagName==="BUTTON"&&x.textContent==="Vinta").listeners.click();
  await new Promise(resolve=>setTimeout(resolve,5));
  const rigaPersa=findElement(app,x=>x.tagName==="LI"&&x.className==="codici-voce"&&x.textContent.includes("111111"));
  findElement(rigaPersa,x=>x.tagName==="BUTTON"&&x.textContent==="Persa").listeners.click();
  await new Promise(resolve=>setTimeout(resolve,5));
  verd=findElement(app,x=>x.className==="verdetto").textContent;
  // 20 + 20.55 - 1 = 39.55
  assert.ok(verd.includes("€39,55"),"cassa codici dopo le chiusure: "+verd);
  assert.ok(verd.includes("risultato +€19,55"),"risultato dei codici: "+verd);
  assert.ok(cassaInAlto().includes("€35,00"),"i codici non toccano la principale: "+cassaInAlto().slice(0,40));
  // In alto anche il saldo Sportbet dei codici, con i soldi in gioco.
  assert.ok(cassaInAlto().includes("+€5,00risultato reale"),"il numero accanto alla cassa dice cos'e': "+cassaInAlto().slice(0,60));
  assert.ok(cassaInAlto().includes("Cassa · Sportium (Veggente)"),"etichetta della cassa principale: "+cassaInAlto().slice(0,60));
  assert.ok(cassaInAlto().includes("Sportbet · codici€39,55 · €2,00 in gioco"),"saldo codici in alto: "+cassaInAlto());
  assert.ok(app.textContent.includes("+€20,55"),"profitto del codice vinto nella lista");

  // Cassa: il totale delle due casse. Principale 35, codici 39,55.
  clickNav(app,"Cassa");
  const tot=findElement(app,x=>String(x.className).indexOf("totale-casse")>=0);
  assert.ok(tot,"riquadro del totale mancante");
  const tt=tot.textContent;
  assert.ok(tt.includes("In cassa€35,00€39,55€74,55"),"totale in cassa: "+tt);
  assert.ok(tt.includes("Versato€50,00€0,00€50,00"),"totale versato: "+tt);
  // Risultato: principale +5, codici +19,55 (lo spostamento non conta).
  assert.ok(tt.includes("Risultato reale+€5,00+€19,55+€24,55"),"risultato totale: "+tt);

  // Registro: i codici non lo intasano, compaiono solo col loro filtro.
  clickNav(app,"Registro");
  assert.ok(app.textContent.includes("Inter - Roma"));
  assert.ok(!app.textContent.includes("Codice 186516"),"i codici non vanno nella vista Tutte");
  findElement(app,x=>x.tagName==="BUTTON"&&String(x.className).indexOf("chip")===0&&x.textContent==="Codici").listeners.click();
  assert.ok(app.textContent.includes("Codice 186516")&&!app.textContent.includes("Inter - Roma"));

  // Rendimento: scheda Codici Veggente a parte, la scheda Veggente non li vede.
  clickNav(app,"Rendimento");
  const rend=app.textContent;
  assert.ok(rend.includes("Codici Veggente+€19,55"),"scheda codici: +20,55 - 1: "+rend.slice(0,400));
  assert.ok(rend.includes("Codici2"),"due codici chiusi");
  assert.ok(rend.includes("Quota 6 – 10+€20,55"),"fascia di quota del codice vinto");
  assert.ok(rend.includes("Veggente+€5,00"),"la scheda Veggente resta con la sua sola giocata");


  // Sync: origine e codice vanno al cloud, i movimenti con la loro cassa.
  clickNav(app,"Dati");
  findElement(app,x=>x.tagName==="BUTTON"&&x.textContent==="Invia ora").listeners.click();
  await new Promise(resolve=>setTimeout(resolve,5));
  const up=calls.filter(x=>x.azione==="upsert"&&x.table==="picks").pop();
  const rigaCodice=up.rows.find(r=>r.codice_schedina==="521267");
  assert.ok(rigaCodice,"il codice va al cloud");
  assert.equal(rigaCodice.origine,"CODICI");
  const upV=calls.filter(x=>x.azione==="upsert"&&x.table==="versamenti").pop();
  assert.ok(upV.rows.some(r=>r.cassa==="CODICI"&&r.importo===20),"il movimento della cassa codici va al cloud con la sua cassa");
  assert.ok(upV.rows.some(r=>r.cassa==="PRINCIPALE"&&r.importo===50),"i movimenti vecchi restano della principale");

  console.log("codici: ok");
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
