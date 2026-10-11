// parse-week-plan — legge il programma del club (PDF o foto, anche con più settimane) con Claude e
// restituisce gli impegni come lista da spuntare, ciascuno con la sua data. Non scrive nel calendario:
// lo fa l'atleta con "Salva" (RPC crm_save_week_plans, che divide per settimana).
// Body {"plan_id":"<uuid>"}. Auth: JWT dell'utente (deve poter gestire l'atleta: RLS su crm_week_plans).
// Chiave: secret ANTHROPIC_API_KEY delle Edge Functions (o cp_secrets.anthropic_api_key);
// per una chiave personale serve anche ANTHROPIC_WORKSPACE_ID.
// Senza chiave risponde 503 {error:"ai_not_configured"} e l'app passa all'inserimento a mano.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const service = createClient(URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const MODEL = "claude-sonnet-5-5";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function apiKey(): Promise<string | null> {
  const env = Deno.env.get("ANTHROPIC_API_KEY");
  if (env) return env;
  const { data } = await service.from("cp_secrets").select("value").eq("key", "anthropic_api_key").maybeSingle();
  return data?.value || null;
}

// chiavi personali (non legate a un workspace) vogliono anche l'id del workspace: secret ANTHROPIC_WORKSPACE_ID
function aiHeaders(key: string): Record<string, string> {
  const h: Record<string, string> = { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" };
  const ws = Deno.env.get("ANTHROPIC_WORKSPACE_ID");
  if (ws) h["anthropic-workspace-id"] = ws;
  return h;
}

function b64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const TOOL = {
  name: "programma_settimanale",
  description: "Tutti gli impegni letti dal programma del club, di tutte le settimane presenti nel documento.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            date: { type: "string", description: "YYYY-MM-DD: la data reale dell'impegno" },
            start: { type: "string", description: "HH:MM 24h (ora di ritrovo/inizio)" },
            end: { type: "string", description: "HH:MM 24h se indicata, altrimenti stringa vuota" },
            type: { type: "string", enum: ["allenamento", "partita", "viaggio", "medico", "personale", "visita", "nutrizione", "call"] },
            title: { type: "string", description: "Breve, in italiano (es. Allenamento, Palestra, Video analisi, Partenza per Salonicco, Partita vs Aris)" },
            location: { type: "string", description: "Luogo se indicato, altrimenti stringa vuota" },
            notes: { type: "string", description: "Dettagli utili (es. ritrovo, abbigliamento), altrimenti stringa vuota" },
          },
          required: ["date", "start", "type", "title"],
        },
      },
      warnings: { type: "string", description: "Cose poco leggibili o ambigue, in italiano; stringa vuota se nessuna" },
    },
    required: ["items"],
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (o: unknown, status = 200) =>
    new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    const auth = req.headers.get("Authorization") || "";
    const user = createClient(URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { plan_id, probe } = await req.json();
    // controllo di configurazione: dice solo se la chiave c'è ed è valida, non la espone mai
    if (probe) {
      const { data: sec } = await service.from("cp_secrets").select("value").eq("key", "sync_secret").maybeSingle();
      if (!sec?.value || req.headers.get("x-sync-secret") !== sec.value) return json({ error: "forbidden" }, 403);
      const k = await apiKey();
      if (!k) return json({ configured: false });
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: aiHeaders(k),
        body: JSON.stringify({ model: MODEL, max_tokens: 1, messages: [{ role: "user", content: "ok" }] }),
      });
      const o = await r.json().catch(() => ({}));
      return json({ configured: true, valid: r.ok, error: r.ok ? undefined : o?.error?.message });
    }
    if (!plan_id) return json({ error: "plan_id mancante" }, 400);

    // RLS: legge il programma solo chi gestisce l'atleta
    const { data: plan } = await user.from("crm_week_plans").select("id, player_id, week_start, file_path, file_name").eq("id", plan_id).maybeSingle();
    if (!plan) return json({ error: "Programma non trovato" }, 404);
    if (!plan.file_path) return json({ error: "Nessun file caricato" }, 400);

    const key = await apiKey();
    if (!key) return json({ error: "ai_not_configured" }, 503);

    const { data: file, error: dlErr } = await service.storage.from("week-plans").download(plan.file_path);
    if (dlErr || !file) return json({ error: "File non leggibile" }, 400);
    const mime = file.type || (plan.file_name?.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");
    const data = b64(await file.arrayBuffer());
    const media = mime === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : { type: "image", source: { type: "base64", media_type: mime.startsWith("image/") ? mime : "image/jpeg", data } };

    const { data: pl } = await service.from("player").select("name, team_name, position").eq("api_player_id", plan.player_id).maybeSingle();
    const ws = new Date(plan.week_start + "T00:00:00Z");
    const day = (n: number) => new Date(ws.getTime() + n * 864e5).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    // finestra utile: dalla settimana prima di quella scelta a 6 settimane dopo
    const from = day(-7), to = day(48);

    const prompt = `Questo è il programma del club di ${pl?.name || "un calciatore"} (${pl?.team_name || ""}, ruolo ${pl?.position || "n.d."}).
Oggi è ${today}. L'atleta ha scelto la settimana che inizia lunedì ${day(0)}.
Il documento può contenere UNA O PIÙ SETTIMANE (es. due tabelle, o giorni che proseguono oltre la domenica): leggile TUTTE e assegna a ogni impegno la sua data reale YYYY-MM-DD.
- Se il documento scrive le date (es. 12/10, 12.10, Δευτέρα 12/10, Mon 12 Oct), usa quelle; l'anno è quello più vicino a oggi.
- Se ci sono solo i nomi dei giorni, la prima settimana è quella di lunedì ${day(0)} e le successive proseguono in ordine (${day(7)}, ${day(14)}…).
Il documento può essere in greco, inglese, italiano o altra lingua: traduci titoli e note in italiano, brevi.
Estrai ogni impegno con un orario: allenamenti, palestra, riunioni/video, ritrovi, partenze/viaggi, partite (titolo "Partita vs <avversario>", type partita), visite mediche, pasti di squadra.
Salta i giorni di riposo/OFF/day off. Se ci sono sessioni diverse per reparto, tieni quelle generali e quelle per il ruolo dell'atleta (es. portieri).
Usa l'orario di ritrovo/inizio come start (24h) e l'ora di fine solo se scritta. Non inventare nulla che non sia nel documento.
In warnings segnala in italiano solo ciò che è davvero illeggibile o ambiguo.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: aiHeaders(key),
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000,
        tools: [TOOL],
        tool_choice: { type: "tool", name: TOOL.name },
        messages: [{ role: "user", content: [media, { type: "text", text: prompt }] }],
      }),
    });
    const out = await res.json();
    if (!res.ok) return json({ error: out?.error?.message || "Lettura non riuscita" }, 502);
    const use = (out.content || []).find((c: any) => c.type === "tool_use");
    const items = (use?.input?.items || [])
      .filter((it: any) => /^\d{4}-\d{2}-\d{2}$/.test(it.date || "") && it.date >= from && it.date <= to)
      .sort((a: any, b: any) => (a.date + a.start).localeCompare(b.date + b.start));
    const warnings = use?.input?.warnings || "";

    await service.from("crm_week_plans").update({ ai_items: { items, warnings } }).eq("id", plan.id);
    return json({ items, warnings });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
