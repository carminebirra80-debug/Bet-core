"use strict";

// Notifiche (v4.58, 07/11/2026). supabase/functions/notifiche/webpush.ts
// cifra i messaggi e firma il VAPID con le WebCrypto. Qui li si controlla
// con un'implementazione indipendente fatta con node:crypto (ECDH, HKDF,
// AES-GCM, verifica ES256): se il telefono non sapesse decifrare, la
// notifica sparirebbe senza nessun errore visibile.
// Serve Node 22 (legge il .ts togliendo i tipi).
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

if (!process.execArgv.includes("--experimental-strip-types") && !process.env.NOTIFICHE_FIGLIO) {
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", __filename],
    { stdio: "inherit", env: { ...process.env, NOTIFICHE_FIGLIO: "1" } });
  process.exit(r.status);
}

const b64u = (b) => Buffer.from(b).toString("base64url");

// Il telefono: chiavi p256dh e auth come le crea il browser.
function telefono() {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return { ecdh, p256dh: b64u(ecdh.getPublicKey()), auth: b64u(crypto.randomBytes(16)) };
}

// Decifratura RFC 8291, scritta a parte: e' quello che fa Chrome su Android.
function decifra(corpo, tel) {
  const sale = corpo.subarray(0, 16);
  const rs = corpo.readUInt32BE(16);
  const lung = corpo[20];
  const asPub = corpo.subarray(21, 21 + lung);
  const dati = corpo.subarray(21 + lung);
  assert.equal(rs, 4096);
  assert.equal(lung, 65);
  const ecdh = tel.ecdh.computeSecret(asPub);
  const uaPub = tel.ecdh.getPublicKey();
  const info = Buffer.concat([Buffer.from("WebPush: info\0"), uaPub, asPub]);
  const ikm = Buffer.from(crypto.hkdfSync("sha256", ecdh, Buffer.from(tel.auth, "base64url"), info, 32));
  const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, sale, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, sale, Buffer.from("Content-Encoding: nonce\0"), 12));
  const d = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(dati.subarray(dati.length - 16));
  const chiaro = Buffer.concat([d.update(dati.subarray(0, dati.length - 16)), d.final()]);
  assert.equal(chiaro[chiaro.length - 1], 2, "manca il delimitatore dell'ultimo record");
  return chiaro.subarray(0, chiaro.length - 1).toString("utf8");
}

(async () => {
  const wp = await import(path.join(__dirname, "..", "supabase", "functions", "notifiche", "webpush.ts"));

  // 1) Il messaggio cifrato si decifra uguale, anche con accenti.
  const tel = telefono();
  const msg = { titolo: "BET Core · T-60", testo: "Valencia–Real: Courtois è fuori", url: "./index.html?vista=live" };
  const corpo = Buffer.from(await wp.cifra(new TextEncoder().encode(JSON.stringify(msg)), tel.p256dh, tel.auth));
  assert.deepEqual(JSON.parse(decifra(corpo, tel)), msg);

  // 2) Con l'auth di un altro telefono non si decifra.
  const altro = telefono();
  assert.throws(() => decifra(corpo, { ecdh: tel.ecdh, auth: altro.auth }));

  // 3) VAPID: firma ES256 valida con la chiave pubblica data al telefono,
  //    destinatario = origine del servizio push, scadenza entro 24 ore.
  const chiavi = await wp.generaChiavi();
  assert.equal(Buffer.from(chiavi.pubblica, "base64url").length, 65);
  const ora = Date.UTC(2026, 10, 7, 12, 0, 0);
  const h = await wp.vapid("https://fcm.googleapis.com/fcm/send/abc", chiavi, "https://esempio.invalid", ora);
  const m = h.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/);
  assert.ok(m, "intestazione VAPID malformata: " + h);
  assert.equal(m[4], chiavi.pubblica);
  const payload = JSON.parse(Buffer.from(m[2], "base64url"));
  assert.equal(payload.aud, "https://fcm.googleapis.com");
  assert.ok(payload.exp > ora / 1000 && payload.exp <= ora / 1000 + 24 * 3600);
  const pub = crypto.createPublicKey({ key: { kty: "EC", crv: "P-256",
    x: chiavi.privata.x, y: chiavi.privata.y }, format: "jwk" });
  assert.ok(crypto.verify("sha256", Buffer.from(m[1] + "." + m[2]), { key: pub, dsaEncoding: "ieee-p1363" },
    Buffer.from(m[3], "base64url")), "firma VAPID non valida");

  // 4) invia(): intestazioni giuste e corpo decifrabile dal telefono.
  let visto = null;
  const finto = async (url, init) => { visto = { url, init }; return new Response("", { status: 201 }); };
  const r = await wp.invia({ endpoint: "https://fcm.googleapis.com/fcm/send/xyz", p256dh: tel.p256dh, auth: tel.auth },
    msg, chiavi, "https://esempio.invalid", finto);
  assert.equal(r.stato, 201);
  assert.equal(visto.init.headers["Content-Encoding"], "aes128gcm");
  assert.match(visto.init.headers.Authorization, /^vapid t=/);
  assert.deepEqual(JSON.parse(decifra(Buffer.from(visto.init.body), tel)), msg);

  console.log("notifiche-webpush: ok");
})().catch((e) => { console.error(e); process.exit(1); });
