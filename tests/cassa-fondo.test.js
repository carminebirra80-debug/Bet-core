"use strict";

// v4.68 (27/11/2026): soldi freschi e fondo vincite. Il movimento dice nella
// nota da dove arrivano i soldi; le somme separano conto e fondo.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");

const html=fs.readFileSync(require.resolve("../index.html"),"utf8");
function estrai(inizio, fine){
  const i=html.indexOf(inizio), j=html.indexOf(fine,i);
  assert.ok(i>=0&&j>i,"blocco non trovato: "+inizio);
  return html.slice(i,j);
}
const codice=[
  estrai("  function tipoMovimento(v){","  // Effetto del movimento sulla cassa"),
  estrai("  function cent(n){","\n",),
  estrai("  var NOTA_DAL_FONDO","  function rigaFreschi(")
].join("\n");
const S={versamenti:[
  {data:"2026-12-01",importo:20,tipoMovimento:"versamento",nota:null,cassa:"CODICI"},          // dal conto (senza nota)
  {data:"2026-12-03",importo:10,tipoMovimento:"versamento",nota:"Dal fondo vincite"},
  {data:"2026-12-05",importo:30,tipoMovimento:"prelievo",nota:"Al fondo vincite"},
  {data:"2026-12-06",importo:5,tipoMovimento:"prelievo",nota:"Sul conto"},
  {data:"2026-12-07",importo:8,tipoMovimento:"prelievo",nota:null},                            // vecchio prelievo
  {data:"2026-12-08",importo:-3,tipoMovimento:"rettifica",nota:"Rettifica: codici"},           // non conta
  {data:"2027-01-02",importo:15,tipoMovimento:"versamento",nota:"Dal fondo vincite"}
]};
const ctx={S,Math,Number,String,Object};
vm.runInNewContext(codice+"\nthis.fonte=fonteMovimento; this.freschi=soldiFreschi;",ctx);

assert.equal(ctx.fonte(S.versamenti[0]),"conto","versamento senza nota: dal conto");
assert.equal(ctx.fonte(S.versamenti[1]),"fondo");
assert.equal(ctx.fonte(S.versamenti[2]),"fondo");
assert.equal(ctx.fonte(S.versamenti[3]),"conto");
assert.equal(ctx.fonte(S.versamenti[4]),"","prelievo senza nota: non indicato");
assert.equal(ctx.fonte(S.versamenti[5]),"","le rettifiche non hanno fonte");

const dic=ctx.freschi("2026-12-01","2026-12-31");
assert.equal(dic.dalConto,20);
assert.equal(dic.dalFondo,10);
assert.equal(dic.alFondo,30);
assert.equal(dic.sulConto,5);
assert.equal(dic.prelievoNonIndicato,8);
assert.equal(dic.netti,15,"freschi: 20 dal conto - 5 tornati sul conto");
assert.equal(dic.fondo,20,"fondo: +30 entrati - 10 usciti");

const gen=ctx.freschi("2027-01-01","2027-12-31");
assert.equal(gen.dalConto,0);
assert.equal(gen.dalFondo,15);
assert.equal(gen.netti,0,"versare dal fondo non sono soldi freschi");
assert.equal(gen.fondo,-15);

assert.match(html,/"text":"Versamento dal fondo"/);
assert.match(html,/"text":"Prelievo al fondo"/);
console.log("cassa-fondo: ok");
