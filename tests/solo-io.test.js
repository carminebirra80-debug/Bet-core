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

const base={quotaCheck:null,confidence:3,debrief:"",statoCore:"ufficiale",osservata:false,bookmaker:"Sportbet",
  faseIngresso:"PRE",classificazione:"PERSONALE",ticketId:"",orarioIngresso:"",gambe:[],tipoSchedina:"SINGOLA",nota:""};
const picks=[
  {...base,id:1,data:"2026-09-20",tipster:"io",evento:"Settembre - Vecchia",mercato:"1",quota:2,stake:5,esito:"vinta",profitto:5},
  {...base,id:2,data:"2026-09-10",tipster:"rubino",evento:"Rubino - Prova",mercato:"Over 2.5",quota:2,stake:5,esito:"persa",profitto:-5,classificazione:"TIPSTER"},
  {...base,id:3,data:"2026-10-02",tipster:"mercante",evento:"Mercante - Prova",mercato:"1",quota:2,stake:4,esito:"persa",profitto:-4,classificazione:"TIPSTER"},
  {...base,id:4,data:"2026-09-05",tipster:"BET Core",evento:"Analisi - Settembre",mercato:"X2",quota:1.8,stake:0,esito:"persa",profitto:0,osservata:true,statoCore:"scartata",classificazione:"SCARTATA"},
  {...base,id:5,data:"2026-10-02",tipster:"io",evento:"Svezia - Romania",mercato:"1X",quota:1.5,stake:4,esito:"vinta",profitto:2},
  {...base,id:6,data:"2026-10-03",tipster:"io",evento:"Multipla · 3 gambe",mercato:"MULTIPLA",tipoSchedina:"MULTIPLA",quota:5,stake:2,esito:"vinta",profitto:8,
    gambe:[{evento:"A - B",mercato:"1"},{evento:"C - D",mercato:"Goal"},{evento:"E - F",mercato:"X2"}]},
  {...base,id:7,data:"2026-10-04",tipster:"io",evento:"Turchia - Italia",mercato:"Over 2.5",quota:1.9,stake:3,esito:"persa",profitto:-3},
  {...base,id:8,data:"2026-10-05",tipster:"io",evento:"Aperta - Ancora",mercato:"1",quota:2,stake:2,esito:"aperta",profitto:0}
];
const storage={
  "registro-tipster-v1":JSON.stringify({giocate:picks,versamenti:[
    {id:1,data:"2026-09-05",importo:30,tipoMovimento:"versamento"},
    {id:3,data:"2026-09-17",importo:15,tipoMovimento:"prelievo"},
    {id:2,data:"2026-10-06",importo:-20,tipoMovimento:"rettifica",nota:"Allineamento al saldo del bookmaker"}
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
  from:table=>({
    upsert:async(rows,options)=>{calls.push({azione:"upsert",table,rows,options});return {error:null};},
    select:()=>{
      const result={error:null,data:table==="impostazioni"?null:[],count:0};
      const chain={eq:()=>chain,order:async()=>result,maybeSingle:async()=>result,
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

  // Registro: niente Rubino ne' Mercante, nemmeno la giocata di ottobre di
  // Mercante; l'analisi "BET Core" resta e si chiama col suo nome.
  clickNav(app,"Registro");
  const reg=app.textContent;
  assert.ok(!reg.includes("Rubino - Prova"),"le giocate di Rubino devono sparire dal registro");
  assert.ok(!reg.includes("Mercante - Prova"),"le giocate di Mercante devono sparire, anche se di ottobre");
  assert.ok(!/Rubino|Mercante/.test(reg),"nessuna traccia dei tipster eliminati");
  assert.ok(reg.includes("Analisi - Settembre"),"le analisi BET Core restano nel registro");
  // Prima della modifica un'origine sconosciuta prendeva la sigla del primo
  // tipster in elenco (MC, Mercante); ora porta le sue iniziali.
  const rigaCore=findElement(app,x=>x.tagName==="LI"&&x.textContent.includes("Analisi - Settembre"));
  assert.ok(rigaCore&&rigaCore.textContent.includes("BC"),"sigla BC attesa per BET Core");
  assert.ok(!/\b(MC|FR)\b/.test(reg),"sigle dei tipster eliminati ancora presenti");
  assert.ok(reg.includes("Settembre - Vecchia"),"le giocate di settembre restano visibili nel registro");

  // Nuova giocata: con un solo tipster il selettore Origine non serve.
  clickNav(app,"Nuova");
  assert.ok(!findElement(app,x=>x.tagName==="LABEL"&&x.textContent==="Origine"),"selettore Origine da nascondere");

  // Cassa: conta tutto. Versati 30 - prelievo 15 + rettifica -20 + profitti
  // 5 (settembre) + 2 + 8 - 3 = 7. Le perdite di Rubino (-5) e Mercante (-4)
  // non ci sono piu': con loro sarebbe -2.
  clickNav(app,"Cassa");
  assert.ok(app.textContent.includes("Hai versato €30,00, prelevato €15,00 e registrato rettifiche -€20,00; in cassa hai €7,00."),
    "cassa attesa €7,00: "+app.textContent.match(/(Hai versato|Registra)[^.]*\./));
  // Risultato reale = cassa + prelevato - versato = 7 + 15 - 30 = -8, anche
  // se le giocate fanno +12: prima l'app mostrava +12 come "Risultato reale".
  let verdetto=findElement(app,x=>x.className==="verdetto");
  assert.ok(verdetto,"riquadro del risultato non trovato");
  let tv=verdetto.textContent;
  assert.ok(tv.includes("Risultato reale-€8,00"),"risultato reale atteso -€8,00: "+tv);
  assert.ok(tv.includes("Rendimento sul versato: -26.7%"),"rendimento atteso -26.7%: "+tv);
  assert.ok(tv.includes("Dalle giocate: +€12,00 · ROI +85.7% su €14,00 puntati"),"riga giocate attesa: "+tv);
  let intest=app.children[0].textContent;
  assert.ok(intest.includes("€7,00-€8,00"),"in alto accanto alla cassa va il risultato reale: "+intest.slice(0,60));
  assert.ok(app.textContent.includes("versati €30,00 · prelevati €15,00"),"il riepilogo deve mostrare il prelievo di settembre");
  assert.ok(app.textContent.includes("prelievo-€15,00"),"lo storico deve mostrare il prelievo col segno meno");

  // Un nuovo prelievo dal modulo toglie soldi dalla cassa ma non cambia il
  // risultato reale: sono soldi incassati, non persi.
  const inImporto=findElement(app,x=>x.tagName==="INPUT"&&x.attributes.placeholder==="100.00");
  const bPrelievo=findElement(app,x=>x.tagName==="BUTTON"&&x.textContent==="Registra prelievo");
  assert.ok(inImporto&&bPrelievo,"modulo prelievo non trovato");
  inImporto.value="5"; bPrelievo.listeners.click();
  intest=app.children[0].textContent;
  assert.ok(intest.includes("€2,00-€8,00"),"dopo il prelievo cassa €2,00 e risultato ancora -€8,00: "+intest.slice(0,60));
  const mov=JSON.parse(storage["registro-tipster-v1"]).versamenti;
  assert.ok(mov.some(v=>v.tipoMovimento==="prelievo"&&v.importo===5&&v.cloudDirty),"prelievo da salvare e mandare al cloud");
  assert.ok(app.textContent.includes("Settembre 2026+€5,00"),"settembre deve restare nel riepilogo mensile con il suo risultato");

  // Rendimento: scheda unica e riepilogo per tipo di mercato, ordinato per profitto.
  clickNav(app,"Rendimento");
  const rend=app.textContent;
  assert.ok(rend.includes("Le mie")&&!/Rubino|Mercante/.test(rend));
  assert.ok(rend.includes("Per tipo di mercato"));
  const iM=rend.indexOf("Multipla+€8,00"),iE=rend.indexOf("Esito 1X2+€5,00"),
    iD=rend.indexOf("Doppia chance+€2,00"),iO=rend.indexOf("Over/Under-€3,00");
  assert.ok(iM>=0&&iE>=0&&iD>=0&&iO>=0,"righe per mercato mancanti: "+rend.slice(rend.indexOf("Per tipo")));
  assert.ok(iM<iE&&iE<iD&&iD<iO,"le righe devono essere ordinate per profitto");
  assert.ok(rend.includes("Giocate4"),"la scheda conta le 4 chiuse, settembre compreso");

  // Sync: le righe dei tipster eliminati non vanno rimandate al cloud.
  clickNav(app,"Dati");
  const invia=findElement(app,x=>x.tagName==="BUTTON"&&x.textContent==="Invia ora");
  assert.ok(invia,"Pulsante Invia ora non trovato");
  invia.listeners.click();
  await new Promise(resolve=>setTimeout(resolve,5));
  const up=calls.find(x=>x.azione==="upsert"&&x.table==="picks");
  assert.ok(up,"upsert picks non eseguito");
  assert.ok(!up.rows.some(r=>r.tipster==="rubino"||r.tipster==="mercante"),"inviate al cloud righe dei tipster eliminati");
  const salvate=JSON.parse(storage["registro-tipster-v1"]).giocate;
  assert.ok(!salvate.some(g=>g.tipster==="rubino"||g.tipster==="mercante"),"copia locale ancora con i tipster eliminati");

  console.log("solo io: ok");
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
