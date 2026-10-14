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
    gambe:[{evento:"A - B",mercato:"1",quota:1.5,esito:"vinta"},{evento:"C - D",mercato:"Goal",quota:1.8,esito:"vinta"},{evento:"E - F",mercato:"X2",quota:1.85,esito:"vinta"}]},
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

  // Nuova giocata: l'origine si sceglie da un menu a tendina con le tre
  // fonti, e i campi del protocollo non compaiono finche' non e' BET Core.
  clickNav(app,"Nuova");
  assert.ok(findElement(app,x=>x.tagName==="LABEL"&&x.textContent==="Origine"),"selettore Origine mancante");
  const selOrigine=findElement(app,x=>x.tagName==="SELECT"&&x.children.some(o=>o.textContent==="Scegli l'origine…"));
  assert.ok(selOrigine,"menu a tendina dell'origine non trovato");
  assert.equal(selOrigine.children.map(o=>o.value).join(","),",VEGGENTE,BET_CORE,LIBERA");
  assert.ok(!app.textContent.includes("Probabilità stimata"),"i campi del protocollo vanno nascosti fuori da BET Core");
  for(const vecchio of ["Classificazione","Solo osservata","Fase di ingresso","Puntata consigliata","Confidence","Quota al check"]){
    assert.ok(!app.textContent.includes(vecchio),"campo superfluo ancora nel modulo: "+vecchio);
  }

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
  assert.ok(rend.includes("Veggente")&&!/Rubino|Mercante/.test(rend));
  assert.ok(rend.includes("Dal 15/09"),"il periodo di default parte dal 15/09");
  assert.ok(rend.includes("Per tipo di mercato"));
  const iM=rend.indexOf("Multipla+€8,00"),iE=rend.indexOf("Esito 1X2+€5,00"),
    iD=rend.indexOf("Doppia chance+€2,00"),iO=rend.indexOf("Over/Under-€3,00");
  assert.ok(iM>=0&&iE>=0&&iD>=0&&iO>=0,"righe per mercato mancanti: "+rend.slice(rend.indexOf("Per tipo")));
  assert.ok(iM<iE&&iE<iD&&iD<iO,"le righe devono essere ordinate per profitto");
  assert.ok(rend.includes("Giocate4"),"la scheda Veggente conta le 4 chiuse dal 15/09");
  assert.ok(rend.includes("Multiple+€8,00")&&rend.includes("Singole+€4,00"),"singole e multiple separate nella scheda");
  // Le gambe della multipla vinta: tre mercati diversi, tutte passate.
  assert.ok(rend.includes("Gambe delle multiple per mercato"),"sezione gambe mancante");
  assert.ok(/Esito 1X2100% passate1\/1 gambe vinteattese 67%/.test(rend),"riga gamba 1X2 attesa: "+rend.slice(rend.indexOf("Gambe delle")));

  // Una giocata nuova senza origine non si registra; con l'origine si',
  // e il bookmaker usato diventa quello proposto la volta dopo.
  clickNav(app,"Nuova");
  const nuovaEv=findElement(app,x=>x.tagName==="INPUT"&&x.attributes.placeholder==="Lazio - Genoa");
  nuovaEv.value="Lazio - Genoa"; nuovaEv.listeners.input.call(nuovaEv);
  const selMercato=findElement(app,x=>x.tagName==="SELECT"&&x.children.some(o=>o.textContent==="Seleziona mercato…"));
  selMercato.value="1"; selMercato.listeners.change.call(selMercato);
  for(const [ph,v] of [["2.30","2.10"],["5.00","4"]]){
    const i=findElement(app,x=>x.tagName==="INPUT"&&x.attributes.placeholder===ph); i.value=v; i.listeners.input.call(i);
  }
  findElement(app,x=>x.tagName==="BUTTON"&&x.textContent==="Registra giocata").listeners.click();
  assert.ok(app.children[0].textContent.includes("Scegli l'origine"),"senza origine la giocata va bloccata");
  const sel=findElement(app,x=>x.tagName==="SELECT"&&x.children.some(o=>o.textContent==="Scegli l'origine…"));
  sel.value="LIBERA"; sel.listeners.change.call(sel);
  const selBook=findElement(app,x=>x.tagName==="SELECT"&&x.children.some(o=>o.textContent==="Lottomatica"));
  selBook.value="SNAI"; selBook.listeners.change.call(selBook);
  findElement(app,x=>x.tagName==="BUTTON"&&x.textContent==="Registra giocata").listeners.click();
  const nuova=JSON.parse(storage["registro-tipster-v1"]).giocate.find(g=>g.evento==="Lazio - Genoa");
  assert.ok(nuova,"giocata nuova non salvata");
  assert.equal(nuova.origine,"LIBERA");
  assert.equal(nuova.classificazione,"PERSONALE");
  assert.equal(nuova.stake,4);
  assert.equal(storage["registro-ultimo-bookmaker"],"SNAI","il bookmaker usato va ricordato");

  // Da proposta Veggente: la proposta compila origine, gambe e quota; la
  // giocata salvata porta con se' il collegamento. Togliendo una gamba la
  // giocata resta collegata ma diventa una variante.
  async function giocaProposta(testoProposta,stake,togliGamba){
    clickNav(app,"Nuova");
    // Il pannello manuale compare solo per le giocate Veggente.
    assert.ok(!findElement(app,x=>x.tagName==="BUTTON"&&x.textContent==="Scegli proposta"),"senza origine Veggente il pannello manuale non serve");
    const so=findElement(app,x=>x.tagName==="SELECT"&&x.children.some(o=>o.textContent==="Scegli l'origine…"));
    so.value="VEGGENTE"; so.listeners.change.call(so);
    findElement(app,x=>x.tagName==="BUTTON"&&x.textContent==="Scegli proposta").listeners.click();
    await new Promise(resolve=>setTimeout(resolve,5));
    const voce=findElement(app,x=>x.tagName==="BUTTON"&&x.className==="proposta-voce"&&x.textContent.startsWith(testoProposta));
    assert.ok(voce,"proposta non mostrata: "+testoProposta);
    voce.listeners.click();
    assert.ok(app.textContent.includes("Collegata a: "+testoProposta),"il modulo deve dire a quale proposta e' collegato");
    if(togliGamba) findElement(app,x=>x.tagName==="BUTTON"&&x.textContent==="Rimuovi").listeners.click();
    const st=findElement(app,x=>x.tagName==="INPUT"&&x.attributes.placeholder==="5.00");
    st.value=stake; st.listeners.input.call(st);
    findElement(app,x=>x.tagName==="BUTTON"&&x.textContent==="Registra giocata").listeners.click();
  }
  await giocaProposta("Raddoppio",10,false);
  assert.ok(calls.some(c=>c.azione==="rpc"&&c.nome==="proposte_veggente_app"),"le proposte vanno lette dalla funzione dedicata");
  let regVeg=JSON.parse(storage["registro-tipster-v1"]).giocate;
  const raddoppio=regVeg.find(g=>g.propostaVeggenteId===64);
  assert.ok(raddoppio,"giocata collegata al raddoppio non salvata");
  assert.equal(raddoppio.origine,"VEGGENTE");
  assert.equal(raddoppio.quota,2.16);
  assert.equal(raddoppio.gambe.length,2);
  assert.equal(raddoppio.gambe[1].quota,1.5);
  assert.equal(raddoppio.propostaTipo,"RADDOPPIO");
  assert.equal(raddoppio.propostaVariante,false,"giocata tale e quale: non e' una variante");

  await giocaProposta("Multipla quota 5",3,true);
  regVeg=JSON.parse(storage["registro-tipster-v1"]).giocate;
  const variante=regVeg.find(g=>g.propostaVeggenteId===65);
  assert.ok(variante,"giocata collegata alla multipla non salvata");
  assert.equal(variante.gambe.length,2);
  assert.equal(variante.propostaVariante,true,"con una gamba in meno e' una variante");

  // Registro e Rendimento mostrano il tipo di proposta.
  clickNav(app,"Registro");
  assert.ok(app.textContent.includes("Multipla quota 5 · variante"),"badge della variante mancante nel registro");

  // Sync: le righe dei tipster eliminati non vanno rimandate al cloud.
  clickNav(app,"Dati");
  const invia=findElement(app,x=>x.tagName==="BUTTON"&&x.textContent==="Invia ora");
  assert.ok(invia,"Pulsante Invia ora non trovato");
  invia.listeners.click();
  await new Promise(resolve=>setTimeout(resolve,5));
  const up=calls.find(x=>x.azione==="upsert"&&x.table==="picks");
  assert.ok(up,"upsert picks non eseguito");
  assert.ok(!up.rows.some(r=>r.tipster==="rubino"||r.tipster==="mercante"),"inviate al cloud righe dei tipster eliminati");
  const origineInviata=ev=>(up.rows.find(r=>r.evento===ev)||{}).origine;
  assert.equal(origineInviata("Settembre - Vecchia"),"VEGGENTE","dal 15/09 le giocate sono del Veggente");
  assert.equal(origineInviata("Analisi - Settembre"),"BET_CORE","le osservate del protocollo sono BET Core");
  assert.equal(origineInviata("Lazio - Genoa"),"LIBERA");
  const rigaRaddoppio=up.rows.find(r=>r.proposta_veggente_id===64);
  assert.ok(rigaRaddoppio,"il collegamento alla proposta va mandato al cloud");
  assert.equal(rigaRaddoppio.proposta_tipo,"RADDOPPIO");
  assert.equal(rigaRaddoppio.proposta_variante,false);
  assert.equal(up.rows.find(r=>r.proposta_veggente_id===65).proposta_variante,true);
  assert.equal(origineInviata("Settembre - Vecchia")&&up.rows.find(r=>r.evento==="Settembre - Vecchia").proposta_veggente_id,null,
    "le giocate senza proposta restano senza collegamento");
  const gambeInviate=up.rows.find(r=>r.legacy_id==="6").gambe;
  assert.equal(JSON.stringify(gambeInviate[0]),JSON.stringify({evento:"A - B",mercato:"1",quota:1.5,esito:"vinta"}),"quota ed esito della gamba vanno al cloud");
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
