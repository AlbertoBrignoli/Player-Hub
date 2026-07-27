// Pulizia mensile delle foto InTime dal Player Hub (schedulata via pg_cron).
// Le foto InTime si riconoscono dallo storage path "intime/<code>.jpg"
// (le cartelle ora hanno i nomi partita, quindi folder non basta).
// Elimina righe + file piu' vecchi di N giorni (default 30) SOLO se non
// revisionati (da_approvare/scartata): selezioni, approvate e pubblicate
// restano. Un file condiviso con una riga superstite non viene rimosso.
// L'archivio completo resta in locale su Mac (player-crm/photos-intime).
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
  const body = await req.json().catch(() => ({}));
  const days = Number(body.days) > 0 ? Number(body.days) : 30;
  const cutoff = new Date(Date.now() - days * 86400e3).toISOString();

  const { data: rows, error } = await supa.from("crm_media")
    .select("id,storage_path")
    .like("storage_path", "intime/%")
    .in("status", ["da_approvare", "scartata"])
    .lt("created_at", cutoff);
  if (error) return json({ error: `select: ${error.message}` }, 500);

  const ids = (rows ?? []).map((r) => r.id);
  const candidatePaths = [...new Set((rows ?? []).map((r) => r.storage_path))];

  for (let i = 0; i < ids.length; i += 200) {
    const { error: delErr } = await supa.from("crm_media")
      .delete().in("id", ids.slice(i, i + 200));
    if (delErr) return json({ error: `delete rows: ${delErr.message}` }, 500);
  }

  // Rimuove i file solo se nessuna riga superstite li referenzia ancora
  // (una selezione editoriale duplica la riga sullo stesso file).
  const stillUsed = new Set<string>();
  for (let i = 0; i < candidatePaths.length; i += 200) {
    const { data: refs } = await supa.from("crm_media")
      .select("storage_path").in("storage_path", candidatePaths.slice(i, i + 200));
    for (const r of refs ?? []) stillUsed.add(r.storage_path);
  }
  const toRemove = candidatePaths.filter((p) => !stillUsed.has(p));
  let filesRemoved = 0;
  for (let i = 0; i < toRemove.length; i += 100) {
    const batch = toRemove.slice(i, i + 100);
    const { error: rmErr } = await supa.storage.from("crm-media").remove(batch);
    if (rmErr) return json({ error: `storage remove: ${rmErr.message}`, filesRemoved }, 500);
    filesRemoved += batch.length;
  }

  // Oggetti orfani in storage (senza riga crm_media), piu' vecchi del cutoff
  const { data: objects } = await supa.storage.from("crm-media")
    .list("intime", { limit: 1000 });
  const orphanPaths: string[] = [];
  if (objects?.length) {
    const { data: liveRows } = await supa.from("crm_media")
      .select("storage_path").like("storage_path", "intime/%");
    const live = new Set((liveRows ?? []).map((r) => r.storage_path));
    for (const o of objects) {
      const p = `intime/${o.name}`;
      if (!live.has(p) && o.created_at && o.created_at < cutoff) orphanPaths.push(p);
    }
    for (let i = 0; i < orphanPaths.length; i += 100) {
      await supa.storage.from("crm-media").remove(orphanPaths.slice(i, i + 100));
    }
  }

  const { count: remaining } = await supa.from("crm_media")
    .select("id", { count: "exact", head: true })
    .like("storage_path", "intime/%");

  return json({
    status: "ok",
    days,
    rowsDeleted: ids.length,
    filesRemoved,
    orphansDeleted: orphanPaths.length,
    remaining: remaining ?? 0,
  });
});
