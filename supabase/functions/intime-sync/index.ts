// Sync server-side delle foto InTime nel Player Hub per TUTTI i giocatori
// configurati in public.intime_players (player_id api-football + keyword
// greca di ricerca). Gira da pg_cron ~1h dopo ogni partita di uno dei
// giocatori (job intime-sync-postmatch): login su intime.gr, una ricerca
// per giocatore, scarica le foto RECENTI (default ultimi 4 giorni) non
// ancora ingerite per quel giocatore (registro public.intime_synced,
// chiave code+player_id, sopravvive alla pulizia mensile), le carica in
// storage (file condiviso tra giocatori) e crea la riga crm_media con
// player_id e cartella partita derivata dalla didascalia.
// Auth via header x-intime-secret (secret in public.cp_secrets).
import { createClient } from "jsr:@supabase/supabase-js@2";

const BASE = "http://www.intime.gr/phdsk/rudius";
const PER_PAGE = 48;

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function secretsMap(): Promise<Record<string, string>> {
  const { data } = await supa.from("cp_secrets").select("key,value")
    .in("key", ["intime_secret", "intime_user", "intime_pass"]);
  return Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------- iso-8859-7 (stessa logica di scripts/intime-sync.mjs) ----------
function normalizeKeyword(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͅ]/g, "").toUpperCase();
}
function encodeIso88597(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    let b: number;
    if (c <= 0x7f) b = c;
    else if (c >= 0x391 && c <= 0x3c9 && c !== 0x3a2) b = c - 0x391 + 0xc1;
    else if (c === 0x386) b = 0xb6;
    else if (c >= 0x388 && c <= 0x38a) b = c - 0x388 + 0xb8;
    else if (c === 0x38c) b = 0xbc;
    else if (c === 0x38e || c === 0x38f) b = c - 0x38e + 0xbe;
    else if (c >= 0x3ac && c <= 0x3af) b = c - 0x3ac + 0xdc;
    else if (c >= 0x3ca && c <= 0x3ce) b = c - 0x3ca + 0xfa;
    else if (c === 0x390) b = 0xc0;
    else if (c === 0x3b0) b = 0xe0;
    else b = 0x3f;
    out += "%" + b.toString(16).toUpperCase().padStart(2, "0");
  }
  return out;
}
function decodeBody(buf: ArrayBuffer): string {
  for (const enc of ["iso-8859-7", "windows-1253", "latin1"]) {
    try { return new TextDecoder(enc).decode(buf); } catch { /* prossima */ }
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}

// ---------- cartella dalla didascalia ----------
const TEAMS: Record<string, string> = {
  "ΟΛΥΜΠΙΑΚΟΣ": "Olympiacos", "ΠΑΟΚ": "PAOK", "ΑΕΚ": "AEK",
  "ΠΑΝΑΘΗΝΑΙΚΟΣ": "Panathinaikos", "ΠΑΝΑΘΗΝΑΪΚΟΣ": "Panathinaikos",
  "ΑΡΗΣ": "Aris", "ΑΝΤΒΕΡΠ": "Anversa", "ΑΓΙΑΞ": "Ajax", "ΛΕΟΥΒΕΝ": "Leuven",
  "ΡΑΚΟΒ": "Raków", "ΦΟΡΤΟΥΝΑ ΣΙΤΑΡΝΤ": "Fortuna Sittard",
  "ΡΕΑΛ ΜΑΔΡΙΤΗΣ": "Real Madrid", "ΜΠΑΡΤΣΕΛΟΝΑ": "Barcellona",
  "ΑΣΤΕΡΑΣ ΤΡΙΠΟΛΗΣ": "Asteras Tripolis", "ΑΣΤΕΡΑΣ": "Asteras Tripolis",
  "ΑΤΡΟΜΗΤΟΣ": "Atromitos", "ΒΟΛΟΣ": "Volos", "ΛΑΜΙΑ": "Lamia",
  "ΛΕΒΑΔΕΙΑΚΟΣ": "Levadiakos", "ΚΗΦΙΣΙΑ": "Kifisia",
  "ΠΑΝΣΕΡΡΑΪΚΟΣ": "Panserraikos", "ΠΑΝΑΙΤΩΛΙΚΟΣ": "Panetolikos",
  "ΟΦΗ": "OFI", "ΚΑΛΑΜΑΤΑ": "Kalamata", "ΗΡΑΚΛΗΣ": "Iraklis",
  "ΣΑΜΣΟΥΝΣΠΟΡ": "Samsunspor", "ΖΒΟΛΕ": "PEC Zwolle", "ΤΣΒΟΛΕ": "PEC Zwolle", "ΝΕΚ": "NEC Nijmegen",
  "ΝΤΕ ΧΡΑΑΦΣΧΑΠ": "De Graafschap", "ΧΡΑΑΦΣΧΑΠ": "De Graafschap", "ΚΑΜΠΟΥΡ": "Cambuur",
  "ΓΙΟΥΒΕΝΤΟΥΣ": "Juventus", "ΜΙΛΑΝ": "Milan", "ΙΝΤΕΡ": "Inter",
  "ΝΑΠΟΛΙ": "Napoli", "ΡΟΜΑ": "Roma", "ΛΑΤΣΙΟ": "Lazio",
  "ΑΡΣΕΝΑΛ": "Arsenal", "ΛΙΒΕΡΠΟΥΛ": "Liverpool", "ΤΣΕΛΣΙ": "Chelsea",
  "ΜΠΑΓΕΡΝ": "Bayern", "ΜΠΑΓΙΕΡΝ": "Bayern", "ΠΟΡΤΟ": "Porto",
  "ΜΠΕΝΦΙΚΑ": "Benfica", "ΣΠΟΡΤΙΝΓΚ": "Sporting",
};
function deriveFolder(caption: string): string {
  const c = (caption || "").toUpperCase();
  if (c.includes("ΠΡΟΕΤΟΙΜΑΣ")) return "Ritiro 2026 2027";
  const m = c.match(/([Ά-ώ]+(?: [Ά-ώ]+)?) - ([Ά-ώ]+(?: [Ά-ώ]+)?)/);
  if (m) {
    const lw = m[1].trim().split(/\s+/), rw = m[2].trim().split(/\s+/);
    let left: string | null = null, right: string | null = null;
    for (let n = Math.min(2, lw.length); n >= 1 && !left; n--) left = TEAMS[lw.slice(-n).join(" ")] || null;
    for (let n = Math.min(2, rw.length); n >= 1 && !right; n--) right = TEAMS[rw.slice(0, n).join(" ")] || null;
    if (left && right) return `${left} - ${right}`;
  }
  return "INTIME";
}

// ---------- client intime ----------
let cookie = "";
async function req(path: string, body?: string): Promise<Response> {
  const res = await fetch(`${BASE}/${path}`, {
    method: body ? "POST" : "GET",
    redirect: "manual",
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body,
  });
  const sc = res.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
  return res;
}

interface Photo { code: string; caption: string; photographer: string; shotAt: string }

function parsePage(html: string): { total: number; photos: Photo[] } {
  const total = parseInt((html.match(/Σύνολο:(\d+)/) || [])[1] || "0", 10);
  const photos: Photo[] = [];
  const blocks = html.split(/<table class="ttbl" id="ttbl_(\d+)">/).slice(1);
  for (let i = 0; i < blocks.length; i += 2) {
    const cells = [...blocks[i + 1].matchAll(/<td class="(?:phdt|tcp)"[^>]*>([\s\S]*?)<\/td>/g)]
      .map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    photos.push({ code: blocks[i], caption: cells[0] || "", photographer: cells[1] || "", shotAt: cells[2] || "" });
  }
  return { total, photos };
}

function shotAtMs(p: Photo): number {
  const m = (p.shotAt || "").match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  return m ? Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6]) : 0;
}

async function searchRecent(keyword: string, cutoffMs: number): Promise<Photo[]> {
  const keywordEnc = encodeIso88597(normalizeKeyword(keyword));
  const criteria = `C_MASTERCATEGORYCODE=&C_CATEGORYCODE=&PHOTOGRAPHERCODE=&PORTRAITCODE=&DTFROM=&DTTO=` +
    `&KEY1=${keywordEnc}&KEY2=&KEY3=&KEY4=&QDEST=QDEST_PHOTOS&ACTION=QUERY`;
  // por.php registra i criteri in sessione (302), po.php renderizza
  await req(`por.php?${criteria}&`);
  const seen = new Map<string, Photo>();
  for (let page = 1; page <= 10; page++) {
    const res = await req(`po.php?${criteria}&NOR=${PER_PAGE}&PAGE=${page}&`);
    const { photos } = parsePage(decodeBody(await res.arrayBuffer()));
    if (!photos.length) break;
    for (const p of photos) if (!seen.has(p.code)) seen.set(p.code, p);
    const oldest = Math.min(...photos.map(shotAtMs));
    if (oldest < cutoffMs) break;
  }
  return [...seen.values()].filter((p) => shotAtMs(p) >= cutoffMs);
}

Deno.serve(async (req0: Request) => {
  if (req0.method !== "POST") return json({ error: "method not allowed" }, 405);
  const secrets = await secretsMap();
  if (!secrets.intime_secret || req0.headers.get("x-intime-secret") !== secrets.intime_secret) {
    return json({ error: "unauthorized" }, 401);
  }
  if (!secrets.intime_user || !secrets.intime_pass) {
    return json({ error: "intime_user/intime_pass mancanti in cp_secrets" }, 500);
  }
  const body = await req0.json().catch(() => ({}));
  const perPlayerLimit = Number(body.limit) > 0 ? Math.min(Number(body.limit), 30) : 15;
  const days = Number(body.days) > 0 ? Number(body.days) : 4;
  const cutoffMs = Date.now() - days * 86400e3;
  const startedAt = Date.now();

  const { data: players } = await supa.from("intime_players")
    .select("player_id, keyword").eq("active", true).order("player_id");
  if (!players?.length) return json({ error: "nessun giocatore attivo in intime_players" }, 500);

  // login unico per tutte le ricerche
  cookie = "";
  await req("po.php");
  const login = await req(
    "validate.php",
    `ACTION=LOGIN&username=${encodeURIComponent(secrets.intime_user)}&password=${encodeURIComponent(secrets.intime_pass)}&submit=submit`,
  );
  if (login.status !== 302) return json({ error: `login intime fallito (HTTP ${login.status})` }, 502);

  const report: Record<string, unknown>[] = [];
  for (const pl of players) {
    if (Date.now() - startedAt > 110_000) { report.push({ player: pl.player_id, skipped: "tempo esaurito" }); continue; }
    const recent = await searchRecent(pl.keyword, cutoffMs);
    const codes = recent.map((p) => p.code);
    const synced = new Set<string>();
    for (let i = 0; i < codes.length; i += 200) {
      const { data } = await supa.from("intime_synced").select("code")
        .eq("player_id", pl.player_id).in("code", codes.slice(i, i + 200));
      for (const r of data ?? []) synced.add(r.code);
    }
    const fresh = recent.filter((p) => !synced.has(p.code));
    const batch = fresh.slice(0, perPlayerLimit);

    let ingested = 0;
    const errors: string[] = [];
    for (const p of batch) {
      if (Date.now() - startedAt > 110_000) break;
      try {
        const dl = await req(`lib/php/cpdd.php?PHOTOCODE=${p.code}&`);
        const type = dl.headers.get("content-type") || "";
        if (!dl.ok || !type.includes("image")) throw new Error(`download HTTP ${dl.status} ${type}`);
        const bytes = new Uint8Array(await dl.arrayBuffer());
        const storagePath = `intime/${p.code}.jpg`;
        const { error: upErr } = await supa.storage.from("crm-media")
          .upload(storagePath, bytes, { contentType: "image/jpeg", upsert: true });
        if (upErr) throw new Error(`storage: ${upErr.message}`);
        const note = [p.caption, p.photographer, p.shotAt].filter(Boolean).join(" — ");
        const { error: insErr } = await supa.from("crm_media").insert({
          storage_path: storagePath,
          file_name: `${p.code}.jpg`,
          kind: "foto",
          status: "da_approvare",
          folder: deriveFolder(p.caption),
          uploaded_role: "admin",
          note,
          player_id: pl.player_id,
        });
        if (insErr) throw new Error(`db: ${insErr.message}`);
        await supa.from("intime_synced").upsert({ code: p.code, player_id: pl.player_id });
        ingested++;
      } catch (e) {
        errors.push(`${p.code}: ${String(e)}`);
      }
    }
    report.push({
      player: pl.player_id,
      keyword: pl.keyword,
      recentFound: recent.length,
      newFound: fresh.length,
      ingested,
      pendingNext: Math.max(0, fresh.length - ingested - errors.length),
      errors,
    });
  }

  return json({ status: "ok", days, players: report });
});
