// sync_player_matches — partite per atleta: ULTIME n giocate + PROSSIME n.
// Nessun body -> tutti i giocatori della tabella `player`, 10 e 10 (usato dal cron).
// Body {"player_id":123,"team_id":456} -> solo quel giocatore.
// Body {"next":50,"last":10} -> allarga la finestra (una tantum, es. calendario intero).
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

    let body: any = {};
    try { body = await req.clone().json(); } catch (_) { /* no body */ }

    const nextN = Math.min(Number(body?.next) || 10, 99);
    const lastN = Math.min(Number(body?.last) || 10, 99);

    const targets = await resolveTargets(body);
    if (targets.length === 0) {
      return json({ ok: false, error: "No players to sync" }, 400);
    }

    const results = [];
    for (const t of targets) {
      const r = await syncOne(t.api_player_id, t.team_id, lastN, nextN);
      results.push({ player_id: t.api_player_id, team_id: t.team_id, ...r });
    }

    return json({ ok: true, window: { last: lastN, next: nextN }, results });
  } catch (error) {
    return json({ ok: false, error: error.message }, 500);
  }
});

async function resolveTargets(body: any) {
  if (body && body.player_id && body.team_id) {
    return [{ api_player_id: Number(body.player_id), team_id: Number(body.team_id) }];
  }

  const { data } = await supabase
    .from("player")
    .select("api_player_id, team_id")
    .not("api_player_id", "is", null);

  return (data || [])
    .filter((p: any) => p.team_id)
    .map((p: any) => ({ api_player_id: p.api_player_id, team_id: p.team_id }));
}

async function syncOne(PLAYER_ID: number, TEAM_ID: number, lastN: number, nextN: number) {
  const headers = { "x-apisports-key": API_KEY };

  const [lastRes, nextRes] = await Promise.all([
    fetch(`https://v3.football.api-sports.io/fixtures?team=${TEAM_ID}&last=${lastN}`, { headers }),
    fetch(`https://v3.football.api-sports.io/fixtures?team=${TEAM_ID}&next=${nextN}`, { headers }),
  ]);
  const lastData = await lastRes.json();
  const nextData = await nextRes.json();
  const items = [ ...(lastData.response || []), ...(nextData.response || []) ];

  if (items.length === 0) return { inserted: 0, updated: 0, error: "No data from API" };

  let inserted = 0;
  let updated = 0;
  const teamsMap: Record<string, { team_id: number; name: string | null; logo_url: string | null }> = {};

  for (const item of items) {
    const fixture = item.fixture;
    const league = item.league;
    const teams = item.teams;
    const goals = item.goals;

    if (!fixture || !teams) continue;

    const isHome = teams.home.id === TEAM_ID;
    const match_uid = `${fixture.id}_${PLAYER_ID}`;

    // raccolgo i loghi squadra per la libreria interna
    for (const side of [teams.home, teams.away]) {
      if (side?.id) teamsMap[side.id] = { team_id: side.id, name: side.name ?? null, logo_url: side.logo ?? null };
    }

    const payload = {
      match_uid,
      player_id: PLAYER_ID,
      team_id: TEAM_ID,
      fixture_id: fixture.id,
      match_date: fixture.date,
      league: league?.name ?? null,
      season: league?.season ?? null,
      round: league?.round ?? null,
      home_team: teams.home?.name ?? null,
      away_team: teams.away?.name ?? null,
      home_team_id: teams.home?.id ?? null,
      away_team_id: teams.away?.id ?? null,
      home_logo: teams.home?.logo ?? null,
      away_logo: teams.away?.logo ?? null,
      opponent: isHome ? (teams.away?.name ?? null) : (teams.home?.name ?? null),
      venue: isHome ? "home" : "away",
      stadium: fixture.venue?.name ?? null,
      status: fixture.status?.short ?? null,
      team_score: isHome ? (goals?.home ?? null) : (goals?.away ?? null),
      opponent_score: isHome ? (goals?.away ?? null) : (goals?.home ?? null),
      updated_at: new Date().toISOString(),
    };

    const { data: existing, error: selectError } = await supabase
      .from("matches")
      .select("id")
      .eq("match_uid", match_uid)
      .maybeSingle();

    if (selectError) { console.error("Select error:", selectError); continue; }

    if (existing) {
      const { error } = await supabase.from("matches").update(payload).eq("match_uid", match_uid);
      if (error) { console.error("Update error:", error); continue; }
      updated++;
    } else {
      const { error } = await supabase.from("matches").insert({ ...payload, created_at: new Date().toISOString() });
      if (error) { console.error("Insert error:", error); continue; }
      inserted++;
    }
  }

  // libreria loghi: upsert una volta per tutte le squadre viste
  const teamRows = Object.values(teamsMap);
  if (teamRows.length > 0) {
    const { error: tErr } = await supabase.from("teams")
      .upsert(teamRows.map(t => ({ ...t, updated_at: new Date().toISOString() })), { onConflict: "team_id" });
    if (tErr) console.error("Teams upsert error:", tErr);
  }

  return { inserted, updated, teams: teamRows.length };
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
