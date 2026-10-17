// BET CORE Live (17/10/2026).
// Restituisce le giocate aperte dell'utente con, per ogni gamba, la partita
// abbinata su API-Football, minuto, punteggio e stato (passa / non passa /
// vinta / persa). La chiave API resta nel Vault e la legge solo questa
// funzione; le risposte della fonte passano dalla tabella live_cache per
// stare nelle 100 richieste al giorno del piano gratuito.

const URL_DB = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const API = "https://v3.football.api-sports.io";
const GIORNO_TTL_MS = 6 * 3600 * 1000; // calendario del giorno: ogni 6 ore
const LIVE_TTL_MS = 240 * 1000; // con partite in corso: calendario ricaricato al massimo ogni 4 minuti
// (il piano gratuito non permette di chiedere singole partite per id: il
// calendario del giorno porta gia' minuto e punteggio di tutte)
const SCORTA_MINIMA = 8; // richieste da lasciare libere ogni giorno

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
}

// ---------- accesso al database (service role) ----------
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

async function cacheLeggi(chiave: string): Promise<{ dati: any; eta: number } | null> {
  const r = await rest(`live_cache?chiave=eq.${encodeURIComponent(chiave)}&select=dati,aggiornato`);
  if (!r || !r.length) return null;
  return { dati: r[0].dati, eta: Date.now() - new Date(r[0].aggiornato).getTime() };
}
async function cacheScrivi(chiave: string, dati: unknown) {
  await rest("live_cache", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ chiave, dati, aggiornato: new Date().toISOString() }),
  });
}

// ---------- API-Football ----------
let chiaveApi = "";
let restanti: number | null = null;
async function api(path: string) {
  if (!chiaveApi) chiaveApi = await rest("rpc/live_chiave_api_football", { method: "POST", body: "{}" });
  const r = await fetch(API + path, { headers: { "x-apisports-key": chiaveApi } });
  const rr = r.headers.get("x-ratelimit-requests-remaining");
  if (rr !== null) restanti = Number(rr);
  const body = await r.json();
  const err = body.errors && (Array.isArray(body.errors) ? body.errors.length : Object.keys(body.errors).length);
  if (err) throw new Error("API-Football: " + JSON.stringify(body.errors));
  return body.response || [];
}
function compatta(f: any) {
  return {
    id: f.fixture?.id, ora: f.fixture?.date, stato: f.fixture?.status?.short, minuto: f.fixture?.status?.elapsed,
    lega: f.league?.name, paese: f.league?.country, casa: f.teams?.home?.name, ospite: f.teams?.away?.name,
    gc: f.goals?.home, go: f.goals?.away,
    ft_c: f.score?.fulltime?.home, ft_o: f.score?.fulltime?.away,
  };
}

// ---------- nomi squadre ----------
const ALIAS: Record<string, string> = {
  "bayern monaco": "bayern munchen", "lipsia": "rb leipzig", "barcellona": "barcelona", "strasburgo": "strasbourg",
  "psg": "paris saint germain", "siviglia": "sevilla", "colonia": "koln", "francoforte": "frankfurt",
  "eintracht francoforte": "eintracht frankfurt", "real betis": "betis", "atletico madrid": "atletico madrid",
  "atletico": "atletico madrid", "inter": "inter", "internazionale": "inter", "milan": "ac milan",
  "man utd": "manchester united", "man united": "manchester united", "man city": "manchester city",
  "nottingham": "nottingham forest", "dortmund": "borussia dortmund", "gladbach": "borussia monchengladbach",
  "sporting lisbona": "sporting cp", "lisbona": "sporting cp", "marsiglia": "marseille", "lione": "lyon",
  "nizza": "nice", "tolosa": "toulouse", "amburgo": "hamburger sv", "stoccarda": "stuttgart", "magonza": "mainz",
  "friburgo": "freiburg", "brema": "werder bremen", "werder brema": "werder bremen", "norimberga": "nurnberg",
  "salisburgo": "salzburg", "stella rossa": "crvena zvezda", "bruges": "club brugge", "anversa": "antwerp",
  "maiorca": "mallorca", "saragozza": "zaragoza", "copenaghen": "copenhagen", "zurigo": "zurich",
  "basilea": "basel", "ginevra": "servette", "atene": "athens", "lovanio": "oh leuven", "praga": "praha",
  "monaco 1860": "1860 munchen", "eintracht": "eintracht frankfurt", "verona": "verona", "spal": "spal",
};
const VUOTE = new Set(["fc", "ac", "as", "ss", "ssc", "us", "cf", "sc", "afc", "cfc", "calcio", "club", "the", "de",
  "sv", "vfb", "vfl", "tsg", "fk", "sk", "if", "bk", "ud", "cd", "rcd", "sd", "rc", "ogc", "losc", "1", "1899", "1909", "1913"]);
function base(s: string) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}
function norm(s: string) {
  let b = base(s);
  if (ALIAS[b]) b = ALIAS[b];
  return b.split(" ").filter((t) => t && !VUOTE.has(t)).join(" ");
}
function simile(a: string, b: string) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if ((x.length >= 4 && y.includes(x)) || (y.length >= 4 && x.includes(y))) return 0.9;
  const tx = new Set(x.split(" ")), ty = new Set(y.split(" "));
  let comuni = 0;
  tx.forEach((t) => { if (ty.has(t) && t.length >= 3) comuni++; });
  return comuni / Math.max(tx.size, ty.size);
}
function squadre(evento: string): [string, string] | null {
  const p = (evento || "").split(/\s+(?:vs\.?|v|-|–)\s+/i);
  return p.length === 2 ? [p[0].trim(), p[1].trim()] : null;
}
const GIOVANILI = /\b(u1[5-9]|u2[0-3]|women|w|ii|iii|b|reserves?|youth|primavera)\b/i;
const LEGHE_ESCLUSE = /(u1[5-9]|u2[0-3]|women|feminine|wsl|youth|primavera|reserve|frauen|femenina)/i;
function abbina(evento: string, partite: any[]) {
  const sq = squadre(evento);
  if (!sq) return null;
  let migliore: any = null, punti = 0;
  for (const f of partite) {
    if (LEGHE_ESCLUSE.test(f.lega || "") || GIOVANILI.test(f.casa || "") || GIOVANILI.test(f.ospite || "")) continue;
    const a = simile(sq[0], f.casa), b = simile(sq[1], f.ospite);
    if (a < 0.6 || b < 0.6) continue;
    const p = a + b;
    if (p > punti) { punti = p; migliore = f; }
  }
  return migliore;
}

// ---------- mercati ----------
type Cond = { tipo: "segno"; segno: string } | { tipo: "ou"; over: boolean; linea: number | null }
  | { tipo: "gg"; si: boolean } | { tipo: "multigol"; da: number; a: number };

const NON_GESTITI = new RegExp([
  "HANDICAP", "HCP", "\\bAH\\b", "\\bEH\\b", "\\(\\s*[-+]\\s*\\d", "DNB", "DRAW NO BET", "RIMBORS",
  "\\b[12]\\s?T\\b", "[12]\\s?°", "TEMPO", "PARZIALE", "\\bHT\\b", "INTERVALLO",
  "ESATT", "ANGOL", "CORNER", "CARTELL", "AMMONIZ", "ESPULS", "\\bCARD", "MARCATOR", "GOLEADOR", "ANYTIME",
  "\\bPARI\\b", "DISPARI", "SQUADRA", "CASA OVER", "OSPITE OVER", "OVER CASA", "OVER OSPITE", "UNDER CASA", "UNDER OSPITE",
  "\\bTEAM\\b", "VINCE", "SEGNA IN", "\\bCASA\\b", "\\bOSPITE\\b", "\\bHOME\\b", "\\bAWAY\\b",
  "\\sO\\s", "PT/FT", "\\bPT\\b", "ALMENO", "PALO", "MULTIGOL(?!\\s*\\d\\s*-\\s*\\d)",
].join("|"));
function leggiMercato(testo: string, segni?: string | null): { cond: Cond[]; leggibile: boolean } {
  const cond: Cond[] = [];
  let s = (testo || "").toUpperCase();
  const tronca = s.indexOf("COMBINAZIONI");
  if (tronca > 0) s = s.slice(0, tronca);
  // Prudenza (17/10/2026): un mercato che il Live non sa valutare (tempi,
  // handicap, DNB, esatto, angoli, cartellini, marcatori, pari/dispari, gol
  // di una squadra) resta "non seguito" invece di essere letto come un
  // mercato simile: meglio nessuna proposta di esito che una sbagliata.
  if (NON_GESTITI.test(s)) return { cond: [], leggibile: false };
  s = s.replace(/U\/0/g, "U/O").replace(/0V(ER)?/g, "OV$1").replace(/,/g, ".");
  let linea: number | null = null;
  const m1 = s.match(/U\/O\s*(\d)\.?(\d)/);
  const m2 = s.match(/(OVER|UNDER)\s*(\d)\.(\d)/);
  if (m2) linea = Number(m2[2] + "." + m2[3]);
  else if (m1) linea = Number(m1[1] + "." + m1[2]);
  const mg = s.match(/MULTIGOL\s*(\d)\s*-\s*(\d)/);
  if (mg) cond.push({ tipo: "multigol", da: Number(mg[1]), a: Number(mg[2]) });
  s = s.replace(/ESITO FINALE/g, " ").replace(/GOAL\/NO GOAL/g, " ").replace(/GG\/NG/g, " ").replace(/1X2/g, " ")
    .replace(/U\/O\s*\d*\.?\d*/g, " ").replace(/MULTIGOL\s*\d\s*-\s*\d/g, " ").replace(/^\s*J\s+/, " ");
  if (/\bOVER\b|\bOV\b/.test(s)) cond.push({ tipo: "ou", over: true, linea });
  else if (/\bUNDER\b/.test(s)) cond.push({ tipo: "ou", over: false, linea });
  if (/NO ?GOAL|\bNG\b/.test(s)) cond.push({ tipo: "gg", si: false });
  else if (/\bGOAL\b|\bGG\b/.test(s)) cond.push({ tipo: "gg", si: true });
  const sg = segni ? segni.toUpperCase().replace(/[^12X]/g, "") : null;
  if (sg) cond.unshift({ tipo: "segno", segno: sg });
  else {
    const t = s.replace(/OVER\s*\d\.\d|UNDER\s*\d\.\d/g, " ").match(/(?:^|[\s+])(1X|X2|12|1|X|2)(?=$|[\s+])/);
    if (t) cond.unshift({ tipo: "segno", segno: t[1] });
  }
  return { cond, leggibile: cond.length > 0 };
}
function descrivi(cond: Cond[]) {
  return cond.map((c) => c.tipo === "segno" ? c.segno
    : c.tipo === "ou" ? (c.over ? "Over" : "Under") + (c.linea !== null ? " " + c.linea : " (linea?)")
    : c.tipo === "gg" ? (c.si ? "Goal" : "No Goal") : `Multigol ${c.da}-${c.a}`).join(" + ");
}
function verifica(c: Cond, h: number, a: number): boolean | null {
  const tot = h + a;
  if (c.tipo === "segno") {
    const r = h > a ? "1" : h < a ? "2" : "X";
    return c.segno.includes(r);
  }
  if (c.tipo === "ou") return c.linea === null ? null : c.over ? tot > c.linea : tot < c.linea;
  if (c.tipo === "gg") return c.si ? h > 0 && a > 0 : !(h > 0 && a > 0);
  return tot >= c.da && tot <= c.a;
}
const FINITE = new Set(["FT", "AET", "PEN"]);
const IN_CORSO = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT", "SUSP"]);
const NULLE = new Set(["PST", "CANC", "ABD", "AWD", "WO"]);
function statoGamba(cond: Cond[], f: any): string {
  if (!f) return "non_abbinata";
  if (NULLE.has(f.stato)) return "rinviata";
  if (!IN_CORSO.has(f.stato) && !FINITE.has(f.stato)) return "da_iniziare";
  if (!cond.length) return "non_seguita";
  const fin = FINITE.has(f.stato);
  const h = fin && f.ft_c !== null && f.ft_c !== undefined ? f.ft_c : (f.gc ?? 0);
  const a = fin && f.ft_o !== null && f.ft_o !== undefined ? f.ft_o : (f.go ?? 0);
  const esiti = cond.map((c) => verifica(c, h, a));
  if (esiti.some((e) => e === null)) return "da_verificare";
  const ok = esiti.every((e) => e);
  return fin ? (ok ? "vinta" : "persa") : (ok ? "passa" : "non_passa");
}

// ---------- principale ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    // 1. Solo un utente loggato, e solo le sue giocate.
    let uid = "";
    const prova = req.headers.get("x-live-prova") || "";
    if (prova) {
      // Ingresso per le prove lato server: codice nel Vault, utente indicato.
      const segreto = await rest("rpc/live_segreto_prova", { method: "POST", body: "{}" });
      const u = new URL(req.url).searchParams.get("utente") || "";
      if (!segreto || prova !== segreto || !/^[0-9a-f-]{36}$/.test(u)) return json({ errore: "Prova non autorizzata." }, 401);
      uid = u;
    } else {
      const auth = req.headers.get("Authorization") || "";
      const ru = await fetch(`${URL_DB}/auth/v1/user`, { headers: { apikey: ANON, Authorization: auth } });
      if (!ru.ok) return json({ errore: "Accedi con il tuo account per vedere il Live." }, 401);
      const utente = await ru.json();
      uid = utente?.id || "";
      if (!uid) return json({ errore: "Utente non riconosciuto." }, 401);
    }

    // 2. Giocate aperte degli ultimi 3 giorni.
    const dal = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
    const picks = await rest(`picks?user_id=eq.${uid}&tipo=eq.reale&esito=eq.Aperta&data=gte.${dal}` +
      `&select=id,legacy_id,data,evento,mercato,gambe,quota,stake,bookmaker,origine,codice_schedina,tipo_schedina&order=data.asc`);

    // 3. Gambe pulite dal registro del Veggente, quando la giocata e' collegata.
    const ids = picks.map((p: any) => p.id);
    const proposte = ids.length
      ? await rest(`veggente_proposte?pick_id=in.(${ids.join(",")})&select=id,pick_id,colonne,importo_colonna`) : [];
    const pids = proposte.map((p: any) => p.id);
    const pg = pids.length
      ? await rest(`veggente_proposte_gambe?proposta_id=in.(${pids.join(",")})&select=proposta_id,giocata_id,ruolo,segni`) : [];
    const gids = [...new Set(pg.map((g: any) => g.giocata_id))];
    const gioc = gids.length
      ? await rest(`veggente_giocate?id=in.(${gids.join(",")})&select=id,partita,mercato,kickoff`) : [];
    const giocById = new Map(gioc.map((g: any) => [g.id, g]));

    // 4. Calendario dei giorni coinvolti (una richiesta per giorno, poi cache).
    const avvisi: string[] = [];
    const giorni = [...new Set(picks.map((p: any) => p.data))] as string[];
    const partite: any[] = [];
    for (const d of giorni) {
      const k = "giorno:" + d;
      let c = await cacheLeggi(k);
      if (!c || c.eta > GIORNO_TTL_MS) {
        try {
          const lista = (await api(`/fixtures?date=${d}&timezone=Europe/Rome`)).map(compatta);
          await cacheScrivi(k, lista);
          c = { dati: lista, eta: 0 };
        } catch (e) { avvisi.push("Calendario del " + d + " non aggiornato: " + String(e)); }
      }
      if (c) partite.push(...c.dati);
    }

    // 5. Gambe di ogni giocata, abbinate alle partite.
    const schedine = picks.map((p: any) => {
      const prop = proposte.find((x: any) => x.pick_id === p.id);
      let gambe: any[] = [];
      if (prop) {
        gambe = pg.filter((g: any) => g.proposta_id === prop.id).map((g: any) => {
          const v: any = giocById.get(g.giocata_id) || {};
          return { evento: v.partita, mercato: v.mercato, segni: g.ruolo === "DOPPIA" || g.ruolo === "TRIPLA" ? g.segni : null, ruolo: g.ruolo, fonte: "veggente" };
        }).filter((g: any) => g.evento);
      }
      if (!gambe.length) {
        const gg = Array.isArray(p.gambe) ? p.gambe : [];
        gambe = gg.length ? gg.map((g: any) => ({ evento: g.evento, mercato: g.mercato, fonte: "ricevuta" }))
          : (squadre(p.evento) ? [{ evento: p.evento, mercato: p.mercato, fonte: "ricevuta" }] : []);
      }
      return { p, prop, gambe: gambe.map((g: any) => ({ ...g, f: abbina(g.evento, partite) })) };
    });

    // 6. Con partite in corso (o al via fra 15 minuti) il calendario di quel
    //    giorno si ricarica, al massimo ogni 4 minuti, e porta i punteggi.
    const adesso = Date.now();
    const aggiornati = new Map<number, any>();
    for (const d of giorni) {
      const vivo = schedine.some((s: any) => s.gambe.some((g: any) => g.f && String(g.f.ora).slice(0, 10) === d &&
        !FINITE.has(g.f.stato) && !NULLE.has(g.f.stato) && new Date(g.f.ora).getTime() - adesso < 15 * 60000));
      if (!vivo) continue;
      const k = "giorno:" + d;
      const c = await cacheLeggi(k);
      if (c && c.eta <= LIVE_TTL_MS) { for (const f of c.dati) aggiornati.set(f.id, f); continue; }
      if (restanti !== null && restanti < SCORTA_MINIMA) { avvisi.push("Richieste del giorno quasi finite: punteggi non aggiornati."); continue; }
      try {
        const lista = (await api(`/fixtures?date=${d}&timezone=Europe/Rome`)).map(compatta);
        await cacheScrivi(k, lista);
        for (const f of lista) aggiornati.set(f.id, f);
      } catch (e) { avvisi.push("Punteggi non aggiornati: " + String(e)); }
    }

    // 7. Risposta.
    const out = schedine.map((s: any) => {
      const gambe = s.gambe.map((g: any) => {
        const f = g.f ? (aggiornati.get(g.f.id) || g.f) : null;
        const m = leggiMercato(g.mercato, g.segni);
        return {
          partita: g.evento, mercato: m.leggibile ? descrivi(m.cond) : (g.mercato || "").slice(0, 40),
          ruolo: g.ruolo || null, fonte: g.fonte,
          abbinata: f ? { id: f.id, casa: f.casa, ospite: f.ospite, lega: f.lega } : null,
          ora: f ? f.ora : null, stato_partita: f ? f.stato : null, minuto: f ? f.minuto : null,
          punteggio: f && f.gc !== null && f.gc !== undefined ? `${f.gc}-${f.go}` : null,
          stato: statoGamba(m.cond, f),
        };
      }).sort((a: any, b: any) => String(a.ora || "9").localeCompare(String(b.ora || "9")));
      const st = gambe.map((g: any) => g.stato);
      const sistema = !!(s.prop && s.prop.colonne);
      let stato = "in_corso";
      if (!gambe.length) stato = "senza_partite";
      else if (st.includes("persa")) stato = "persa";
      else if (st.every((x: string) => x === "vinta")) stato = "vinta";
      else if (st.every((x: string) => x === "da_iniziare")) stato = "da_iniziare";
      // Proposta di esito da confermare con un tocco nell'app (17/10/2026):
      // persa appena una gamba e' persa; vinta solo se tutte le gambe sono
      // vinte e non e' un sistema (lì l'importo dipende dai segni usciti).
      let proposta: string | null = null, motivo = "";
      if (st.includes("persa")) proposta = "persa";
      else if (gambe.length && st.every((x: string) => x === "vinta")) {
        if (sistema) motivo = "Sistema vinto: l'importo dipende dai segni usciti, chiudilo a mano con la vincita della ricevuta.";
        else proposta = "vinta";
      } else if (st.includes("rinviata") && st.every((x: string) => x === "vinta" || x === "rinviata")) {
        motivo = "Una gamba e' rinviata: la quota cambia, chiudila a mano con la ricevuta.";
      }
      // Avviso esplicito (17/10/2026): partite finite, nessuna persa, ma una o
      // piu' gambe il Live non le sa giudicare. La schedina aspetta Carmine.
      if (!proposta && !motivo && gambe.length) {
        const INCERTE: Record<string, string> = { non_seguita: "non seguita", da_verificare: "linea mancante", non_abbinata: "partita non trovata" };
        const incerte = gambe.filter((g: any) => INCERTE[g.stato]);
        const chiuse = gambe.every((g: any) => g.stato === "vinta" ||
          (INCERTE[g.stato] && (g.stato === "non_abbinata" || FINITE.has(g.stato_partita))));
        if (incerte.length && chiuse) {
          const elenco = incerte.map((g: any) => `${g.partita} (${INCERTE[g.stato]}: ${g.mercato})`).join("; ");
          const n = incerte.length;
          motivo = `Il Live non pu\u00f2 decidere questa schedina: ${n === 1 ? "1 gamba" : n + " gambe"} da controllare, ${elenco}.` +
            (gambe.length > n ? " Le altre sono vinte: controlla e chiudila a mano." : " Controlla e chiudila a mano.");
        }
      }
      return {
        id: s.p.id, legacy_id: s.p.legacy_id, proposta, motivo, data: s.p.data, titolo: s.p.codice_schedina ? "Codice " + s.p.codice_schedina : s.p.evento,
        bookmaker: s.p.bookmaker, quota: s.p.quota, puntata: s.p.stake, origine: s.p.origine, sistema,
        stato, gambe,
        vive: st.filter((x: string) => x === "passa" || x === "vinta").length,
      };
    });
    return json({ aggiornato: new Date().toISOString(), richieste_restanti: restanti, avvisi, schedine: out });
  } catch (e) {
    return json({ errore: String(e) }, 500);
  }
});
