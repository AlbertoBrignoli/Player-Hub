import { createClient } from "jsr:@supabase/supabase-js@2";

const SECRET = "REDACTED";
const BUCKET = "exercise-images";

Deno.serve(async (req: Request) => {
  try {
    const body = await req.json();
    if (body.secret !== SECRET) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }
    const items = body.items || [];
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const results: any[] = [];
    for (const it of items) {
      try {
        const resp = await fetch(it.url);
        if (!resp.ok) { results.push({ id: it.id, ok: false, error: `fetch ${resp.status}` }); continue; }
        const buf = new Uint8Array(await resp.arrayBuffer());
        const path = `${it.id}.png`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, buf, { contentType: "image/png", upsert: true });
        if (upErr) { results.push({ id: it.id, ok: false, error: upErr.message }); continue; }
        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
        const publicUrl = pub.publicUrl;
        const { error: dbErr } = await supabase.from("fitness_exercise_library").update({ image_url: publicUrl, image_3d_url: publicUrl, gen_status: "done" }).eq("id", it.id);
        results.push({ id: it.id, ok: !dbErr, publicUrl, error: dbErr?.message });
      } catch (e) { results.push({ id: it.id, ok: false, error: String(e) }); }
    }
    return new Response(JSON.stringify({ results }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
