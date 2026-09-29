import { createClient } from "jsr:@supabase/supabase-js@2";
const BASE = "http://g4photos.gr/phdsk/rudius";
const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
function json(o: unknown, s = 200) { return new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } }); }
function encodeIso88597(str: string): string {
  let out = "";
  for (const ch of str) {
    const c = ch.codePointAt(0)!; let b: number;
    if (c <= 0x7f) b = c;
    else if (c >= 0x391 && c <= 0x3c9 && c !== 0x3a2) b = c - 0x391 + 0xc1;
    else if (c === 0x386) b = 0xb6;
    else if (c >= 0x388 && c <= 0x38a) b = c - 0x388 + 0xb8;
    else if (c === 0x38c) b = 0xbc;
    else if (c === 0x38e || c === 0x38f) b = c - 0x38e + 0xbe;
    else if (c >= 0x3ac && c <= 0x3af) b = c - 0x3ac + 0xdc;
    else if (c >= 0x3ca && c <= 0x3ce) b = c - 0x3ca + 0xfa;
    else if (c === 0x390) b = 0xc0; else if (c === 0x3b0) b = 0xe0; else b = 0x3f;
    out += "%" + b.toString(16).toUpperCase().padStart(2, "0");
  }
  return out;
}
function decodeBody(buf: ArrayBuffer): string {
  for (const enc of ["iso-8859-7", "windows-1253", "latin1"]) { try { return new TextDecoder(enc).decode(buf); } catch { /**/ } }
  return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}
let cookie = "";
async function req(path: string, body?: string): Promise<Response> {
  const res = await fetch(`${BASE}/${path}`, { method: body ? "POST" : "GET", redirect: "manual",
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) }, body });
  const sc = res.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0]; return res;
}
function parsePage(html: string) {
  const total = parseInt((html.match(/Σύνολο:(\d+)/) || [])[1] || "0", 10);
  const caps: string[] = [];
  const blocks = html.split(/<table class="ttbl" id="ttbl_(\d+)">/).slice(1);
  for (let i = 0; i < blocks.length; i += 2) {
    const cells = [...blocks[i + 1].matchAll(/<td class="(?:phdt|tcp)"[^>]*>([\s\S]*?)<\/td>/g)]
      .map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
    caps.push((cells[0] || "") + "  |  " + (cells[2] || ""));
  }
  return { total, blocks: blocks.length / 2, caps: caps.slice(0, 6) };
}
Deno.serve(async (req0: Request) => {
  const b = await req0.json().catch(() => ({}));
  const { data } = await supa.from("cp_secrets").select("key,value").in("key", ["intime_secret", "g4photos_user", "g4photos_pass"]);
  const s = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  if (req0.headers.get("x-intime-secret") !== s.intime_secret) return json({ error: "unauthorized" }, 401);
  const keyword = b.keyword || "Πιρόλα"; // Pirola esatto
  const raw = b.raw !== false; // default: NON normalizzare (cerca esatto)
  const kw = raw ? keyword : keyword.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  cookie = "";
  await req("po.php");
  const login = await req("validate.php", `ACTION=LOGIN&username=${encodeURIComponent(s.g4photos_user)}&password=${encodeURIComponent(s.g4photos_pass)}&submit=submit`);
  const enc = encodeIso88597(kw);
  const criteria = `C_MASTERCATEGORYCODE=&C_CATEGORYCODE=&PHOTOGRAPHERCODE=&PORTRAITCODE=&DTFROM=&DTTO=&KEY1=${enc}&KEY2=&KEY3=&KEY4=&QDEST=QDEST_PHOTOS&ACTION=QUERY`;
  await req(`por.php?${criteria}&`);
  const res = await req(`po.php?${criteria}&NOR=48&PAGE=1&`);
  const parsed = parsePage(decodeBody(await res.arrayBuffer()));
  return json({ loginStatus: login.status, keywordCercata: kw, esatta: raw, ...parsed });
});
