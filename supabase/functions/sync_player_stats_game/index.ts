// sync_player_stats_game — cattura TUTTE le statistiche per-partita che API-Football
// fornisce. Smart-merge: non sovrascrive dati gia' presenti nel DB.
// Body {} = tutti. {"player_id":N} = uno. {"last":N} = finestra (def 10, max 99).
// {"force":true} = riscarica anche partite gia' collezionate e il dato API sovrascrive tutto.
// Partite dei 4 giorni precedenti: i valori API SOVRASCRIVONO quelli salvati, perche' subito
// dopo il fischio API-Football da' dati provvisori (es. 0 minuti / voto 0 a un subentrato).
// Auth: header x-sync-secret (cron), service key, o admin loggato.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const API_KEY = Deno.env.get("API_FOOTBALL_KEY")!;

async function authorized(req: Request): Promise<boolean> {
  const secret = req.headers.get("x-sync-secret");
  if (secret) {
    const { data } = await supabase.from("cp_secrets").select("value").eq("key", "sync_secret").maybeSingle();
    if (data?.value && secret === data.value) return true;
  }
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  if (token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return true;
  const { data: u } = await supabase.auth.getUser(token);
  if (!u?.user) return false;
  const { data: p } = await supabase.from("crm_profiles").select("role").eq("id", u.user.id).maybeSingle();
  return p?.role === "admin";
}

Deno.serve(async (req) => {
  try {
    if (!(await authorized(req))) return json({ ok: false, error: "unauthorized" }, 401);
    const { targets, lastN, force } = await resolveTargets(req);
    if (targets.length === 0) return json({ ok: false, error: "No players to sync" }, 400);
    const results = [];
    for (const PLAYER_ID of targets) {
      const r = await syncOne(PLAYER_ID, lastN, force);
      results.push({ player_id: PLAYER_ID, ...r });
    }
    return json({ ok: true, results });
  } catch (error) {
    return json({ ok: false, error: (error as Error).message }, 500);
  }
});

async function resolveTargets(req: Request): Promise<{ targets: number[]; lastN: number; force: boolean }> {
  let body: any = {};
  try { body = await req.json(); } catch (_) { /* no body */ }
  const lastN = Math.min(Number(body?.last) || 10, 99);
  const force = body?.force === true;
  if (body && body.player_id) return { targets: [Number(body.player_id)], lastN, force };
  const { data } = await supabase.from("player").select("api_player_id").not("api_player_id", "is", null);
  return { targets: (data || []).map((p: any) => p.api_player_id as number), lastN, force };
}

async function syncOne(PLAYER_ID: number, lastN: number, force: boolean) {
  const { data: matches, error: matchErr } = await supabase
    .from("matches").select("*").eq("player_id", PLAYER_ID)
    .lte("match_date", new Date().toISOString())
    .order("match_date", { ascending: false }).limit(lastN);
  if (matchErr) return { updated: 0, error: matchErr.message };
  if (!matches || matches.length === 0) return { updated: 0, message: "No matches" };

  let updated = 0;
  for (const match of matches) {
    const fixture_id = match.fixture_id;
    if (!fixture_id) continue;
    // ancora "fresca": i numeri API si assestano nei giorni dopo la partita
    const fresh = Date.now() - new Date(match.match_date).getTime() < 4 * 24 * 3600 * 1000;
    if (!force && !fresh && match.stats_collected && match.minutes !== null) continue;

    const apiRes = await fetch(
      `https://v3.football.api-sports.io/fixtures/players?fixture=${fixture_id}`,
      { headers: { "x-apisports-key": API_KEY } },
    );
    const apiData = await apiRes.json();
    if (!apiData.response || apiData.response.length === 0) continue;
    const allPlayers = apiData.response.flatMap((team: any) => team.players || []);
    const player = allPlayers.find((p: any) => Number(p.player.id) === PLAYER_ID);
    if (!player) continue;

    const s = player.statistics?.[0] || {};
    // partita fresca o force: vale il dato API; piu' vecchia: smart-merge sul dato salvato
    const e: any = fresh || force ? {} : match;
    const num = (v: any) => (v === null || v === undefined ? null : Number(v));

    const payload: Record<string, unknown> = {
      minutes: e.minutes ?? num(s.games?.minutes),
      goals: e.goals ?? num(s.goals?.total),
      assists: e.assists ?? num(s.goals?.assists),
      rating: e.rating ?? (s.games?.rating ? Number(s.games.rating) : null),
      tackles: e.tackles ?? num(s.tackles?.total),
      interceptions: e.interceptions ?? num(s.tackles?.interceptions),
      blocks: e.blocks ?? num(s.tackles?.blocks),
      duels_total: e.duels_total ?? num(s.duels?.total),
      duels_won: e.duels_won ?? num(s.duels?.won),
      passes_total: e.passes_total ?? num(s.passes?.total),
      passes_key: e.passes_key ?? num(s.passes?.key),
      passes_accuracy: e.passes_accuracy ?? num(s.passes?.accuracy),
      shots_total: e.shots_total ?? num(s.shots?.total),
      shots_on: e.shots_on ?? num(s.shots?.on),
      dribbles_attempts: e.dribbles_attempts ?? num(s.dribbles?.attempts),
      dribbles_success: e.dribbles_success ?? num(s.dribbles?.success),
      dribbles_past: e.dribbles_past ?? num(s.dribbles?.past),
      offsides: e.offsides ?? num(s.offsides),
      saves: e.saves ?? num(s.goals?.saves),
      goals_conceded: e.goals_conceded ?? num(s.goals?.conceded),
      penalty_scored: e.penalty_scored ?? num(s.penalty?.scored),
      penalty_missed: e.penalty_missed ?? num(s.penalty?.missed),
      penalty_saved: e.penalty_saved ?? num(s.penalty?.saved),
      penalty_won: e.penalty_won ?? num(s.penalty?.won),
      penalty_committed: e.penalty_committed ?? num(s.penalty?.commited),
      fouls_drawn: e.fouls_drawn ?? num(s.fouls?.drawn),
      fouls_committed: e.fouls_committed ?? num(s.fouls?.committed),
      yellow_cards: e.yellow_cards ?? num(s.cards?.yellow),
      red_cards: e.red_cards ?? num(s.cards?.red),
      position: e.position ?? (s.games?.position ?? null),
      is_substitute: e.is_substitute ?? (typeof s.games?.substitute === "boolean" ? s.games.substitute : null),
      stats_collected: true,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("matches").update(payload).eq("id", match.id);
    if (error) { console.error("Update error:", error); continue; }
    updated++;
  }
  return { updated };
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
