// Ingest foto InTime nel Player Hub, in due passi per evitare i limiti di
// payload/CPU delle Edge Function con i JPEG grossi (fino a 20+ MB):
//   1) {action:"prepare", code}        -> signed upload URL per lo storage
//      (il client fa PUT dei byte direttamente su storage, non passa di qui)
//   2) {action:"confirm", code, note}  -> riga in crm_media ("da_approvare")
// Auth via header x-intime-secret (secret in public.cp_secrets).
import { createClient } from "jsr:@supabase/supabase-js@2";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Il secret vive in public.cp_secrets (stessa convenzione degli altri cron).
async function getSecret(): Promise<string | null> {
  const { data } = await supa.from("cp_secrets")
    .select("value").eq("key", "intime_secret").maybeSingle();
  return data?.value ?? null;
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const secret = await getSecret();
  if (!secret || req.headers.get("x-intime-secret") !== secret) {
    return json({ error: "unauthorized" }, 401);
  }
  try {
    const { action, code, note, folder } = await req.json();
    if (!code) return json({ error: "code obbligatorio" }, 400);
    const storagePath = `intime/${code}.jpg`;

    // Gia' in crm_media oppure gia' ingerita in passato (registro
    // intime_synced, che sopravvive alla pulizia mensile) -> skip.
    const { data: existing } = await supa
      .from("crm_media").select("id").eq("storage_path", storagePath).limit(1);
    const { data: ledger } = await supa
      .from("intime_synced").select("code").eq("code", String(code)).limit(1);
    const already = (existing && existing.length) || (ledger && ledger.length);

    if (action === "prepare") {
      if (already) return json({ status: "skip", code });
      const { data, error } = await supa.storage
        .from("crm-media")
        .createSignedUploadUrl(storagePath, { upsert: true });
      if (error) return json({ error: `signed url: ${error.message}` }, 500);
      return json({ status: "ready", code, uploadUrl: data.signedUrl });
    }

    if (action === "confirm") {
      if (already) return json({ status: "skip", code });
      const { error: insErr } = await supa.from("crm_media").insert({
        storage_path: storagePath,
        file_name: `${code}.jpg`,
        kind: "foto",
        status: "da_approvare",
        folder: folder || "INTIME",
        uploaded_role: "admin",
        note: note ?? null,
      });
      if (insErr) return json({ error: `db: ${insErr.message}` }, 500);
      await supa.from("intime_synced").upsert({ code: String(code) });
      return json({ status: "ok", code });
    }

    return json({ error: "action deve essere prepare o confirm" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
