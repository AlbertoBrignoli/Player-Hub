// sync_player_stats_game — versione generica/replicabile di Pirola_Sync_Stats_game
// Nessun parametro -> tutti i giocatori della tabella `player`.
// Body {"player_id":123} -> solo quel giocatore.
// Body {"last":20} -> allarga la finestra (default 10, max 99 partite giocate).
// Per ogni giocatore legge le sue partite GIOCATE in `matches` (player_id) e le
// arricchisce con le statistiche per-fixture dell'API. Smart-merge: non
// sovrascrive dati gia' presenti.
// FIX 2026-07-30: si considerano solo le partite gia' giocate (match_date nel
// passato); prima le partite future in calendario riempivano il limite di 10
// e il sync non aggiornava nulla.
// Accesso: header x-sync-secret (cron), service key (onboard_player) o admin loggato.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

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

    const { targets, lastN } = await resolveTargets(req);
    if (targets.length === 0) {
      return json({ ok: false, error: "No players to sync" }, 400);
    }

    const results = [];
    for (const PLAYER_ID of targets) {
      const r = await syncOne(PLAYER_ID, lastN);
      results.push({ player_id: PLAYER_ID, ...r });
    }

    return json({ ok: true, results });
  } catch (error) {
    return json({ ok: false, error: (error as Error).message }, 500);
  }
});

async function resolveTargets(req: Request): Promise<{ targets: number[]; lastN: number }> {
  let body: any = {};
  try { body = await req.json(); } catch (_) { /* no body */ }

  const lastN = Math.min(Number(body?.last) || 10, 99);

  if (body && body.player_id) return { targets: [Number(body.player_id)], lastN };

  const { data } = await supabase
    .from("player")
    .select("api_player_id")
    .not("api_player_id", "is", null);

  return { targets: (data || []).map((p: any) => p.api_player_id as number), lastN };
}

async function syncOne(PLAYER_ID: number, lastN: number) {
  const { data: matches, error: matchErr } = await supabase
    .from("matches")
    .select("*")
    .eq("player_id", PLAYER_ID)
    .lte("match_date", new Date().toISOString()) // solo partite gia' giocate
    .order("match_date", { ascending: false })
    .limit(lastN);

  if (matchErr) return { updated: 0, error: matchErr.message };
  if (!matches || matches.length === 0) return { updated: 0, message: "No matches" };

  let updated = 0;

  for (const match of matches) {
    const fixture_id = match.fixture_id;
    if (!fixture_id) continue;
    if (match.stats_collected && match.minutes !== null) continue; // gia' completa

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
    const existing = match;

    // Smart merge: NON sovrascrive valori gia' presenti nel DB
    const payload = {
      minutes: existing.minutes ?? s.games?.minutes ?? null,
      goals: existing.goals ?? s.goals?.total ?? null,
      assists: existing.assists ?? s.goals?.assists ?? null,
      rating: existing.rating ?? (s.games?.rating ? Number(s.games.rating) : null),
      tackles: existing.tackles ?? s.tackles?.total ?? null,
      interceptions: existing.interceptions ?? s.tackles?.interceptions ?? null,
      blocks: existing.blocks ?? s.tackles?.blocks ?? null,
      duels_total: existing.duels_total ?? s.duels?.total ?? null,
      duels_won: existing.duels_won ?? s.duels?.won ?? null,
      passes_total: existing.passes_total ?? s.passes?.total ?? null,
      passes_accuracy: existing.passes_accuracy ?? s.passes?.accuracy ?? null,
      fouls_drawn: existing.fouls_drawn ?? s.fouls?.drawn ?? null,
      fouls_committed: existing.fouls_committed ?? s.fouls?.committed ?? null,
      yellow_cards: existing.yellow_cards ?? s.cards?.yellow ?? null,
      red_cards: existing.red_cards ?? s.cards?.red ?? null,
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
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
