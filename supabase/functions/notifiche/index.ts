// BET CORE Notifiche (v4.58, 07/11/2026).
// Manda le notifiche sul telefono di Carmine (Web Push, anche ad app chiusa).
//
// Come funziona:
// - il telefono si iscrive dall'app (Dati > Notifiche): ?azione=chiave da'
//   la chiave pubblica VAPID, ?azione=iscrivi salva l'iscrizione;
// - chi vuole avvisare (le attivita' di Claude, il T-60, una prova) scrive
//   una riga nella tabella public.notifiche; il trigger notifiche_invia la
//   passa qui (?azione=invia, con il codice notifiche_segreto del Vault) e
//   questa funzione la cifra e la manda a ogni telefono iscritto;
// - le chiavi VAPID le crea questa funzione la prima volta e le tiene in
//   public.push_config, leggibile solo dal server: non passano mai in chat
//   ne' su GitHub.
// Deploy con verify_jwt = false, come "live": il login lo controlla qui.

import { generaChiavi, invia, type ChiaviVapid } from "./webpush.ts";

const URL_DB = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
// Contatto chiesto dal protocollo VAPID: l'indirizzo del progetto, nessuna email.
const SOGGETTO = URL_DB;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-notifiche-segreto",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
}

async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${URL_DB}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`db ${path.split("?")[0]}: ${r.status} ${await r.text()}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

let chiaviInMemoria: ChiaviVapid | null = null;
async function chiavi(): Promise<ChiaviVapid> {
  if (chiaviInMemoria) return chiaviInMemoria;
  let r = await rest("push_config?id=eq.1&select=pubblica,privata");
  if (!r || !r.length) {
    const nuove = await generaChiavi();
    // Se due chiamate arrivano insieme vince la prima: si rilegge sempre.
    await rest("push_config", {
      method: "POST", headers: { Prefer: "resolution=ignore-duplicates" },
      body: JSON.stringify({ id: 1, pubblica: nuove.pubblica, privata: nuove.privata }),
    });
    r = await rest("push_config?id=eq.1&select=pubblica,privata");
  }
  chiaviInMemoria = { pubblica: r[0].pubblica, privata: r[0].privata };
  return chiaviInMemoria;
}

async function utente(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  const r = await fetch(`${URL_DB}/auth/v1/user`, { headers: { apikey: ANON, Authorization: auth } });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id ? u.id : null;
}

// Prende in carico una notifica non ancora mandata (una volta sola, anche se
// arrivano insieme il trigger e la prova) e la manda a tutti i telefoni.
async function spedisci(id: number): Promise<{ inviate: number; telefoni: number; dettaglio: string }> {
  const presa = await rest(`notifiche?id=eq.${id}&inviata=is.null`, {
    method: "PATCH", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ inviata: new Date().toISOString(), esito: "in invio" }),
  });
  if (!presa || !presa.length) return { inviate: 0, telefoni: 0, dettaglio: "gia' presa in carico" };
  const n = presa[0];
  const filtro = n.user_id ? `user_id=eq.${n.user_id}&` : "";
  const telefoni = await rest(`push_iscrizioni?${filtro}select=id,endpoint,p256dh,auth,errori`) || [];
  const k = await chiavi();
  const messaggio = {
    titolo: n.titolo, testo: n.testo || "", tag: n.tag || undefined,
    url: "./index.html" + (n.vista ? `?vista=${encodeURIComponent(n.vista)}` : ""),
  };
  let ok = 0;
  const errori: string[] = [];
  for (const t of telefoni) {
    try {
      const r = await invia(t, messaggio, k, SOGGETTO);
      if (r.stato >= 200 && r.stato < 300) {
        ok++;
        await rest(`push_iscrizioni?id=eq.${t.id}`, { method: "PATCH", body: JSON.stringify({ ultimo_ok: new Date().toISOString(), errori: 0 }) });
      } else if (r.stato === 404 || r.stato === 410) {
        // Iscrizione scaduta (app disinstallata, permesso tolto): si toglie.
        await rest(`push_iscrizioni?id=eq.${t.id}`, { method: "DELETE" });
        errori.push(`telefono ${t.id} non piu' iscritto`);
      } else {
        await rest(`push_iscrizioni?id=eq.${t.id}`, { method: "PATCH", body: JSON.stringify({ errori: (t.errori || 0) + 1 }) });
        errori.push(`telefono ${t.id}: ${r.stato} ${r.testo}`);
      }
    } catch (e) {
      errori.push(`telefono ${t.id}: ${String((e as Error).message || e)}`);
    }
  }
  const esito = telefoni.length ? `inviata a ${ok} su ${telefoni.length}` + (errori.length ? ` · ${errori.join("; ")}` : "") : "nessun telefono iscritto";
  await rest(`notifiche?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ esito: esito.slice(0, 500) }) });
  return { inviate: ok, telefoni: telefoni.length, dettaglio: errori.join("; ") || (telefoni.length ? "" : "nessun telefono iscritto") };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const azione = new URL(req.url).searchParams.get("azione") || "";
  try {
    // Dal trigger del database: solo con il codice del Vault.
    if (azione === "invia") {
      const dato = req.headers.get("x-notifiche-segreto") || "";
      const segreto = await rest("rpc/notifiche_segreto", { method: "POST", body: "{}" });
      if (!segreto || dato !== segreto) return json({ errore: "non autorizzato" }, 401);
      const corpo = await req.json().catch(() => ({}));
      if (corpo.id) return json(await spedisci(Number(corpo.id)));
      // Senza id: recupera quelle rimaste indietro nelle ultime 24 ore.
      const ieri = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const ferme = await rest(`notifiche?inviata=is.null&creato=gt.${ieri}&select=id&order=id`) || [];
      const esiti = [];
      for (const f of ferme) esiti.push({ id: f.id, ...(await spedisci(f.id)) });
      return json({ recuperate: esiti });
    }

    const uid = await utente(req);
    if (!uid) return json({ errore: "serve l'accesso al cloud" }, 401);

    if (azione === "chiave") return json({ pubblica: (await chiavi()).pubblica });

    if (azione === "iscrivi") {
      const { iscrizione, dispositivo } = await req.json();
      const ep = iscrizione && iscrizione.endpoint, keys = (iscrizione && iscrizione.keys) || {};
      if (!ep || !keys.p256dh || !keys.auth || !/^https:\/\//.test(ep)) return json({ errore: "iscrizione non valida" }, 400);
      await rest("push_iscrizioni?on_conflict=endpoint", {
        method: "POST", headers: { Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify({ user_id: uid, endpoint: ep, p256dh: keys.p256dh, auth: keys.auth,
          dispositivo: String(dispositivo || "").slice(0, 60), errori: 0 }),
      });
      return json({ ok: true });
    }

    if (azione === "togli") {
      const { endpoint } = await req.json();
      if (endpoint) await rest(`push_iscrizioni?user_id=eq.${uid}&endpoint=eq.${encodeURIComponent(endpoint)}`, { method: "DELETE" });
      return json({ ok: true });
    }

    if (azione === "prova") {
      const nuova = await rest("notifiche", {
        method: "POST", headers: { Prefer: "return=representation" },
        body: JSON.stringify({ user_id: uid, titolo: "BET Core · prova", testo: "Le notifiche arrivano su questo telefono.",
          vista: "dati", tag: "prova", origine: "prova" }),
      });
      return json(await spedisci(nuova[0].id));
    }

    return json({ errore: "azione sconosciuta" }, 400);
  } catch (e) {
    return json({ errore: String((e as Error).message || e) }, 500);
  }
});
