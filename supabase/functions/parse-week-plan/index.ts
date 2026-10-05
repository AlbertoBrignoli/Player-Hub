// parse-week-plan — legge il programma settimanale del club (PDF o foto) con Claude e
// restituisce gli impegni come lista da spuntare. Non scrive nel calendario: lo fa l'atleta
// con "Salva" (RPC crm_save_week_plan).
// Body {"plan_id":"<uuid>"}. Auth: JWT dell'utente (deve poter gestire l'atleta: RLS su crm_week_plans).
// Chiave: secret ANTHROPIC_API_KEY delle Edge Functions (o cp_secrets.anthropic_api_key).
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

function b64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const TOOL = {
  name: "programma_settimanale",
  description: "Impegni della settimana letti dal programma del club.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            date: { type: "string", description: "YYYY-MM-DD, dentro la settimana indicata" },
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
    const { plan_id } = await req.json();
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
    const days = Array.from({ length: 7 }, (_, i) => new Date(ws.getTime() + i * 864e5).toISOString().slice(0, 10));

    const prompt = `Questo è il programma settimanale del club di ${pl?.name || "un calciatore"} (${pl?.team_name || ""}, ruolo ${pl?.position || "n.d."}).
La settimana va da lunedì ${days[0]} a domenica ${days[6]}: assegna a ogni impegno la data giusta tra queste: ${days.join(", ")}.
Il documento può essere in greco, inglese, italiano o altra lingua: traduci i titoli in italiano, brevi.
Estrai SOLO gli impegni con un orario (allenamenti, palestra, riunioni/video, partenze, partite, visite mediche, pasti di squadra).
Salta i giorni di riposo/OFF. Se ci sono sessioni diverse per reparto, tieni quelle generali e quelle per il ruolo dell'atleta (es. portieri).
Usa l'orario di ritrovo/inizio come start, il 24h, e l'ora di fine solo se scritta. Non inventare nulla che non sia nel documento.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 3000,
        tools: [TOOL],
        tool_choice: { type: "tool", name: TOOL.name },
        messages: [{ role: "user", content: [media, { type: "text", text: prompt }] }],
      }),
    });
    const out = await res.json();
    if (!res.ok) return json({ error: out?.error?.message || "Lettura non riuscita" }, 502);
    const use = (out.content || []).find((c: any) => c.type === "tool_use");
    const items = (use?.input?.items || []).filter((it: any) => days.includes(it.date));
    const warnings = use?.input?.warnings || "";

    await service.from("crm_week_plans").update({ ai_items: { items, warnings } }).eq("id", plan.id);
    return json({ items, warnings });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
