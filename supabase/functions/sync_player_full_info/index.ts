// sync_player_full_info — compila la tabella `player` da API-Football.
// Nessun body            -> tutti i giocatori della tabella `player`.
// Body {"player_id":128461,"team_id":500} -> solo quel giocatore.
// Opzioni body: "season" (default stagione corrente), "force" (true = sovrascrive anche i campi gia' pieni).
// Default: riempie SOLO i campi vuoti (non tocca i dati inseriti a mano).
// Accesso: header x-sync-secret (cron), service key (onboard_player) o admin loggato.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const API_KEY = Deno.env.get("API_FOOTBALL_KEY")!;
const API = "https://v3.football.api-sports.io";
const _now = new Date();
const DEFAULT_SEASON = _now.getUTCMonth() >= 6 ? _now.getUTCFullYear() : _now.getUTCFullYear() - 1;

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

    const { targets, season, force } = await resolveTargets(req);
    if (targets.length === 0) return json({ ok: false, error: "No players to sync" }, 400);

    const results = [];
    for (const t of targets) {
      try {
        results.push({ player_id: t.api_player_id, ...(await enrichOne(t, season, force)) });
      } catch (e) {
        results.push({ player_id: t.api_player_id, error: (e as Error).message });
      }
    }
    return json({ ok: true, results });
  } catch (error) {
    return json({ ok: false, error: (error as Error).message }, 500);
  }
});

async function resolveTargets(req: Request) {
  let body: any = {};
  try { body = await req.json(); } catch (_) { /* no body */ }

  const season = body && body.season ? Number(body.season) : DEFAULT_SEASON;
  const force = body && body.force === true;

  if (body && body.player_id) {
    return {
      targets: [{ api_player_id: Number(body.player_id), team_id: body.team_id ? Number(body.team_id) : null }],
      season, force,
    };
  }

  const { data } = await supabase
    .from("player")
    .select("api_player_id, team_id")
    .not("api_player_id", "is", null);

  return {
    targets: (data || []).map((p: any) => ({ api_player_id: p.api_player_id, team_id: p.team_id })),
    season, force,
  };
}

async function apiGet(path: string) {
  const res = await fetch(`${API}${path}`, { headers: { "x-apisports-key": API_KEY } });
  return await res.json();
}

async function enrichOne(t: { api_player_id: number; team_id: number | null }, season: number, force: boolean) {
  const { data: row } = await supabase
    .from("player")
    .select("*")
    .eq("api_player_id", t.api_player_id)
    .maybeSingle();

  if (!row) return { error: "player row not found" };

  const teamId = t.team_id ?? row.team_id;

  // 1) bio + ruolo dal players endpoint
  const pj = await apiGet(`/players?id=${t.api_player_id}&season=${season}`);
  const pl = pj.response?.[0]?.player;
  const st = pj.response?.[0]?.statistics?.[0];

  // 2) squadra + stadio dal teams endpoint
  let tm: any = null, venue: any = null;
  if (teamId) {
    const tj = await apiGet(`/teams?id=${teamId}`);
    tm = tj.response?.[0]?.team;
    venue = tj.response?.[0]?.venue;
  }

  // 3) numero di maglia dallo squad
  let number: number | null = null;
  if (teamId) {
    const sj = await apiGet(`/players/squads?team=${teamId}`);
    const sp = sj.response?.[0]?.players?.find((x: any) => Number(x.id) === Number(t.api_player_id));
    number = sp?.number ?? null;
  }

  const birth_date = pl?.birth?.date ?? null;
  let age = pl?.age ?? st?.games?.age ?? null;
  if (!age && birth_date) {
    age = Math.floor((Date.now() - new Date(birth_date).getTime()) / (1000 * 60 * 60 * 24 * 365.25));
  }

  const candidate: Record<string, unknown> = {
    team_name: tm?.name ?? null,
    team_country: tm?.country ?? null,
    position: st?.games?.position ?? null,
    shirt_number: number,
    height: pl?.height ?? null,
    weight: pl?.weight ?? null,
    preferred_foot: pl?.foot ?? null,
    nationality: pl?.nationality ?? null,
    age: age ?? null,
    birth_date,
    photo_url: pl?.photo ?? null,
    stadium_name: venue?.name ?? null,
    stadium_capacity: venue?.capacity ?? null,
    stadium_photo_url: venue?.image ?? null,
  };

  const isEmpty = (v: unknown) => v === null || v === undefined || v === "";

  const updateData: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(candidate)) {
    if (isEmpty(v)) continue;
    if (force || isEmpty((row as any)[k])) updateData[k] = v;
  }

  if (Object.keys(updateData).length === 0) return { filled: [] };

  const { error } = await supabase.from("player").update(updateData).eq("api_player_id", t.api_player_id);
  if (error) return { error: error.message };

  return { filled: Object.keys(updateData) };
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
