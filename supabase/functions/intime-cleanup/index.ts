// Pulizia mensile delle foto InTime dal Player Hub (schedulata via pg_cron):
// elimina le righe crm_media con file intime/* piu' vecchie di N giorni
// (default 30) ancora in stato "da_approvare" o "scartata" — le foto
// approvate/da pubblicare/pubblicate restano. Un file storage viene rimosso
// solo quando NESSUNA riga superstite lo referenzia (le foto sono condivise
// tra giocatori). L'archivio completo resta in locale sul Mac.
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
    .lt("created_at", cutoff)
    .in("status", ["da_approvare", "scartata"]);
  if (error) return json({ error: `select: ${error.message}` }, 500);

  const ids = (rows ?? []).map((r) => r.id);
  const paths = [...new Set((rows ?? []).map((r) => r.storage_path).filter(Boolean))];

  // 1) elimina le righe
  for (let i = 0; i < ids.length; i += 200) {
    const { error: delErr } = await supa.from("crm_media")
      .delete().in("id", ids.slice(i, i + 200));
    if (delErr) return json({ error: `delete rows: ${delErr.message}` }, 500);
  }

  // 2) elimina solo i file che nessuna riga superstite referenzia
  const stillUsed = new Set<string>();
  for (let i = 0; i < paths.length; i += 200) {
    const { data } = await supa.from("crm_media")
      .select("storage_path").in("storage_path", paths.slice(i, i + 200));
    for (const r of data ?? []) stillUsed.add(r.storage_path);
  }
  const removable = paths.filter((p) => !stillUsed.has(p));
  for (let i = 0; i < removable.length; i += 100) {
    const { error: rmErr } = await supa.storage.from("crm-media")
      .remove(removable.slice(i, i + 100));
    if (rmErr) return json({ error: `storage remove: ${rmErr.message}` }, 500);
  }

  // 3) oggetti orfani in storage (senza alcuna riga), piu' vecchi del cutoff
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
    .select("id", { count: "exact", head: true }).like("storage_path", "intime/%");

  return json({
    status: "ok",
    days,
    rowsDeleted: ids.length,
    filesDeleted: removable.length,
    orphansDeleted: orphanPaths.length,
    remainingRows: remaining ?? 0,
  });
});
