// parse-nutri-menu — legge il menu del nutrizionista (PDF, foto o testo incollato) con Claude e
// lo restituisce diviso per momento della giornata, pronto da importare in "Il mio menu".
// Body {text} oppure {file: {data: base64, mime}}. Non scrive nulla: l'import lo fa l'app
// (RPC crm_nutri_library_import) dopo che il nutrizionista ha controllato l'anteprima.
// Chiave: secret ANTHROPIC_API_KEY (o cp_secrets.anthropic_api_key), come parse-week-plan.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const service = createClient(URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const MODEL = "claude-opus-5-5";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SLOTS = ["colazione", "pranzo", "merenda", "cena", "prima_di_dormire", "pre_allenamento", "durante_allenamento", "post_allenamento"];

async function apiKey(): Promise<string | null> {
  const env = Deno.env.get("ANTHROPIC_API_KEY");
  if (env) return env;
  const { data } = await service.from("cp_secrets").select("value").eq("key", "anthropic_api_key").maybeSingle();
  return data?.value || null;
}
function aiHeaders(key: string): Record<string, string> {
  const h: Record<string, string> = { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" };
  const ws = Deno.env.get("ANTHROPIC_WORKSPACE_ID");
  if (ws) h["anthropic-workspace-id"] = ws;
  return h;
}

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["cibo", "integratore"] },
          slot: { type: "string", enum: SLOTS },
          name: { type: "string", description: "Nome breve dell'alimento o integratore, in italiano" },
          qty: { type: "string", description: "Quantità o dose se indicata (es. 80 g, 2, 5 g, 2000 UI), altrimenti stringa vuota" },
        },
        required: ["kind", "slot", "name", "qty"],
        additionalProperties: false,
      },
    },
    warnings: { type: "string" },
  },
  required: ["items", "warnings"],
  additionalProperties: false,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (o: unknown, status = 200) =>
    new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    const user = createClient(URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
    const { data: me } = await user.auth.getUser();
    if (!me?.user) return json({ error: "Non autenticato" }, 401);
    const { data: prof } = await service.from("crm_profiles").select("role").eq("id", me.user.id).maybeSingle();
    if (!["nutrizionista", "admin", "creator"].includes(prof?.role || "")) return json({ error: "Solo il nutrizionista" }, 403);

    const { text, file } = await req.json();
    const key = await apiKey();
    if (!key) return json({ error: "ai_not_configured" }, 503);

    const content: any[] = [];
    if (file?.data) {
      const mime = String(file.mime || "");
      content.push(mime === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: file.data } }
        : { type: "image", source: { type: "base64", media_type: mime.startsWith("image/") ? mime : "image/jpeg", data: file.data } });
    }
    if (text) content.push({ type: "text", text: "Testo del menu:\n" + String(text).slice(0, 40000) });
    if (!content.length) return json({ error: "Niente da leggere" }, 400);
    content.push({ type: "text", text: `È il menu di lavoro di un nutrizionista sportivo che segue calciatori professionisti.
Estrai OGNI alimento e OGNI integratore, assegnando il momento della giornata:
colazione, pranzo, merenda (anche spuntino di metà mattina o pomeriggio), cena, prima_di_dormire,
pre_allenamento (anche pre-gara), durante_allenamento, post_allenamento (anche post-gara / recupero).
- Un alimento per riga (es. "Avena" con qty "80 g"), non piatti interi se sono elencati gli ingredienti.
- Se lo stesso alimento compare in più momenti, ripetilo per ciascun momento.
- Integratori: kind "integratore", qty = dose. Se il momento non è indicato, scegli quello più sensato (es. proteine whey → post_allenamento, magnesio → prima_di_dormire, vitamina D → colazione).
- Nomi in italiano, brevi. Non inventare alimenti che non ci sono.
In warnings segnala in italiano solo ciò che è davvero illeggibile o ambiguo.` });

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: aiHeaders(key),
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 16000,
        output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
        messages: [{ role: "user", content }],
      }),
    });
    const out = await res.json();
    if (!res.ok) {
      console.error("anthropic", res.status, JSON.stringify(out?.error || out).slice(0, 500));
      return json({ error: out?.error?.message || "Lettura non riuscita" }, 502);
    }
    if (out.stop_reason === "refusal" || out.stop_reason === "max_tokens") return json({ error: "Lettura non riuscita" }, 502);
    const parsed = JSON.parse((out.content || []).find((c: any) => c.type === "text")?.text || "{}");
    const items = (parsed.items || []).filter((i: any) => i.name && SLOTS.includes(i.slot));
    return json({ items, warnings: parsed.warnings || "" });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
