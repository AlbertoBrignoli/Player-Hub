// lookup_football — helper TEMPORANEO.
// Body {"search":"eliasson"} -> cerca giocatori per cognome (profili)
// Body {"player_id":123,"season":2025} -> squadra corrente + info dal players endpoint
// Body {"stats_player_id":123,"stats_season":2025} -> statistiche per stagione
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(async (req) => {
  const API_KEY = Deno.env.get("API_FOOTBALL_KEY")!;
  const headers = { "x-apisports-key": API_KEY };
  let body: any = {};
  try { body = await req.json(); } catch (_) {}
  const out: any = {};

  if (body.search) {
    const r = await fetch(`https://v3.football.api-sports.io/players/profiles?search=${encodeURIComponent(body.search)}`, { headers });
    const d = await r.json();
    out.errors = d.errors;
    out.candidates = (d.response || []).map((x: any) => ({
      id: x.player?.id,
      name: x.player?.name,
      firstname: x.player?.firstname,
      lastname: x.player?.lastname,
      birth_date: x.player?.birth?.date,
      nationality: x.player?.nationality,
      position: x.player?.position,
      photo: x.player?.photo,
    }));
  }

  if (body.player_id) {
    const season = body.season || 2025;
    const r = await fetch(`https://v3.football.api-sports.io/players?id=${body.player_id}&season=${season}`, { headers });
    const d = await r.json();
    out.errors = d.errors;
    const resp = d.response?.[0];
    out.player = resp?.player ? {
      id: resp.player.id, name: resp.player.name, nationality: resp.player.nationality,
      birth_date: resp.player.birth?.date, position: resp.statistics?.[0]?.games?.position,
    } : null;
    out.team = resp?.statistics?.[0]?.team ?? null;
    out.leagues = (resp?.statistics || []).map((s: any) => ({ league: s.league?.name, season: s.league?.season, team: s.team?.name, team_id: s.team?.id }));
  }

  if (body.stats_player_id && body.stats_season) {
    const r = await fetch(`https://v3.football.api-sports.io/players?id=${body.stats_player_id}&season=${body.stats_season}`, { headers });
    const d = await r.json();
    out.season = body.stats_season;
    out.errors = d.errors;
    out.stats = (d.response?.[0]?.statistics || []).map((s: any) => ({
      league: s.league?.name,
      country: s.league?.country,
      season: s.league?.season,
      apps: s.games?.appearences,
      minutes: s.games?.minutes,
    }));
  }

  return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
});
