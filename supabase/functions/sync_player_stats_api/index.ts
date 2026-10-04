// sync_player_stats_api — statistiche per competizione, STAGIONE CORRENTE + PRECEDENTE.
// Nessun body -> tutti i giocatori, stagione corrente + precedente (calcolate dalla data).
// Body {"player_id":123,"season":2024} -> solo quel giocatore/stagione.
// Body {"career":true} -> TUTTE le stagioni disponibili + profilo, trasferimenti, trofei e
//   infortuni (player_api_extra). Pesante: lo lancia il cron settimanale, non quello post-partita.
// Ogni riga salva in `raw` l'oggetto statistiche completo di API-Football.
// Accesso: header x-sync-secret (cron), service key (onboard_player) o admin loggato.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const API_KEY = Deno.env.get("API_FOOTBALL_KEY")!;
// stagione calcistica luglio-giugno: a ottobre 2026 la corrente e' 2026 (2026/27)
const now = new Date();
const CURRENT = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
const SEASONS = [CURRENT, CURRENT - 1]; // corrente + precedente

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

    const { players, seasons, career } = await resolveTargets(req);
    if (players.length === 0) return json({ ok: false, error: "No players to sync" }, 400);

    const results = [];
    for (const PLAYER_ID of players) {
      let list = seasons;
      if (career) {
        const extra = await syncExtra(PLAYER_ID);
        results.push({ player_id: PLAYER_ID, extra });
        if (extra.seasons?.length) list = extra.seasons;
      }
      for (const SEASON of list) {
        const r = await syncOne(PLAYER_ID, SEASON);
        results.push({ player_id: PLAYER_ID, season: SEASON, ...r });
      }
    }
    return json({ ok: true, results });
  } catch (error) {
    return json({ ok: false, error: error.message }, 500);
  }
});

async function resolveTargets(req: Request) {
  let body: any = {};
  try { body = await req.json(); } catch (_) { /* no body */ }

  const seasons = body && body.season ? [Number(body.season)] : SEASONS;
  const career = body?.career === true;

  if (body && body.player_id) {
    return { players: [Number(body.player_id)], seasons, career };
  }

  const { data } = await supabase
    .from("player")
    .select("api_player_id")
    .not("api_player_id", "is", null);

  return { players: (data || []).map((p: any) => p.api_player_id), seasons, career };
}

async function apiGet(path: string) {
  const res = await fetch(`https://v3.football.api-sports.io${path}`, { headers: { "x-apisports-key": API_KEY } });
  return (await res.json())?.response ?? [];
}

// profilo + stagioni disponibili + trasferimenti + trofei + infortuni
async function syncExtra(PLAYER_ID: number) {
  const [seasonsR, transfersR, trophiesR, sidelinedR] = await Promise.all([
    apiGet(`/players/seasons?player=${PLAYER_ID}`),
    apiGet(`/transfers?player=${PLAYER_ID}`),
    apiGet(`/trophies?player=${PLAYER_ID}`),
    apiGet(`/sidelined?player=${PLAYER_ID}`),
  ]);
  const seasons = (seasonsR as number[]).map(Number).filter(n => n > 1990 && n <= CURRENT).sort((a, b) => b - a);
  const prof = (await apiGet(`/players?id=${PLAYER_ID}&season=${seasons[0] ?? CURRENT}`))[0]?.player ?? null;
  const row = {
    player_id: PLAYER_ID,
    profile: prof,
    seasons,
    transfers: transfersR[0]?.transfers ?? [],
    trophies: trophiesR,
    sidelined: sidelinedR,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("player_api_extra").upsert(row, { onConflict: "player_id" });
  return {
    seasons, error: error?.message,
    transfers: row.transfers.length, trophies: trophiesR.length, sidelined: sidelinedR.length,
  };
}

async function syncOne(PLAYER_ID: number, SEASON: number) {
  const res = await fetch(
    `https://v3.football.api-sports.io/players?id=${PLAYER_ID}&season=${SEASON}`,
    { headers: { "x-apisports-key": API_KEY } },
  );

  const data = await res.json();
  if (!data.response || data.response.length === 0) {
    return { updated: 0, error: "No player data" };
  }

  const statsArray = data.response[0].statistics || [];
  let updated = 0;

  for (const stat of statsArray) {
    const league = stat.league;
    const team = stat.team;
    const games = stat.games;
    const goals = stat.goals;
    const cards = stat.cards;
    const passes = stat.passes;

    const payload = {
      player_id: PLAYER_ID,
      team_id: team.id,
      season: league.season,
      competition: league.name,
      appearances: games.appearences || 0,
      minutes: games.minutes || 0,
      goals: goals.total || 0,
      assists: goals.assists || 0,
      passes: passes.total || 0,
      rating: games.rating ? parseFloat(games.rating) : null,
      yellow_cards: cards.yellow || 0,
      red_cards: cards.red || 0,
      raw: stat,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("player_stats_api")
      .upsert(payload, { onConflict: "player_id,season,competition,team_id" });

    if (error) { console.error("Upsert error:", error); continue; }
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
