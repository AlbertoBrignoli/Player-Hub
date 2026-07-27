#!/usr/bin/env node
// Sync foto da INTIME Sports Photo Agency (intime.gr) al Player Hub.
//
// - Login su intime.gr con le credenziali in .env.local (INTIME_USER / INTIME_PASS)
// - Cerca la keyword (default: INTIME_KEYWORD o "ΠΙΡΟΛΑ") nell'archivio foto
// - Scarica gli originali JPEG in photos-intime/ (skip di quelli gia' scaricati)
// - Con --upload carica le foto nel Player Hub tramite la Edge Function
//   intime-ingest (bucket crm-media/intime/, riga crm_media con status
//   "da_approvare" e folder "INTIME"). Richiede INTIME_SYNC_SECRET in
//   .env.local. La Edge Function intime-cleanup (pg_cron, 1 del mese)
//   elimina dal Player Hub le foto INTIME piu' vecchie di 30 giorni
//   (tranne le "pubblicata") per restare nel free tier: l'archivio
//   completo resta comunque qui in locale.
//
// Uso:
//   node scripts/intime-sync.mjs                    # scarica tutte le nuove foto
//   node scripts/intime-sync.mjs --limit 20         # solo le 20 piu' recenti
//   node scripts/intime-sync.mjs --dry-run          # mostra cosa scaricherebbe
//   node scripts/intime-sync.mjs --upload           # scarica + carica nel Player Hub
//   node scripts/intime-sync.mjs --upload-existing --limit 100  # carica dall'archivio locale
//   node scripts/intime-sync.mjs --keyword "ΖΟΤΑ"   # altra keyword

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://www.intime.gr/phdsk/rudius';
const PHOTO_DIR = join(ROOT, 'photos-intime');
const MANIFEST = join(PHOTO_DIR, 'manifest.json');
const PER_PAGE = 48;

// ---------- env ----------
function loadEnv() {
  const env = { ...process.env };
  const envFile = join(ROOT, '.env.local');
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}
const env = loadEnv();

// ---------- cli ----------
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const DRY = flag('dry-run');
const UPLOAD = flag('upload');
const UPLOAD_EXISTING = flag('upload-existing');
const LIMIT = parseInt(opt('limit', '0'), 10) || Infinity;
const MAX_PAGES = parseInt(opt('pages', '0'), 10) || Infinity;
const RAW_KEYWORD = opt('keyword', env.INTIME_KEYWORD || 'ΠΙΡΟΛΑ');

// ---------- iso-8859-7 ----------
// L'archivio indicizza le keyword greche in maiuscolo senza accenti:
// "Πιρόλα" non trova nulla, "ΠΙΡΟΛΑ" si.
function normalizeKeyword(s) {
  return s.normalize('NFD').replace(/[̀-ͅ]/g, '').toUpperCase();
}
function encodeIso88597(s) {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0);
    let b;
    if (c <= 0x7f) b = c;
    else if (c >= 0x391 && c <= 0x3c9 && c !== 0x3a2) b = c - 0x391 + 0xc1; // Α..ω
    else if (c === 0x386) b = 0xb6;
    else if (c >= 0x388 && c <= 0x38a) b = c - 0x388 + 0xb8;
    else if (c === 0x38c) b = 0xbc;
    else if (c === 0x38e || c === 0x38f) b = c - 0x38e + 0xbe;
    else if (c >= 0x3ac && c <= 0x3af) b = c - 0x3ac + 0xdc;
    else if (c >= 0x3ca && c <= 0x3ce) b = c - 0x3ca + 0xfa;
    else if (c === 0x390) b = 0xc0;
    else if (c === 0x3b0) b = 0xe0;
    else b = 0x3f; // '?'
    out += '%' + b.toString(16).toUpperCase().padStart(2, '0');
  }
  return out;
}
function decodeBody(buf) {
  for (const enc of ['iso-8859-7', 'windows-1253', 'latin1']) {
    try { return new TextDecoder(enc).decode(buf); } catch { /* prossima */ }
  }
  return Buffer.from(buf).toString('latin1');
}

// ---------- intime client ----------
let cookie = '';
async function req(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}/${path}`, {
    method,
    redirect: 'manual',
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body,
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  return res;
}

async function login() {
  const user = env.INTIME_USER, pass = env.INTIME_PASS;
  if (!user || !pass) throw new Error('INTIME_USER / INTIME_PASS mancanti in .env.local');
  await req('po.php'); // prende il PHPSESSID
  const res = await req('validate.php', {
    method: 'POST',
    body: `ACTION=LOGIN&username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}&submit=submit`,
  });
  if (res.status !== 302) throw new Error(`Login fallito (HTTP ${res.status}): credenziali errate?`);
  console.log(`✓ Login su intime.gr come "${user}"`);
}

function criteria(keywordEnc) {
  return `C_MASTERCATEGORYCODE=&C_CATEGORYCODE=&PHOTOGRAPHERCODE=&PORTRAITCODE=&DTFROM=&DTTO=` +
    `&KEY1=${keywordEnc}&KEY2=&KEY3=&KEY4=&QDEST=QDEST_PHOTOS&ACTION=QUERY`;
}

function parsePage(html) {
  const total = parseInt((html.match(/Σύνολο:(\d+)/) || [])[1] || '0', 10);
  const photos = [];
  const blocks = html.split(/<table class="ttbl" id="ttbl_(\d+)">/).slice(1);
  for (let i = 0; i < blocks.length; i += 2) {
    const code = blocks[i];
    const block = blocks[i + 1];
    const cells = [...block.matchAll(/<td class="(phdt|tcp)"[^>]*>([\s\S]*?)<\/td>/g)]
      .map((m) => m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    // celle tipiche: [caption, fotografo, data, codice]
    photos.push({
      code,
      caption: cells[0] || '',
      photographer: cells[1] || '',
      shotAt: cells[2] || '',
    });
  }
  return { total, photos };
}

async function fetchAllCodes(keywordEnc) {
  // La paginazione del sito puo' ripetere foto tra pagine adiacenti
  // (ordinamento instabile a parita' di data): dedup per codice e crawl
  // dell'intero range di pagine, altrimenti le ultime restano fuori.
  const byCode = new Map();
  let total = null, lastPage = MAX_PAGES;
  // por.php registra i criteri di ricerca in sessione (risponde 302),
  // po.php poi renderizza i risultati: senza questo passaggio "0 foto".
  await req(`por.php?${criteria(keywordEnc)}&`);
  for (let page = 1; page <= lastPage; page++) {
    const res = await req(`po.php?${criteria(keywordEnc)}&NOR=${PER_PAGE}&PAGE=${page}&`);
    const html = decodeBody(await res.arrayBuffer());
    if (html.includes('validate.php')) throw new Error('Sessione scaduta durante la ricerca');
    const parsed = parsePage(html);
    if (total === null) {
      total = parsed.total;
      lastPage = Math.min(lastPage, Math.ceil(total / PER_PAGE));
      console.log(`✓ Ricerca "${RAW_KEYWORD}": ${total} foto in archivio (${lastPage} pagine)`);
    }
    if (!parsed.photos.length) break;
    for (const p of parsed.photos) if (!byCode.has(p.code)) byCode.set(p.code, p);
    if (byCode.size >= LIMIT) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  return [...byCode.values()];
}

async function downloadPhoto(code, dest, retried = false) {
  const res = await req(`lib/php/cpdd.php?PHOTOCODE=${code}&`);
  const type = res.headers.get('content-type') || '';
  if (!res.ok || !type.includes('image')) {
    if (!retried) { // sessione scaduta a meta' run: nuovo login e riprova
      await login();
      return downloadPhoto(code, dest, true);
    }
    throw new Error(`download ${code}: HTTP ${res.status} ${type}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
  return buf;
}

// ---------- player hub (edge function intime-ingest) ----------
function ingestCfg() {
  const url = env.VITE_SUPABASE_URL, secret = env.INTIME_SYNC_SECRET;
  if (!url || !secret) {
    throw new Error('Per --upload servono VITE_SUPABASE_URL e INTIME_SYNC_SECRET in .env.local');
  }
  return { fn: `${url.replace(/\/$/, '')}/functions/v1/intime-ingest`, secret };
}

// Cartella di destinazione derivata dalla didascalia InTime: le foto di
// partita finiscono in "Squadra1 - Squadra2" (nomi come nelle cartelle gia'
// usate nel Player Hub), quelle di allenamento nel ritiro, il resto in INTIME.
const TEAMS = {
  'ΟΛΥΜΠΙΑΚΟΣ': 'Olympiacos', 'ΠΑΟΚ': 'PAOK', 'ΑΕΚ': 'AEK',
  'ΠΑΝΑΘΗΝΑΙΚΟΣ': 'Panathinaikos', 'ΠΑΝΑΘΗΝΑΪΚΟΣ': 'Panathinaikos',
  'ΑΡΗΣ': 'Aris', 'ΑΝΤΒΕΡΠ': 'Anversa', 'ΑΓΙΑΞ': 'Ajax', 'ΛΕΟΥΒΕΝ': 'Leuven',
  'ΡΑΚΟΒ': 'Raków', 'ΦΟΡΤΟΥΝΑ ΣΙΤΑΡΝΤ': 'Fortuna Sittard',
  'ΡΕΑΛ ΜΑΔΡΙΤΗΣ': 'Real Madrid', 'ΜΠΑΡΤΣΕΛΟΝΑ': 'Barcellona',
  'ΑΣΤΕΡΑΣ ΤΡΙΠΟΛΗΣ': 'Asteras Tripolis', 'ΑΤΡΟΜΗΤΟΣ': 'Atromitos',
  'ΒΟΛΟΣ': 'Volos', 'ΛΑΜΙΑ': 'Lamia', 'ΛΕΒΑΔΕΙΑΚΟΣ': 'Levadiakos',
  'ΚΗΦΙΣΙΑ': 'Kifisia', 'ΠΑΝΣΕΡΡΑΪΚΟΣ': 'Panserraikos',
  'ΠΑΝΑΙΤΩΛΙΚΟΣ': 'Panetolikos', 'ΟΦΗ': 'OFI', 'ΓΙΟΥΒΕΝΤΟΥΣ': 'Juventus',
  'ΜΙΛΑΝ': 'Milan', 'ΙΝΤΕΡ': 'Inter', 'ΝΑΠΟΛΙ': 'Napoli', 'ΡΟΜΑ': 'Roma',
  'ΛΑΤΣΙΟ': 'Lazio', 'ΑΡΣΕΝΑΛ': 'Arsenal', 'ΛΙΒΕΡΠΟΥΛ': 'Liverpool',
  'ΤΣΕΛΣΙ': 'Chelsea', 'ΜΠΑΓΕΡΝ': 'Bayern', 'ΜΠΑΓΙΕΡΝ': 'Bayern',
  'ΠΟΡΤΟ': 'Porto', 'ΜΠΕΝΦΙΚΑ': 'Benfica', 'ΣΠΟΡΤΙΝΓΚ': 'Sporting',
};
function deriveFolder(caption) {
  const c = (caption || '').toUpperCase();
  if (c.includes('ΠΡΟΕΤΟΙΜΑΣΙΑ')) return 'Ritiro 2026 2027';
  const m = c.match(/([Ά-ώ]+(?: [Ά-ώ]+)?) - ([Ά-ώ]+(?: [Ά-ώ]+)?)/);
  if (m) {
    // lato sinistro: ultime 1-2 parole prima del "-" (prima ci sono i nomi
    // dei giocatori); lato destro: prime 1-2 parole dopo.
    const lw = m[1].trim().split(/\s+/), rw = m[2].trim().split(/\s+/);
    let left = null, right = null;
    for (let n = Math.min(2, lw.length); n >= 1 && !left; n--) left = TEAMS[lw.slice(-n).join(' ')] || null;
    for (let n = Math.min(2, rw.length); n >= 1 && !right; n--) right = TEAMS[rw.slice(0, n).join(' ')] || null;
    if (left && right) return `${left} - ${right}`;
  }
  return 'INTIME';
}

async function callIngest(sb, payload) {
  const res = await fetch(sb.fn, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-intime-secret': sb.secret },
    body: JSON.stringify(payload),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`ingest ${payload.code}: HTTP ${res.status} ${out.error || ''}`);
  return out;
}

// Upload in due passi: prepare -> PUT diretto sullo storage (signed URL,
// nessun limite di payload della funzione) -> confirm (riga crm_media).
async function uploadToHub(sb, photo, buf) {
  const prep = await callIngest(sb, { action: 'prepare', code: photo.code });
  if (prep.status === 'skip') return 'skip';
  const put = await fetch(prep.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
    body: buf,
  });
  if (!put.ok) throw new Error(`storage put ${photo.code}: HTTP ${put.status} ${await put.text()}`);
  const note = [photo.caption, photo.photographer, photo.shotAt].filter(Boolean).join(' — ');
  const conf = await callIngest(sb, {
    action: 'confirm', code: photo.code, note, folder: deriveFolder(photo.caption),
  });
  return conf.status; // 'ok' | 'skip'
}

function shotAtMs(m) {
  const p = (m.shotAt || '').match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  return p ? Date.UTC(+p[3], +p[2] - 1, +p[1], +p[4], +p[5], +p[6]) : 0;
}

// Carica nel Player Hub le foto piu' recenti gia' presenti in archivio locale.
async function uploadExisting(manifest) {
  const sb = ingestCfg();
  const entries = Object.values(manifest)
    .filter((m) => !m.uploaded)
    .sort((a, b) => shotAtMs(b) - shotAtMs(a))
    .slice(0, LIMIT === Infinity ? undefined : LIMIT);
  console.log(`✓ ${entries.length} foto locali da caricare nel Player Hub${DRY ? ' (dry-run)' : ''}`);
  if (DRY) {
    for (const p of entries) console.log(`  ${p.code}  ${p.shotAt}  ${p.caption.slice(0, 70)}`);
    return;
  }
  let uploaded = 0, skipped = 0, failed = 0;
  for (const p of entries) {
    try {
      const buf = readFileSync(join(PHOTO_DIR, p.file || `${p.code}.jpg`));
      const r = await uploadToHub(sb, p, buf);
      r === 'ok' ? uploaded++ : skipped++;
      manifest[p.code].uploaded = true;
      writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
      console.log(`  ✓ ${p.code} ${r === 'skip' ? '(gia presente)' : `(${(buf.length / 1e6).toFixed(1)} MB)`}`);
    } catch (e) {
      failed++;
      console.error(`  ✗ ${p.code}: ${e.message}`);
    }
  }
  console.log(`\nFatto: ${uploaded} caricate, ${skipped} gia' presenti, ${failed} errori.`);
}

// ---------- main ----------
async function main() {
  const keyword = normalizeKeyword(RAW_KEYWORD);
  const keywordEnc = encodeIso88597(keyword);
  const sb = UPLOAD ? ingestCfg() : null;

  mkdirSync(PHOTO_DIR, { recursive: true });
  const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};

  if (UPLOAD_EXISTING) return uploadExisting(manifest);

  await login();
  const photos = await fetchAllCodes(keywordEnc);
  const fresh = photos.filter((p) => !manifest[p.code]).slice(0, LIMIT);
  console.log(`✓ ${photos.length} foto viste, ${fresh.length} nuove da scaricare${DRY ? ' (dry-run)' : ''}`);

  if (DRY) {
    for (const p of fresh) console.log(`  ${p.code}  ${p.shotAt}  ${p.caption.slice(0, 70)}`);
    return;
  }

  let done = 0, uploaded = 0, failed = 0;
  for (const p of fresh) {
    const dest = join(PHOTO_DIR, `${p.code}.jpg`);
    try {
      const buf = await downloadPhoto(p.code, dest);
      manifest[p.code] = { ...p, file: `${p.code}.jpg`, downloadedAt: new Date().toISOString() };
      done++;
      if (sb) {
        const r = await uploadToHub(sb, p, buf);
        if (r === 'ok') uploaded++;
        manifest[p.code].uploaded = true;
      }
      writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
      console.log(`  ✓ ${p.code} (${(buf.length / 1e6).toFixed(1)} MB)  ${p.caption.slice(0, 60)}`);
      await new Promise((r) => setTimeout(r, 400));
    } catch (e) {
      failed++;
      console.error(`  ✗ ${p.code}: ${e.message}`);
    }
  }
  console.log(`\nFatto: ${done} scaricate, ${uploaded} caricate nel Player Hub, ${failed} errori.`);
  console.log(`Cartella locale: ${PHOTO_DIR}`);
}

main().catch((e) => { console.error(`Errore: ${e.message}`); process.exit(1); });
