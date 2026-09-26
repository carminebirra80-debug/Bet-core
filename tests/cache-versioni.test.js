"use strict";

// Il 26/09/2026, subito dopo l'aggiornamento, il telefono ha caricato il
// nuovo index.html con il vecchio receipt-parser.js ancora in cache
// ("parseRicevuta is not a function"). Ogni script locale deve quindi avere
// un parametro di versione, e sw.js deve precaricare gli stessi URL.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const root=path.join(__dirname,"..");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const sw=fs.readFileSync(path.join(root,"sw.js"),"utf8");

const locali=[...html.matchAll(/<script src="\.\/([^"]+)"><\/script>/g)].map(m=>m[1]);
assert.ok(locali.length>=4,"script locali non trovati");
const versioni=new Set();
locali.forEach(function(src){
  const m=src.match(/^([\w-]+\.js)\?v=(\w+)$/);
  assert.ok(m,"script senza versione: "+src);
  versioni.add(m[2]);
  assert.ok(sw.includes("'./"+src+"'"),"sw.js non precarica "+src);
});
assert.equal(versioni.size,1,"gli script hanno versioni diverse");

console.log("cache-versioni: ok");
