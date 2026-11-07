// Web Push senza librerie (07/11/2026): cifratura RFC 8291 (aes128gcm) e
// firma VAPID RFC 8292 (ES256) con le sole WebCrypto, che ci sono sia nelle
// funzioni Edge (Deno) sia in Node: cosi' lo stesso file si prova in
// tests/notifiche-webpush.test.js contro un'implementazione indipendente.

const te = new TextEncoder();

export function b64u(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function daB64u(t: string): Uint8Array {
  const pulito = t.replace(/-/g, "+").replace(/_/g, "/");
  const b = atob(pulito + "===".slice((pulito.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}
function unisci(...parti: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parti.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parti) { out.set(p, i); i += p.length; }
  return out;
}

export type ChiaviVapid = { pubblica: string; privata: JsonWebKey };

// Coppia di chiavi VAPID: la pubblica (65 byte, base64url) va al telefono,
// la privata (JWK) resta nel database, tabella push_config.
export async function generaChiavi(): Promise<ChiaviVapid> {
  const k = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", k.publicKey));
  const privata = await crypto.subtle.exportKey("jwk", k.privateKey);
  return { pubblica: b64u(raw), privata };
}

// Intestazione Authorization VAPID per il servizio push (FCM per Android).
export async function vapid(endpoint: string, chiavi: ChiaviVapid, soggetto: string, ora = Date.now()): Promise<string> {
  const aud = new URL(endpoint).origin;
  const testa = b64u(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const corpo = b64u(te.encode(JSON.stringify({ aud, exp: Math.floor(ora / 1000) + 12 * 3600, sub: soggetto })));
  const priv = await crypto.subtle.importKey("jwk", chiavi.privata, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  // WebCrypto firma gia' nel formato r||s di 64 byte che vuole il JWT.
  const firma = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, priv, te.encode(testa + "." + corpo)));
  return `vapid t=${testa}.${corpo}.${b64u(firma)}, k=${chiavi.pubblica}`;
}

async function hkdf(sale: Uint8Array, ikm: Uint8Array, info: Uint8Array, bit: number): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: sale, info }, k, bit));
}

// Cifra il messaggio per un telefono (chiavi p256dh e auth della sua
// iscrizione). sale ed effimera si passano solo nelle prove.
export async function cifra(
  testo: Uint8Array, p256dh: string, auth: string,
  prova?: { sale: Uint8Array; effimera: CryptoKeyPair },
): Promise<Uint8Array> {
  const uaPub = daB64u(p256dh);
  const segretoAuth = daB64u(auth);
  const eff = prova?.effimera ?? await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", eff.publicKey));
  const chiaveUa = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: chiaveUa }, eff.privateKey, 256));
  const ikm = await hkdf(segretoAuth, ecdh, unisci(te.encode("WebPush: info\0"), uaPub, asPub), 256);
  const sale = prova?.sale ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(sale, ikm, te.encode("Content-Encoding: aes128gcm\0"), 128);
  const nonce = await hkdf(sale, ikm, te.encode("Content-Encoding: nonce\0"), 96);
  const k = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // Un solo blocco: il messaggio seguito dal delimitatore 0x02 (ultimo record).
  const cifrato = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, k, unisci(testo, new Uint8Array([2]))));
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return unisci(sale, rs, new Uint8Array([asPub.length]), asPub, cifrato);
}

export type Iscrizione = { endpoint: string; p256dh: string; auth: string };

// Manda un messaggio a un telefono. Restituisce lo stato HTTP del servizio
// push: 201 consegnata; 404/410 iscrizione scaduta (da cancellare).
export async function invia(
  isc: Iscrizione, messaggio: unknown, chiavi: ChiaviVapid, soggetto: string,
  fetcher: typeof fetch = fetch,
): Promise<{ stato: number; testo: string }> {
  const corpo = await cifra(te.encode(JSON.stringify(messaggio)), isc.p256dh, isc.auth);
  const r = await fetcher(isc.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapid(isc.endpoint, chiavi, soggetto),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "high",
    },
    body: corpo,
  });
  return { stato: r.status, testo: r.ok ? "" : (await r.text()).slice(0, 200) };
}
