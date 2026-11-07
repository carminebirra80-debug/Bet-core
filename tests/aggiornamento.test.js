"use strict";

// Aggiornamento e notifiche (v4.58, 07/11/2026). Fino alla 4.57 la versione
// nuova subentrava da sola ad app aperta e la pagina restava vecchia: da qui
// il "chiudi e riapri due volte". Ora sw.js aspetta il tocco su "Aggiorna"
// (messaggio 'aggiorna'), tranne alla prima installazione. Qui si esegue
// sw.js con un "self" finto e si controlla anche che la scheda Notifiche
// compaia in Dati e che il push mostri la notifica.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const codice = fs.readFileSync(path.join(__dirname, "..", "sw.js"), "utf8");

function carica(attiva) {
  const ascolto = {}, mostrate = [];
  let saltata = 0;
  const self = {
    location: { origin: "https://x.github.io" },
    registration: { active: attiva ? {} : null, scope: "https://x.github.io/Bet-core/",
      showNotification: (t, o) => { mostrate.push({ t, o }); return Promise.resolve(); } },
    addEventListener: (n, f) => { ascolto[n] = f; },
    skipWaiting: () => { saltata++; return Promise.resolve(); },
    clients: { claim: () => Promise.resolve(), matchAll: () => Promise.resolve([]), openWindow: () => Promise.resolve() },
  };
  const caches = { open: () => Promise.resolve({ addAll: () => Promise.resolve(), put: () => {} }), keys: () => Promise.resolve([]) };
  vm.runInNewContext(codice, { self, caches, Request: function (u) { this.url = u; }, URL, fetch: () => Promise.reject(new Error("rete")), Promise });
  return { ascolto, mostrate, saltate: () => saltata };
}
async function installa(sw) {
  let p; sw.ascolto.install({ waitUntil: (x) => { p = x; } }); await p;
}

(async () => {
  // Prima installazione: parte subito.
  const primo = carica(false);
  await installa(primo);
  assert.equal(primo.saltate(), 1, "alla prima installazione deve partire subito");

  // C'e' gia' una versione attiva: aspetta il tocco su Aggiorna.
  const nuovo = carica(true);
  await installa(nuovo);
  assert.equal(nuovo.saltate(), 0, "con una versione attiva deve aspettare");
  nuovo.ascolto.message({ data: { tipo: "altro" } });
  assert.equal(nuovo.saltate(), 0);
  nuovo.ascolto.message({ data: { tipo: "aggiorna" } });
  assert.equal(nuovo.saltate(), 1, "al tocco su Aggiorna deve subentrare");

  // Push: titolo, testo e scheda da aprire arrivano alla notifica.
  let attesa;
  nuovo.ascolto.push({ data: { json: () => ({ titolo: "T-60", testo: "Courtois fuori", url: "./index.html?vista=live", tag: "t60" }) },
    waitUntil: (x) => { attesa = x; } });
  await attesa;
  assert.equal(nuovo.mostrate.length, 1);
  assert.equal(nuovo.mostrate[0].t, "T-60");
  assert.equal(nuovo.mostrate[0].o.body, "Courtois fuori");
  assert.equal(nuovo.mostrate[0].o.data.url, "./index.html?vista=live");

  // Nell'app: barra di aggiornamento e scheda Notifiche.
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.ok(html.includes('register("./sw.js",{updateViaCache:"none"})'), "sw.js va controllato senza cache HTTP");
  assert.ok(html.includes('postMessage({tipo:"aggiorna"})'), "il tasto Aggiorna deve mandare il messaggio");
  assert.ok(/pag\.appendChild\(schedaNotifiche\(\)\);/.test(html), "la scheda Notifiche deve stare in Dati");
  assert.ok(!html.includes("chiudi e riapri l'app due volte"), "il vecchio consiglio non serve piu'");

  console.log("aggiornamento: ok");
})().catch((e) => { console.error(e); process.exit(1); });
