// import_exercise_library — importa da free-exercise-db (immagini su GitHub).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const CAT: Record<string,string> = { strength:"Forza", cardio:"Cardio", stretching:"Stretching", plyometrics:"Pliometria", powerlifting:"Powerlifting", "olympic weightlifting":"Sollevamento olimpico", strongman:"Strongman" };
const LVL: Record<string,string> = { beginner:"Principiante", intermediate:"Intermedio", expert:"Avanzato" };
const MUS: Record<string,string> = { abdominals:"Addominali", quadriceps:"Quadricipiti", hamstrings:"Femorali", calves:"Polpacci", glutes:"Glutei", chest:"Pettorali", lats:"Dorsali", "middle back":"Dorso", "lower back":"Lombari", shoulders:"Spalle", biceps:"Bicipiti", triceps:"Tricipiti", forearms:"Avambracci", traps:"Trapezi", neck:"Collo", adductors:"Adduttori", abductors:"Abduttori" };
const EQ: Record<string,string> = { "body only":"Corpo libero", barbell:"Bilanciere", dumbbell:"Manubri", cable:"Cavi", machine:"Macchina", kettlebells:"Kettlebell", bands:"Elastici", "medicine ball":"Palla medica", "exercise ball":"Fitball", "e-z curl bar":"Bilanciere EZ", "foam roll":"Foam roller", other:"Altro", none:"Nessuno" };
const tr = (m: Record<string,string>, v: any) => (v == null ? null : (m[v] || v));

Deno.serve(async () => {
  try {
    const r = await fetch("https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json", { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) return json({ ok:false, error:"fetch "+r.status }, 500);
    const data = await r.json();
    const rows = (data as any[]).filter(e => e.images?.length).map(e => ({
      name: e.name,
      category: tr(CAT, e.category),
      muscle_group: (e.primaryMuscles || []).map((m: string) => tr(MUS, m)).filter(Boolean).join(", ") || null,
      equipment: tr(EQ, e.equipment),
      difficulty: tr(LVL, e.level),
      image_url: encodeURI("https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/" + e.images[0]),
      description: (e.instructions || []).join(" ").replace(/\s+/g, " ").trim().slice(0, 400) || null,
    }));

    await supabase.from("fitness_exercise_library").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabase.from("fitness_exercise_library").insert(rows.slice(i, i + 200));
      if (!error) inserted += Math.min(200, rows.length - i); else console.error(error);
    }
    return json({ ok: true, total: rows.length, inserted });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
function json(o: unknown, s = 200) { return new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } }); }
