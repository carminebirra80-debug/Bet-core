// BET CORE Live (17/10/2026).
// Restituisce le giocate aperte dell'utente con, per ogni gamba, la partita
// abbinata, minuto, punteggio e stato (passa / non passa / vinta / persa).
//
// Fonte dalle 20:00 del 17/10/2026: il tabellone pubblico di ESPN
// (site.api.espn.com, senza chiave), letto da qui. API-Football e' stata
// lasciata: il piano gratuito ha sospeso l'account perche' non accetta
// richieste dai server cloud. ESPN non e' un servizio ufficiale con
// garanzie: se cambia o smette di rispondere, il Live mostra un avviso.
// Il campo da_scaricare resta nella risposta, sempre vuoto, per le app
// v4.37 che sanno ancora scaricare il calendario dal telefono.

const URL_DB = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const GIORNO_TTL_MS = 6 * 3600 * 1000; // calendario del giorno: ogni 6 ore
const LIVE_TTL_MS = 120 * 1000; // con partite in corso: ogni 2 minuti
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard";

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

// ---------- fonte: ESPN ----------
const STATI_ESPN: Record<string, string> = {
  STATUS_SCHEDULED: "NS", STATUS_FIRST_HALF: "1H", STATUS_HALFTIME: "HT", STATUS_SECOND_HALF: "2H",
  STATUS_FULL_TIME: "FT", STATUS_FINAL: "FT", STATUS_END_OF_REGULATION: "ET", STATUS_OVERTIME: "ET",
  STATUS_EXTRA_TIME: "ET", STATUS_END_OF_EXTRATIME: "ET", STATUS_HALFTIME_ET: "ET", STATUS_SHOOTOUT: "P",
  STATUS_FINAL_AET: "AET", STATUS_FINAL_PEN: "PEN", STATUS_FINAL_ET: "AET",
  STATUS_POSTPONED: "PST", STATUS_CANCELED: "CANC", STATUS_ABANDONED: "ABD", STATUS_FORFEIT: "AWD",
  STATUS_SUSPENDED: "SUSP", STATUS_DELAYED: "SUSP", STATUS_RAIN_DELAY: "SUSP",
};
// Ora italiana con fuso esplicito ("2026-10-17T18:00:00+02:00"): l'app ne
// mostra i caratteri 11-16, quindi l'ora UTC di ESPN va convertita qui.
function oraRoma(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const p: Record<string, string> = {};
  new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false, timeZoneName: "longOffset" })
    .formatToParts(d).forEach((x) => { p[x.type] = x.value; });
  const off = (p.timeZoneName || "GMT+01:00").replace("GMT", "") || "+00:00";
  return `${p.year}-${p.month}-${p.day}T${p.hour === "24" ? "00" : p.hour}:${p.minute}:00${off}`;
}
const numero = (v: unknown) => (v === null || v === undefined || v === "" || isNaN(Number(v)) ? null : Number(v));
function compatta(e: any) {
  const c = e.competitions?.[0] || {};
  const t = c.competitors || [];
  const h = t.find((x: any) => x.homeAway === "home") || {}, a = t.find((x: any) => x.homeAway === "away") || {};
  const tipo = e.status?.type || {};
  let stato = STATI_ESPN[tipo.name] || (tipo.state === "in" ? "LIVE" : tipo.state === "pre" ? "NS" : tipo.completed ? "FT" : "?");
  const iniziata = stato !== "NS" && stato !== "PST" && stato !== "CANC";
  const gc = iniziata ? numero(h.score) : null, go = iniziata ? numero(a.score) : null;
  // A fine partita ESPN da' il punteggio finale. Dopo i supplementari non si
  // sa quello dei 90 minuti (su cui si chiudono le giocate): resta da verificare.
  const fin90 = stato === "FT";
  return {
    id: numero(e.id), ora: oraRoma(e.date), stato, minuto: numero(String(e.status?.displayClock || "").split("'")[0]),
    lega: String(e.season?.slug || "").replace(/^\d{4}(-\d{2})?-/, "").replace(/-/g, " "), paese: null,
    casa: h.team?.displayName || null, ospite: a.team?.displayName || null, gc, go,
    ft_c: fin90 ? gc : null, ft_o: fin90 ? go : null,
  };
}
// Giorno ESPN (AAAAMMGG, giornata americana): una giornata italiana D cade
// fra il giorno D-1 (partite fra mezzanotte e le 6) e il giorno D di ESPN.
function giorniEspn(d: string) {
  const t = new Date(d + "T12:00:00Z").getTime();
  return [t - 86400000, t].map((x) => new Date(x).toISOString().slice(0, 10).replace(/-/g, ""));
}
async function scaricaEspn(g: string) {
  const r = await fetch(`${ESPN}?dates=${g}&limit=1000`, {
    headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129 Mobile Safari/537.36", Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`ESPN ${r.status}`);
  const j = await r.json();
  const lista = (j.events || []).map(compatta).filter((f: any) => f.id !== null);
  await cacheScrivi("espn:" + g, lista);
  return lista;
}

// ---------- nomi squadre ----------
const ALIAS: Record<string, string> = {
  "bayern monaco": "bayern munich", "bayern munchen": "bayern munich", "lipsia": "rb leipzig", "barcellona": "barcelona", "strasburgo": "strasbourg",
  "psg": "paris saint germain", "siviglia": "sevilla", "colonia": "cologne", "koln": "cologne", "francoforte": "frankfurt",
  "eintracht francoforte": "eintracht frankfurt", "real betis": "betis", "atletico madrid": "atletico madrid",
  "atletico": "atletico madrid", "inter": "inter", "internazionale": "inter", "milan": "ac milan",
  "man utd": "manchester united", "man united": "manchester united", "man city": "manchester city",
  "nottingham": "nottingham forest", "dortmund": "borussia dortmund", "gladbach": "borussia monchengladbach",
  "sporting lisbona": "sporting cp", "lisbona": "sporting cp", "marsiglia": "marseille", "lione": "lyon",
  "nizza": "nice", "tolosa": "toulouse", "amburgo": "hamburg", "stoccarda": "stuttgart", "magonza": "mainz",
  "friburgo": "freiburg", "brema": "werder bremen", "werder brema": "werder bremen", "norimberga": "nurnberg",
  "salisburgo": "salzburg", "stella rossa": "crvena zvezda", "red star belgrade": "crvena zvezda", "bruges": "club brugge", "anversa": "antwerp",
  "maiorca": "mallorca", "saragozza": "zaragoza", "copenaghen": "copenhagen", "zurigo": "zurich",
  "basilea": "basel", "ginevra": "servette", "atene": "athens", "lovanio": "oh leuven", "praga": "prague",
  "monaco 1860": "1860 munich", "eintracht": "eintracht frankfurt", "verona": "verona", "spal": "spal",
};
const VUOTE = new Set(["fc", "ac", "as", "ss", "ssc", "us", "cf", "sc", "afc", "cfc", "calcio", "club", "the", "de",
  "sv", "vfb", "vfl", "tsg", "fk", "sk", "if", "bk", "ud", "cd", "rcd", "sd", "rc", "ogc", "losc", "1", "1899", "1909", "1913"]);
// Nomi di citta' in italiano dentro un nome di squadra: il ticket scrive
// "AEK Atene" e "Slavia Praga", ESPN "AEK Athens" e "Slavia Prague"
// (20/10/2026, due gambe di Champions "partita non trovata"). Si traducono
// parola per parola, a differenza di ALIAS che vale solo per il nome intero.
const PAROLE: Record<string, string> = {
  "atene": "athens", "praga": "prague", "belgrado": "belgrade", "zagabria": "zagreb", "kiev": "kyiv",
  "mosca": "moscow", "varsavia": "warsaw", "bucarest": "bucharest", "salonicco": "thessaloniki",
  "lisbona": "lisbon", "copenaghen": "copenhagen",
};
// Lettere che la scomposizione NFD non riduce a una lettera semplice:
// senza questo "Bodø" diventava "bod" e non si abbinava a "Bodo".
const LETTERE: Record<string, string> = { "ø": "o", "æ": "ae", "œ": "oe", "ß": "ss", "ł": "l", "đ": "d", "ı": "i", "þ": "th" };
function base(s: string) {
  return (s || "").toLowerCase().replace(/[øæœßłđıþ]/g, (c) => LETTERE[c]).normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}
function norm(s: string) {
  let b = base(s);
  if (ALIAS[b]) b = ALIAS[b];
  return b.split(" ").map((t) => PAROLE[t] || t).filter((t) => t && !VUOTE.has(t)).join(" ");
}
// Distanza di modifica fra due parole, solo per nomi quasi uguali.
function distanza(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  let prec = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prec[j] + 1, cur[j - 1] + 1, prec[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prec = cur;
  }
  return prec[b.length];
}
// Una lettera di differenza nei nomi lunghi non deve far perdere la partita
// (18/10/2026: "Olympiakos" sul ticket, "Olympiacos" su ESPN).
function parolaUguale(t: string, u: string) {
  if (t === u) return true;
  const n = Math.min(t.length, u.length);
  return n >= 6 && distanza(t, u) <= 1;
}
function simile(a: string, b: string) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if ((x.length >= 4 && y.includes(x)) || (y.length >= 4 && x.includes(y))) return 0.9;
  const tx = new Set(x.split(" ")), ty = [...new Set(y.split(" "))];
  let comuni = 0;
  tx.forEach((t) => { if (t.length >= 3 && ty.some((u) => parolaUguale(t, u))) comuni++; });
  return comuni / Math.max(tx.size, ty.length);
}
function squadre(evento: string): [string, string] | null {
  const p = (evento || "").split(/\s+(?:vs\.?|v|-|–)\s+/i);
  return p.length === 2 ? [p[0].trim(), p[1].trim()] : null;
}
const GIOVANILI = /\b(u1[5-9]|u2[0-3]|women|w|ii|iii|b|reserves?|youth|primavera|jong|amateurs)\b/i;
const LEGHE_ESCLUSE = /(u1[5-9]|u2[0-3]|women|feminine|wsl|youth|primavera|reserve|frauen|femenina|liga f\b|ncaa)/i;
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
  | { tipo: "gg"; si: boolean } | { tipo: "multigol"; da: number; a: number }
  | { tipo: "squadra"; lato: "c" | "o"; da: number | null; a: number | null; over: boolean | null; linea: number | null };

// Gol di una sola squadra (20/10/2026: codice con sei "MULTIGOL x-y OSPITE SI"
// tutti "non seguito"). Si valutano col risultato: multigol e over/under della
// squadra di casa o ospite. Tutto il resto con casa/ospite (tiri, angoli,
// tempi, segno insieme) resta non seguito.
function mercatoSquadra(s: string): Cond | null {
  if (/TIRI|\bTRI\b|PORTA|ANGOL|CORNER|CARTELL|AMMONIZ|TEMPO|\b[12]\s?T\b|[12]\s?°|HANDICAP|ESATT|PARI|DISPARI|MARCATOR|\bNO\b|\bPT\b/.test(s)) return null;
  const osp = /OSPITE|TEAM\s*2|SQUADRA\s*2|\bAWAY\b/.test(s), cas = /\bCASA\b|TEAM\s*1|SQUADRA\s*1|\bHOME\b/.test(s);
  if (osp === cas) return null;
  let t = s.replace(/(^|[^A-Z])[UV]\s*[\/F]\s*[O0](?![A-Z])/g, "$1U/O").replace(/,/g, ".");
  const mg = t.match(/MULTIGOL\s*(\d)\s*-\s*(\d)/);
  const ou = t.match(/(OVER|UNDER)\s*(\d)\.(\d)/) || t.match(/U\/O\s*(\d)\.?(\d)\b.*\b(OVER|UNDER)/);
  if (!!mg === !!ou) return null;
  // Niente altro nel testo: "1 + MULTIGOL CASA 2-3" non si legge a meta'.
  const resto = t.replace(/MULTIGOL\s*\d\s*-\s*\d|U\/O\s*\d\.?\d|(OVER|UNDER)\s*\d\.\d|OVER|UNDER|OSPITE|CASA|TEAM\s*[12]|SQUADRA\s*[12]|AWAY|HOME|GOL|\bS[IL1]\b|[^A-Z0-9]/g, "");
  if (resto) return null;
  const lato = osp ? "o" : "c";
  if (mg) return { tipo: "squadra", lato, da: Number(mg[1]), a: Number(mg[2]), over: null, linea: null };
  const o = ou as RegExpMatchArray;
  const over = (o[1] === "OVER" || o[3] === "OVER");
  const linea = o[1] === "OVER" || o[1] === "UNDER" ? Number(o[2] + "." + o[3]) : Number(o[1] + "." + o[2]);
  return { tipo: "squadra", lato, da: null, a: null, over, linea };
}

const NON_GESTITI = new RegExp([
  "HANDICAP", "HCP", "\\bAH\\b", "\\bEH\\b", "\\(\\s*[-+]\\s*\\d", "DNB", "DRAW NO BET", "RIMBORS",
  "\\b[12]\\s?T\\b", "[12]\\s?°", "TEMPO", "PARZIALE", "\\bHT\\b", "INTERVALLO",
  "ESATT", "ANGOL", "CORNER", "CARTELL", "AMMONIZ", "ESPULS", "\\bCARD", "MARCATOR", "GOLEADOR", "ANYTIME",
  "\\bPARI\\b", "DISPARI", "SQUADRA", "CASA OVER", "OSPITE OVER", "OVER CASA", "OVER OSPITE", "UNDER CASA", "UNDER OSPITE",
  "\\bTEAM\\b", "VINCE", "SEGNA IN", "\\bCASA\\b", "\\bOSPITE\\b", "\\bHOME\\b", "\\bAWAY\\b",
  "TIRI", "\\bTRI\\b", "PORTA", "\\sO\\s", "PT/FT", "\\bPT\\b", "ALMENO", "PALO", "MULTIGOL(?!\\s*\\d\\s*-\\s*\\d)",
].join("|"));
function leggiMercato(testo: string, segni?: string | null): { cond: Cond[]; leggibile: boolean } {
  const cond: Cond[] = [];
  let s = (testo || "").toUpperCase();
  const tronca = s.indexOf("COMBINAZIONI");
  if (tronca > 0) s = s.slice(0, tronca);
  const sq = mercatoSquadra(s);
  if (sq) return { cond: [sq], leggibile: true };
  // Prudenza (17/10/2026): un mercato che il Live non sa valutare (tempi,
  // handicap, DNB, esatto, angoli, cartellini, marcatori, pari/dispari, gol
  // di una squadra) resta "non seguito" invece di essere letto come un
  // mercato simile: meglio nessuna proposta di esito che una sbagliata.
  if (NON_GESTITI.test(s)) return { cond: [], leggibile: false };
  // "V/O 2,5", "UFO 25": l'OCR del ticket Sportbet storpia "U/O" (18/10/2026).
  s = s.replace(/(^|[^A-Z])[UV]\s*[\/F]\s*[O0](?![A-Z])/g, "$1U/O");
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
    : c.tipo === "gg" ? (c.si ? "Goal" : "No Goal")
    : c.tipo === "squadra" ? (c.da !== null ? `Multigol ${c.da}-${c.a}` : (c.over ? "Over " : "Under ") + c.linea) + (c.lato === "c" ? " casa" : " ospite")
    : `Multigol ${c.da}-${c.a}`).join(" + ");
}
function verifica(c: Cond, h: number, a: number): boolean | null {
  const tot = h + a;
  if (c.tipo === "segno") {
    const r = h > a ? "1" : h < a ? "2" : "X";
    return c.segno.includes(r);
  }
  if (c.tipo === "ou") return c.linea === null ? null : c.over ? tot > c.linea : tot < c.linea;
  if (c.tipo === "gg") return c.si ? h > 0 && a > 0 : !(h > 0 && a > 0);
  if (c.tipo === "squadra") {
    const g = c.lato === "c" ? h : a;
    if (c.da !== null && c.a !== null) return g >= c.da && g <= c.a;
    return c.linea === null ? null : c.over ? g > c.linea : g < c.linea;
  }
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
  if (fin && f.stato !== "FT" && (f.ft_c === null || f.ft_c === undefined)) return "da_verificare";
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

    const avvisi: string[] = [];

    // 2. Giocate aperte degli ultimi 3 giorni.
    const dal = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
    const picks = await rest(`picks?user_id=eq.${uid}&tipo=eq.reale&esito=eq.Aperta&data=gte.${dal}` +
      `&select=id,legacy_id,data,evento,mercato,nota,gambe,quota,stake,bookmaker,origine,codice_schedina,tipo_schedina&order=data.asc`);

    // 3. Gambe pulite dal registro del Veggente, quando la giocata e' collegata.
    const ids = picks.map((p: any) => p.id);
    const proposte = ids.length
      ? await rest(`veggente_proposte?pick_id=in.(${ids.join(",")})&select=id,pick_id,colonne,importo_colonna`) : [];
    const pids = proposte.map((p: any) => p.id);
    const pg = pids.length
      ? await rest(`veggente_proposte_gambe?proposta_id=in.(${pids.join(",")})&select=proposta_id,giocata_id,ruolo,segni`) : [];
    const gids = [...new Set(pg.map((g: any) => g.giocata_id))];
    const gioc = gids.length
      ? await rest(`veggente_giocate?id=in.(${gids.join(",")})&select=id,partita,mercato,kickoff,quota_sportbet,quota_rif`) : [];
    const giocById = new Map(gioc.map((g: any) => [g.id, g]));

    // 4. Calendario ESPN dei giorni coinvolti: dalla cache se ha meno di 6
    //    ore, altrimenti scaricato ora.
    // Anche i giorni delle singole partite: una multipla giocata il 23 con
    // partite il 24 e il 25 altrimenti restava "partita non trovata" (23/10/2026).
    const giorniPick = (p: any) => [p.data, ...(Array.isArray(p.gambe) ? p.gambe : [])
      .map((g: any) => g && g.data).filter((d: any) => /^\d{4}-\d\d-\d\d$/.test(String(d || "")))];
    const giorni = [...new Set(picks.flatMap((p: any) => [...new Set(giorniPick(p))].flatMap((d: any) => giorniEspn(d))))] as string[];
    const perGiorno: Record<string, any[]> = {};
    const eta: Record<string, number> = {};
    let errori = 0;
    for (const g of giorni) {
      const c = await cacheLeggi("espn:" + g);
      if (c) { perGiorno[g] = c.dati; eta[g] = c.eta; }
      if (!c || c.eta > GIORNO_TTL_MS) {
        try { perGiorno[g] = await scaricaEspn(g); eta[g] = 0; } catch (_) { errori++; }
      }
    }
    const tutte = () => giorni.flatMap((g) => (perGiorno[g] || []).map((f: any) => ({ ...f, g })));
    let partite = tutte();

    // 5. Gambe di ogni giocata, abbinate alle partite.
    const prepara = () => picks.map((p: any) => {
      const prop = proposte.find((x: any) => x.pick_id === p.id);
      let gambe: any[] = [];
      // Giocata collegata a una proposta del Veggente, con la ricevuta letta
      // (20/10/2026). La proposta ha il mercato scritto per intero, la
      // ricevuta quello giocato davvero ma a volte troncato dal lettore: il
      // raddoppio "2 + Multigol 2-5" e "1 Handicap (-1)" letto "2" e "1".
      // Gamba per gamba: se il mercato letto e' l'inizio di quello della
      // proposta e la quota non si scosta di oltre il 15%, vale la proposta;
      // se e' un altro mercato, o la quota e' diversa (Liverpool "1" a 1.49
      // contro "1 + Over 2.5" a 1.95: variante), vale la ricevuta.
      const ric = Array.isArray(p.gambe) ? p.gambe.filter((g: any) => g && g.evento) : [];
      const colonne = prop && Number(prop.colonne) > 1;
      if (prop && !colonne && ric.length) {
        const vg = pg.filter((g: any) => g.proposta_id === prop.id).map((g: any) => giocById.get(g.giocata_id)).filter(Boolean);
        const piatto = (x: string) => String(x || "").toUpperCase().replace(/\s+/g, "").replace(/,/g, ".");
        gambe = ric.map((r: any) => {
          const sr = squadre(r.evento);
          const v: any = sr && vg.find((x: any) => { const sv = squadre(x.partita); return sv && simile(sr[0], sv[0]) >= 0.6 && simile(sr[1], sv[1]) >= 0.6; });
          const daRicevuta = { evento: r.evento, mercato: r.mercato, fonte: "ricevuta" };
          if (!v) return daRicevuta;
          const mr = piatto(r.mercato), mv = piatto(v.mercato);
          const qv = Number(v.quota_sportbet || v.quota_rif) || 0, qr = Number(r.quota) || 0;
          const quotaDiversa = qv > 1 && qr > 1 && Math.abs(qr - qv) / qv > 0.15;
          if (!mr || (mv.startsWith(mr) && !quotaDiversa)) return { evento: r.evento, mercato: v.mercato, fonte: "veggente" };
          return daRicevuta;
        });
      }
      if (prop && (colonne || !ric.length)) {
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

    let schedine = prepara();

    // 6. Con partite in corso (o al via fra 15 minuti) il giorno si riscarica
    //    ogni 2 minuti; poi si riabbina.
    const adesso = Date.now();
    const vivi = new Set<string>();
    schedine.forEach((s: any) => s.gambe.forEach((g: any) => {
      if (g.f && !FINITE.has(g.f.stato) && !NULLE.has(g.f.stato) && new Date(g.f.ora).getTime() - adesso < 15 * 60000) vivi.add(g.f.g);
    }));
    let rifatti = 0;
    for (const g of vivi) {
      if ((eta[g] ?? Infinity) > LIVE_TTL_MS) {
        try { perGiorno[g] = await scaricaEspn(g); eta[g] = 0; rifatti++; } catch (_) { errori++; }
      }
    }
    if (rifatti) { partite = tutte(); schedine = prepara(); }
    if (errori) avvisi.push("La fonte dei risultati (ESPN) non ha risposto: punteggi forse non aggiornati.");

    // 7. Risposta.
    const out = schedine.map((s: any) => {
      const gambe = s.gambe.map((g: any) => {
        const f = g.f || null;
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
      // Sistema a combinazioni del ticket Sportbet (18/10/2026): l'app scrive
      // "Sistema (N)" nella nota quando lo legge dallo screenshot. Qui una
      // gamba persa non vuol dire schedina persa: nessuna proposta di esito.
      const combinazioni = !s.prop?.colonne && /\bsistema\b/i.test(String(s.p.nota || ""));
      let stato = "in_corso";
      if (!gambe.length) stato = "senza_partite";
      else if (combinazioni) stato = st.every((x: string) => x === "da_iniziare") ? "da_iniziare" : "in_corso";
      else if (st.includes("persa")) stato = "persa";
      else if (st.every((x: string) => x === "vinta")) stato = "vinta";
      else if (st.every((x: string) => x === "da_iniziare")) stato = "da_iniziare";
      // Proposta di esito da confermare con un tocco nell'app (17/10/2026):
      // persa appena una gamba e' persa; vinta solo se tutte le gambe sono
      // vinte e non e' un sistema (lì l'importo dipende dai segni usciti).
      let proposta: string | null = null, motivo = "";
      if (combinazioni) {
        const finite = gambe.every((g: any) => FINITE.has(g.stato_partita) || NULLE.has(g.stato_partita) || g.stato === "non_abbinata");
        const perse = st.filter((x: string) => x === "persa").length;
        if (finite) motivo = `Sistema: ${perse} ${perse === 1 ? "gamba persa" : "gambe perse"} su ${gambe.length}. ` +
          "La vincita dipende dalle combinazioni: chiudilo a mano con l'importo della ricevuta.";
      } else if (st.includes("persa")) proposta = "persa";
      else if (gambe.length && st.every((x: string) => x === "vinta")) {
        if (sistema) motivo = "Sistema vinto: l'importo dipende dai segni usciti, chiudilo a mano con la vincita della ricevuta.";
        else proposta = "vinta";
      } else if (st.includes("rinviata") && st.every((x: string) => x === "vinta" || x === "rinviata")) {
        motivo = "Una gamba e' rinviata: la quota cambia, chiudila a mano con la ricevuta.";
      }
      // Avviso esplicito (17/10/2026): partite finite, nessuna persa, ma una o
      // piu' gambe il Live non le sa giudicare. La schedina aspetta Carmine.
      if (!proposta && !motivo && gambe.length && !combinazioni) {
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
        bookmaker: s.p.bookmaker, quota: s.p.quota, puntata: s.p.stake, origine: s.p.origine, sistema: sistema || combinazioni,
        stato, gambe,
        vive: st.filter((x: string) => x === "passa" || x === "vinta").length,
      };
    });
    return json({ aggiornato: new Date().toISOString(), fonte: "ESPN", da_scaricare: [], avvisi, schedine: out });
  } catch (e) {
    return json({ errore: String(e) }, 500);
  }
});
