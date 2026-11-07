const CACHE='bet-core-v4-58-aggiorna-notifiche';
const ASSETS=['./','./index.html','./market-taxonomy.js?v=20261021a','./market-metrics.js?v=20261021a','./sync-merge.js?v=20261021a','./receipt-parser.js?v=20261021a','./manifest.webmanifest','./icon-192.png','./icon-512.png'];

// Aggiornamento (v4.58, 07/11/2026). Prima la versione nuova prendeva il
// posto della vecchia da sola, mentre l'app era aperta, e la pagina restava
// quella vecchia: da qui il "chiudi e riapri due volte". Ora la nuova
// aspetta: l'app mostra "Nuova versione · Aggiorna" e, al tocco, manda il
// messaggio 'aggiorna'; solo allora questa subentra e la pagina si ricarica.
// Alla prima installazione (nessuna versione attiva) parte subito.
self.addEventListener('install',e=>e.waitUntil(
  caches.open(CACHE).then(c=>c.addAll(ASSETS.map(u=>new Request(u,{cache:'reload'}))))
    .then(()=>{ if(!self.registration.active) return self.skipWaiting(); })
));
self.addEventListener('message',e=>{ if(e.data&&e.data.tipo==='aggiorna') self.skipWaiting(); });
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));

// Rete prima, cache solo senza connessione. Per i file dell'app si salta la
// cache HTTP del browser (GitHub Pages la tiene 10 minuti): altrimenti, dopo
// l'aggiornamento, poteva tornare per un po' l'index.html vecchio.
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  const stesso=new URL(e.request.url).origin===self.location.origin;
  const rete=stesso ? fetch(e.request.url,{cache:'no-cache',credentials:'same-origin'}) : fetch(e.request);
  e.respondWith(rete.then(r=>{
    if(r&&r.ok){ const copy=r.clone(); caches.open(CACHE).then(c=>c.put(e.request,copy)); }
    return r;
  }).catch(()=>caches.match(e.request).then(r=>r||(e.request.mode==='navigate'?caches.match('./index.html'):Response.error()))));
});

// Notifiche (v4.58). Il server (funzione "notifiche") manda titolo, testo e
// la scheda da aprire; al tocco si torna sull'app gia' aperta o la si apre.
self.addEventListener('push',e=>{
  let d={};
  try{ d=e.data?e.data.json():{}; }catch(_){ d={testo:e.data?e.data.text():''}; }
  const titolo=d.titolo||'BET Core';
  e.waitUntil(self.registration.showNotification(titolo,{
    body:d.testo||'',
    icon:'./icon-192.png',
    badge:'./icon-192.png',
    tag:d.tag||undefined,
    renotify:!!d.tag,
    data:{url:d.url||'./index.html'}
  }));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const url=new URL((e.notification.data&&e.notification.data.url)||'./index.html',self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(lista=>{
    for(const c of lista){ if(c.url.startsWith(self.registration.scope)&&'focus' in c){ c.postMessage({tipo:'apri',url}); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
