// Generazione automatica delle storie Instagram (1080×1920) per le partite
// del calendario editoriale: pre-match (foto dalla Media, cartella della
// partita/avversario) e post-match (statistiche personali da public.matches,
// sincronizzate da API-Football). Il PNG finisce in storage dentro la box
// editoriale della partita (crm_media, kind='grafica') e parte la notifica.
//
// Chiamate:
//   { mode: "auto" }                      ← pg_cron ogni 30' (header x-sync-secret)
//   { editorial_id, type: "pre"|"post" }  ← pulsante in app (JWT utente), rigenera sempre
//   { mode: "signed_url", path }          ← debug/anteprima (solo x-sync-secret)
import { createClient } from "jsr:@supabase/supabase-js@2";
import satori from "npm:satori@0.10.14";
import { initWasm, Resvg } from "npm:@resvg/resvg-wasm@2.6.2";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const W = 1080, H = 1920;
const CLUB_RED = "#e10b17";
const GOLD = "#ffd60a";

// ---------- nomi squadra: API-Football → cartella Media / nome in grafica ----------
// Le cartelle Media nascono dalle didascalie InTime (nomi italianizzati),
// i match da API-Football (nomi inglesi): qui il ponte.
const TEAM_ALIAS: Record<string, { folder: string; display?: string }> = {
  "Olympiakos Piraeus": { folder: "Olympiacos", display: "Olympiacos" },
  "AEK Athens FC": { folder: "AEK", display: "AEK" },
  "AEK Athens": { folder: "AEK", display: "AEK" },
  "Antwerp": { folder: "Anversa" },
  "Royal Antwerp": { folder: "Anversa", display: "Antwerp" },
  "OH Leuven": { folder: "Leuven" },
  "Raków Częstochowa": { folder: "Raków", display: "Raków" },
  "Volos NFC": { folder: "Volos", display: "Volos" },
  "NEC Nijmegen": { folder: "NEC Nijmegen" },
  "PEC Zwolle": { folder: "PEC Zwolle" },
  "Barcelona": { folder: "Barcellona", display: "Barcelona" },
  "Bayern München": { folder: "Bayern", display: "Bayern" },
  "Bayern Munich": { folder: "Bayern", display: "Bayern" },
};
const folderName = (team: string) => TEAM_ALIAS[team]?.folder ?? team;
const displayName = (team: string) => (TEAM_ALIAS[team]?.display ?? TEAM_ALIAS[team]?.folder ?? team);

// ---------- font (Google Fonts, cache tra invocazioni a caldo) ----------
type FontSpec = { family: string; weight: number; name: string };
const FONTS: FontSpec[] = [
  { family: "Barlow Condensed", weight: 500, name: "Barlow Condensed" },
  { family: "Barlow Condensed", weight: 700, name: "Barlow Condensed" },
  { family: "Barlow Condensed", weight: 800, name: "Barlow Condensed" },
  { family: "Archivo", weight: 500, name: "Archivo" },
  { family: "Archivo", weight: 700, name: "Archivo" },
  { family: "JetBrains Mono", weight: 700, name: "JetBrains Mono" },
];
const fontCache = new Map<string, ArrayBuffer>();
async function loadFont(f: FontSpec): Promise<ArrayBuffer> {
  const key = `${f.family}:${f.weight}`;
  const hit = fontCache.get(key);
  if (hit) return hit;
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f.family).replace(/%20/g, "+")}:wght@${f.weight}&display=swap`;
  // UA "curl" → Google serve TTF (satori non legge woff2)
  const css = await (await fetch(cssUrl, { headers: { "User-Agent": "curl/8.4.0" } })).text();
  const m = css.match(/src:\s*url\(([^)]+)\)\s*format\('(?:truetype|opentype)'\)/);
  if (!m) throw new Error(`font ${key}: ttf non trovato`);
  const data = await (await fetch(m[1])).arrayBuffer();
  fontCache.set(key, data);
  return data;
}
async function satoriFonts() {
  const datas = await Promise.all(FONTS.map(loadFont));
  return FONTS.map((f, i) => ({ name: f.name, data: datas[i], weight: f.weight, style: "normal" as const }));
}

// ---------- resvg wasm (init una volta) ----------
let wasmReady: Promise<void> | null = null;
function ensureWasm(): Promise<void> {
  if (!wasmReady) {
    wasmReady = fetch("https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm")
      .then((r) => r.arrayBuffer()).then((b) => initWasm(b));
  }
  return wasmReady;
}

// ---------- helper albero elementi satori (niente JSX) ----------
// deno-lint-ignore no-explicit-any
function h(type: string, style: Record<string, any>, ...children: any[]) {
  // satori esige display:flex esplicito su ogni contenitore
  return { type, props: { style: { display: "flex", ...style }, children: children.flat().filter((c) => c !== null && c !== undefined) } };
}
// deno-lint-ignore no-explicit-any
function img(src: string, style: Record<string, any>) {
  return { type: "img", props: { src, style } };
}

const col = { flexDirection: "column" };

function fmtKickoff(iso: string): { line1: string; line2: string } {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", weekday: "long", day: "numeric", month: "long" }).format(d);
  const time = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" }).format(d);
  return { line1: day.toUpperCase(), line2: `ORE ${time}` };
}

function teamFontSize(name: string): number {
  const n = name.length;
  if (n <= 10) return 148;
  if (n <= 13) return 120;
  if (n <= 17) return 96;
  return 78;
}

type MatchRow = {
  id: string; fixture_id: number | null; match_date: string; league: string | null;
  round: string | null; home_team: string; away_team: string; opponent: string | null;
  venue: string | null; stadium: string | null; status: string | null;
  team_score: number | null; opponent_score: number | null;
  minutes: number | null; rating: number | string | null; goals: number | null; assists: number | null;
  yellow_cards: number | null; red_cards: number | null; tackles: number | null;
  interceptions: number | null; blocks: number | null; duels_total: number | null;
  duels_won: number | null; passes_total: number | null; passes_accuracy: string | null;
  fouls_drawn: number | null;
};
type PlayerRow = { name: string | null; shirt_number: number | null; position: string | null; stadium_photo_url: string | null };

// ---------- scelta foto ----------
async function pickPhoto(playerId: number, entryId: string, match: MatchRow, type: "pre" | "post"): Promise<string | null> {
  const rank = (rows: { storage_path: string; status: string }[]) => {
    const ok = rows.filter((r) => r.status === "approvata");
    return (ok[0] ?? rows[0])?.storage_path ?? null;
  };

  const exactFolder = `${folderName(match.home_team)} - ${folderName(match.away_team)}`;

  // il materiale scelto a mano dentro la box editoriale vince sempre
  const { data: c } = await supa.from("crm_media").select("storage_path,status,created_at")
    .eq("editorial_id", entryId).eq("kind", "foto").neq("status", "scartata")
    .order("created_at", { ascending: false }).limit(20);
  if (c?.length) return rank(c);

  if (type === "post") {
    // 1) cartella esatta di QUESTA partita (InTime la crea dopo il fischio finale)
    const { data: a } = await supa.from("crm_media").select("storage_path,status,created_at,folder")
      .eq("player_id", playerId).eq("kind", "foto").neq("status", "scartata")
      .eq("folder", exactFolder).order("created_at", { ascending: false }).limit(20);
    if (a?.length) return rank(a);
    // 2) foto arrivate dopo il kickoff (stessa partita, cartella diversa)
    const { data: b } = await supa.from("crm_media").select("storage_path,status,created_at")
      .eq("player_id", playerId).eq("kind", "foto").neq("status", "scartata")
      .gt("created_at", match.match_date).order("created_at", { ascending: false }).limit(20);
    if (b?.length) return rank(b);
  }

  // pre: foto di un precedente incontro con lo stesso avversario
  const oppFolder = folderName(match.opponent ?? "");
  if (oppFolder) {
    const { data: d } = await supa.from("crm_media").select("storage_path,status,created_at,folder")
      .eq("player_id", playerId).eq("kind", "foto").neq("status", "scartata")
      .ilike("folder", `%${oppFolder}%`).order("created_at", { ascending: false }).limit(20);
    if (d?.length) return rank(d);
  }

  // ultima foto disponibile in Media (qualsiasi cartella, escluse grafiche)
  const { data: e } = await supa.from("crm_media").select("storage_path,status,created_at")
    .eq("player_id", playerId).eq("kind", "foto").neq("status", "scartata")
    .is("source_media_id", null).order("created_at", { ascending: false }).limit(20);
  if (e?.length) return rank(e);
  return null;
}

function b64uri(buf: Uint8Array, mime: string): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) bin += String.fromCharCode(...buf.subarray(i, i + chunk));
  return `data:${mime};base64,${btoa(bin)}`;
}

async function photoDataUri(storagePath: string | null, player: PlayerRow): Promise<string | null> {
  if (storagePath) {
    // Prima scelta: versione ridimensionata via image transformation (le foto
    // InTime a piena risoluzione fanno esplodere la memoria del worker).
    try {
      const { data: t } = await supa.storage.from("crm-media")
        .createSignedUrl(storagePath, 600, { transform: { width: 1080, quality: 78, format: "origin" } });
      if (t?.signedUrl) {
        const res = await fetch(t.signedUrl);
        const ctype = res.headers.get("content-type") ?? "";
        if (res.ok && (ctype.includes("jpeg") || ctype.includes("jpg") || ctype.includes("png"))) {
          return b64uri(new Uint8Array(await res.arrayBuffer()), ctype.includes("png") ? "image/png" : "image/jpeg");
        }
      }
    } catch { /* transform non disponibile: originale */ }
    const { data, error } = await supa.storage.from("crm-media").download(storagePath);
    if (!error && data) {
      const buf = new Uint8Array(await data.arrayBuffer());
      const mime = storagePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
      return b64uri(buf, mime);
    }
  }
  // ripiego: foto stadio del profilo (URL pubblico, satori la scarica da sé)
  return player.stadium_photo_url ?? null;
}

// ---------- blocchi comuni ----------
// deno-lint-ignore no-explicit-any
function bgLayers(photo: string | null): any[] {
  const layers = [];
  if (photo) {
    layers.push(img(photo, { position: "absolute", top: 0, left: 0, width: W, height: H, objectFit: "cover" }));
  } else {
    layers.push(h("div", { position: "absolute", top: 0, left: 0, width: W, height: H, backgroundImage: "linear-gradient(160deg, #1e1e21 0%, #0a0a0b 60%, #16060a 100%)" }));
  }
  layers.push(h("div", {
    position: "absolute", top: 0, left: 0, width: W, height: H,
    backgroundImage: "linear-gradient(180deg, rgba(10,10,11,0.62) 0%, rgba(10,10,11,0.10) 26%, rgba(10,10,11,0.06) 45%, rgba(10,10,11,0.88) 74%, rgba(10,10,11,0.97) 100%)",
  }));
  return layers;
}

// deno-lint-ignore no-explicit-any
function kickerRow(text: string, league: string | null): any {
  return h("div", { alignItems: "center", gap: 18, marginTop: 96, marginLeft: 72, marginRight: 72 },
    h("div", { width: 12, height: 54, backgroundColor: CLUB_RED }),
    h("div", { ...col },
      h("div", { fontFamily: "JetBrains Mono", fontWeight: 700, fontSize: 26, letterSpacing: 8, color: "#ffffff" }, text),
      league ? h("div", { fontFamily: "Archivo", fontWeight: 500, fontSize: 22, letterSpacing: 3, color: "rgba(255,255,255,0.72)", marginTop: 6 }, league.toUpperCase()) : null,
    ),
  );
}

// deno-lint-ignore no-explicit-any
function footerRow(player: PlayerRow): any {
  const pname = (player.name ?? "").toUpperCase();
  return h("div", { alignItems: "center", justifyContent: "space-between", marginLeft: 72, marginRight: 72, marginBottom: 84, marginTop: 40 },
    h("div", { alignItems: "center", gap: 16 },
      player.shirt_number != null
        ? h("div", { alignItems: "center", justifyContent: "center", width: 64, height: 64, backgroundColor: CLUB_RED, borderRadius: 14, fontFamily: "Barlow Condensed", fontWeight: 800, fontSize: 38, color: "#ffffff" }, String(player.shirt_number))
        : null,
      h("div", { fontFamily: "Barlow Condensed", fontWeight: 700, fontSize: 42, letterSpacing: 2, color: "#ffffff" }, pname),
    ),
    h("div", { fontFamily: "Archivo", fontWeight: 700, fontSize: 30, letterSpacing: 10, color: "rgba(255,255,255,0.85)" }, "AUVI"),
  );
}

// ---------- template PRE-MATCH ----------
// deno-lint-ignore no-explicit-any
function preTemplate(match: MatchRow, player: PlayerRow, photo: string | null): any {
  const home = displayName(match.home_team).toUpperCase();
  const away = displayName(match.away_team).toUpperCase();
  const k = fmtKickoff(match.match_date);
  const isHome = (match.venue ?? "").toLowerCase() === "home";

  return h("div", { ...col, width: W, height: H, position: "relative", backgroundColor: "#0a0a0b" },
    ...bgLayers(photo),
    h("div", { ...col, position: "absolute", top: 0, left: 0, width: W, height: H, justifyContent: "space-between" },
      kickerRow("MATCHDAY", match.league),
      h("div", { ...col },
        h("div", { ...col, marginLeft: 72, marginRight: 72 },
          h("div", { fontFamily: "Barlow Condensed", fontWeight: 800, fontSize: teamFontSize(home), lineHeight: 1.02, color: "#ffffff" }, home),
          h("div", { alignItems: "center", gap: 22, marginTop: 8, marginBottom: 8 },
            h("div", { width: 70, height: 8, backgroundColor: CLUB_RED }),
            h("div", { fontFamily: "Barlow Condensed", fontWeight: 700, fontSize: 54, color: CLUB_RED }, "VS"),
          ),
          h("div", { fontFamily: "Barlow Condensed", fontWeight: 800, fontSize: teamFontSize(away), lineHeight: 1.02, color: "#ffffff" }, away),
          match.round ? h("div", { fontFamily: "JetBrains Mono", fontWeight: 700, fontSize: 24, letterSpacing: 5, color: "rgba(255,255,255,0.75)", marginTop: 34 }, match.round.toUpperCase()) : null,
          h("div", { alignItems: "center", gap: 20, marginTop: 22 },
            h("div", { fontFamily: "Barlow Condensed", fontWeight: 700, fontSize: 46, color: "#ffffff" }, k.line1),
            h("div", { fontFamily: "Barlow Condensed", fontWeight: 800, fontSize: 46, color: GOLD }, k.line2),
          ),
          h("div", { alignItems: "center", gap: 16, marginTop: 14 },
            match.stadium ? h("div", { fontFamily: "Archivo", fontWeight: 500, fontSize: 27, color: "rgba(255,255,255,0.78)" }, match.stadium.toUpperCase()) : null,
            h("div", { fontFamily: "Archivo", fontWeight: 700, fontSize: 23, letterSpacing: 2, color: isHome ? "#30d158" : "#64d2ff", backgroundColor: "rgba(255,255,255,0.10)", paddingLeft: 16, paddingRight: 16, paddingTop: 7, paddingBottom: 7, borderRadius: 999 }, isHome ? "IN CASA" : "TRASFERTA"),
          ),
        ),
        footerRow(player),
      ),
    ),
  );
}

// ---------- template POST-MATCH ----------
function pct(done?: string | number | null, total?: number | null): string | null {
  const d = Number(done), t = Number(total);
  if (!Number.isFinite(d) || !Number.isFinite(t) || t <= 0) return null;
  return `${Math.round((d / t) * 100)}%`;
}

// deno-lint-ignore no-explicit-any
function statCell(label: string, value: string, sub?: string | null, accent?: string): any {
  return h("div", { ...col, width: 444, backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 22, paddingLeft: 30, paddingRight: 30, paddingTop: 24, paddingBottom: 24 },
    h("div", { fontFamily: "JetBrains Mono", fontWeight: 700, fontSize: 20, letterSpacing: 4, color: "rgba(255,255,255,0.62)" }, label),
    h("div", { alignItems: "flex-end", gap: 14, marginTop: 8 },
      h("div", { fontFamily: "Barlow Condensed", fontWeight: 800, fontSize: 74, lineHeight: 1, color: accent ?? "#ffffff" }, value),
      sub ? h("div", { fontFamily: "Barlow Condensed", fontWeight: 700, fontSize: 34, color: "rgba(255,255,255,0.65)", marginBottom: 6 }, sub) : null,
    ),
  );
}

// deno-lint-ignore no-explicit-any
function postTemplate(match: MatchRow, player: PlayerRow, photo: string | null): any {
  const home = displayName(match.home_team).toUpperCase();
  const away = displayName(match.away_team).toUpperCase();
  const isHome = (match.venue ?? "").toLowerCase() === "home";
  const homeScore = isHome ? match.team_score : match.opponent_score;
  const awayScore = isHome ? match.opponent_score : match.team_score;

  const cells: ReturnType<typeof statCell>[] = [];
  if (match.minutes != null) cells.push(statCell("MINUTI IN CAMPO", `${match.minutes}'`));
  if (match.rating != null) cells.push(statCell("RATING", Number(match.rating).toFixed(1), null, GOLD));
  if ((match.goals ?? 0) > 0) cells.push(statCell("GOL", String(match.goals), null, CLUB_RED));
  if ((match.assists ?? 0) > 0) cells.push(statCell("ASSIST", String(match.assists), null, CLUB_RED));
  if (match.passes_total != null && match.passes_accuracy != null) {
    cells.push(statCell("PASSAGGI RIUSCITI", `${match.passes_accuracy}/${match.passes_total}`, pct(match.passes_accuracy, match.passes_total)));
  }
  if (match.duels_total != null && match.duels_won != null) {
    cells.push(statCell("DUELLI VINTI", `${match.duels_won}/${match.duels_total}`, pct(match.duels_won, match.duels_total)));
  }
  if (match.tackles != null) cells.push(statCell("TACKLE", String(match.tackles)));
  if (match.interceptions != null) cells.push(statCell("INTERCETTI", String(match.interceptions)));
  if (match.blocks != null) cells.push(statCell("RESPINTE", String(match.blocks)));
  if (match.fouls_drawn != null) cells.push(statCell("FALLI SUBITI", String(match.fouls_drawn)));
  const grid = cells.slice(0, 8);

  const rows = [];
  for (let i = 0; i < grid.length; i += 2) {
    rows.push(h("div", { gap: 20, marginTop: i === 0 ? 0 : 20 }, grid.slice(i, i + 2)));
  }

  return h("div", { ...col, width: W, height: H, position: "relative", backgroundColor: "#0a0a0b" },
    ...bgLayers(photo),
    h("div", { ...col, position: "absolute", top: 0, left: 0, width: W, height: H, justifyContent: "space-between" },
      kickerRow("FULL TIME", match.league),
      h("div", { ...col },
        h("div", { ...col, marginLeft: 72, marginRight: 72 },
          h("div", { ...col },
            h("div", { alignItems: "center", justifyContent: "space-between" },
              h("div", { fontFamily: "Barlow Condensed", fontWeight: 800, fontSize: 62, color: "#ffffff" }, home),
              h("div", { fontFamily: "Barlow Condensed", fontWeight: 800, fontSize: 78, color: "#ffffff" }, String(homeScore ?? "–")),
            ),
            h("div", { alignItems: "center", justifyContent: "space-between", marginTop: 4 },
              h("div", { fontFamily: "Barlow Condensed", fontWeight: 800, fontSize: 62, color: "#ffffff" }, away),
              h("div", { fontFamily: "Barlow Condensed", fontWeight: 800, fontSize: 78, color: "#ffffff" }, String(awayScore ?? "–")),
            ),
            h("div", { width: 936, height: 3, backgroundColor: "rgba(255,255,255,0.22)", marginTop: 26 }),
          ),
          h("div", { alignItems: "center", gap: 16, marginTop: 30, marginBottom: 26 },
            h("div", { width: 10, height: 40, backgroundColor: CLUB_RED }),
            h("div", { fontFamily: "JetBrains Mono", fontWeight: 700, fontSize: 24, letterSpacing: 6, color: "rgba(255,255,255,0.85)" }, "LA MIA PARTITA"),
          ),
          ...rows,
          (match.yellow_cards ?? 0) > 0 || (match.red_cards ?? 0) > 0
            ? h("div", { alignItems: "center", gap: 14, marginTop: 22 },
                (match.yellow_cards ?? 0) > 0 ? h("div", { width: 26, height: 36, backgroundColor: GOLD, borderRadius: 5 }) : null,
                (match.red_cards ?? 0) > 0 ? h("div", { width: 26, height: 36, backgroundColor: CLUB_RED, borderRadius: 5 }) : null,
              )
            : null,
        ),
        footerRow(player),
      ),
    ),
  );
}

// ---------- render + salvataggio ----------
async function renderStory(match: MatchRow, player: PlayerRow, photo: string | null, type: "pre" | "post"): Promise<Uint8Array> {
  await ensureWasm();
  const fonts = await satoriFonts();
  const tree = type === "pre" ? preTemplate(match, player, photo) : postTemplate(match, player, photo);
  const svg = await satori(tree, { width: W, height: H, fonts });
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: W }, font: { loadSystemFonts: false } });
  return resvg.render().asPng();
}

type Entry = { id: string; title: string; status: string; match_id: string | null; player_id: number };

async function generateFor(entry: Entry, type: "pre" | "post", force: boolean, notify = false): Promise<Record<string, unknown>> {
  const fileName = `story-${type}-match.png`;
  const storagePath = `editorial/${entry.id}/${fileName}`;

  if (!force) {
    const { data: existing } = await supa.from("crm_media").select("id")
      .eq("editorial_id", entry.id).eq("file_name", fileName).limit(1);
    if (existing?.length) return { entry: entry.id, type, skipped: "già generata" };
  }
  if (!entry.match_id) return { entry: entry.id, type, error: "entry senza match_id" };

  const { data: match, error: mErr } = await supa.from("matches").select("*").eq("id", entry.match_id).maybeSingle();
  if (mErr || !match) return { entry: entry.id, type, error: `match non trovato: ${mErr?.message ?? ""}` };

  if (type === "post" && (match.minutes == null || match.minutes <= 0)) {
    return { entry: entry.id, type, skipped: "statistiche personali non ancora disponibili" };
  }

  const { data: player } = await supa.from("player")
    .select("name,shirt_number,position,stadium_photo_url")
    .eq("api_player_id", entry.player_id).maybeSingle();
  const pl: PlayerRow = player ?? { name: null, shirt_number: null, position: null, stadium_photo_url: null };

  const photoPath = await pickPhoto(entry.player_id, entry.id, match as MatchRow, type);
  const photo = await photoDataUri(photoPath, pl);

  const png = await renderStory(match as MatchRow, pl, photo, type);

  const { error: upErr } = await supa.storage.from("crm-media")
    .upload(storagePath, png, { contentType: "image/png", upsert: true });
  if (upErr) return { entry: entry.id, type, error: `storage: ${upErr.message}` };

  const { data: row } = await supa.from("crm_media").select("id")
    .eq("editorial_id", entry.id).eq("file_name", fileName).limit(1).maybeSingle();
  if (!row) {
    const { error: insErr } = await supa.from("crm_media").insert({
      storage_path: storagePath, file_name: fileName, kind: "grafica", status: "da_pubblicare",
      editorial_id: entry.id, folder: "Grafiche automatiche", uploaded_role: "admin",
      note: entry.title, player_id: entry.player_id,
    });
    if (insErr) return { entry: entry.id, type, error: `db: ${insErr.message}` };
  }

  if (["da_preparare", "copy_pronto"].includes(entry.status)) {
    await supa.from("crm_editorial").update({ status: "grafica_caricata" }).eq("id", entry.id);
  }

  const label = type === "pre" ? "pre-match" : "post-match con le statistiche";
  // notifiche solo dalla generazione automatica: i test/rigenerazioni manuali restano silenziosi
  if (notify) await supa.from("crm_notifications").insert([
    { recipient_role: "player", title: `🎨 Storia ${type === "pre" ? "pre" : "post"}-match pronta`, body: `${entry.title} — la storia ${label} è nella box del calendario, pronta da pubblicare.`, route: "editorial", player_id: entry.player_id },
    { recipient_role: "team", title: `🤖 Grafica automatica generata`, body: `${entry.title} — storia ${label} creata in automatico.`, route: "editorial", player_id: entry.player_id },
  ]);

  return { entry: entry.id, type, ok: true, photo: photoPath ?? "(nessuna foto: sfondo)", path: storagePath };
}

// ---------- modalità auto (cron) ----------
async function runAuto(): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  const nowIso = new Date().toISOString();
  const in24h = new Date(Date.now() + 24 * 3600e3).toISOString();
  const ago4d = new Date(Date.now() - 4 * 86400e3).toISOString();

  const { data: entries } = await supa.from("crm_editorial")
    .select("id,title,status,match_id,player_id,match_info")
    .eq("type", "partita").neq("status", "pubblicato").not("match_id", "is", null);

  for (const e of entries ?? []) {
    // deno-lint-ignore no-explicit-any
    const kickoff = (e.match_info as any)?.kickoff as string | undefined;
    if (!kickoff) continue;
    try {
      if (kickoff > nowIso && kickoff <= in24h) {
        out.push(await generateFor(e as Entry, "pre", false, true));
      } else if (kickoff <= nowIso && kickoff >= ago4d) {
        out.push(await generateFor(e as Entry, "post", false, true));
      }
    } catch (err) {
      out.push({ entry: e.id, error: String(err) });
    }
  }
  return out;
}

// ---------- http ----------
function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-secret",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // auth: secret di sistema (cron) oppure JWT di un utente reale (pulsante in app)
  const { data: sec } = await supa.from("cp_secrets").select("value").eq("key", "sync_secret").maybeSingle();
  const bySecret = !!sec?.value && req.headers.get("x-sync-secret") === sec.value;
  if (!bySecret) {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: u } = token ? await supa.auth.getUser(token) : { data: { user: null } };
    if (!u?.user) return json({ error: "unauthorized" }, 401);
  }

  const body = await req.json().catch(() => ({}));

  try {
    // anteprima/debug: URL firmato di un file in crm-media (solo secret di sistema)
    if (body.mode === "signed_url" && body.path) {
      if (!bySecret) return json({ error: "unauthorized" }, 401);
      const { data, error } = await supa.storage.from("crm-media").createSignedUrl(body.path, 3600);
      return json({ url: data?.signedUrl ?? null, error: error?.message ?? null });
    }

    if (body.mode === "auto") return json({ status: "ok", results: await runAuto() });

    const { editorial_id, type } = body;
    if (!editorial_id || !["pre", "post"].includes(type)) {
      return json({ error: "servono editorial_id e type ('pre'|'post')" }, 400);
    }
    const { data: entry } = await supa.from("crm_editorial")
      .select("id,title,status,match_id,player_id").eq("id", editorial_id).maybeSingle();
    if (!entry) return json({ error: "contenuto non trovato" }, 404);
    return json(await generateFor(entry as Entry, type, true));
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
