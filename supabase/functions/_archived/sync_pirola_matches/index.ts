// supabase/functions/sync_pirola_matches/index.ts

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const API_KEY = Deno.env.get("API_FOOTBALL_KEY")!;

const TEAM_ID = 553;
const PLAYER_ID = 134431;

Deno.serve(async () => {
  try {
    const res = await fetch(
      `https://v3.football.api-sports.io/fixtures?team=${TEAM_ID}&next=10`,
      {
        headers: {
          "x-apisports-key": API_KEY,
        },
      }
    );

    const json = await res.json();

    if (!json.response) {
      return new Response(
        JSON.stringify({ ok: false, error: "No data from API" }),
        { status: 400 }
      );
    }

    let inserted = 0;
    let updated = 0;

    for (const item of json.response) {
      const fixture = item.fixture;
      const league = item.league;
      const teams = item.teams;
      const goals = item.goals;

      // 🛑 safety check
      if (!fixture || !teams) continue;

      const isHome = teams.home.id === TEAM_ID;

      const match_uid = `${fixture.id}_${PLAYER_ID}`;

      const payload = {
        match_uid,
        fixture_id: fixture.id,
        match_date: fixture.date,

        league: league?.name || null,
        season: league?.season || null,
        round: league?.round || null,

        home_team: teams.home?.name || null,
        away_team: teams.away?.name || null,

        opponent: isHome
          ? teams.away?.name || null
          : teams.home?.name || null,

        venue: isHome ? "home" : "away",

        // ✅ NUOVO CAMPO STADIUM
        stadium: fixture.venue?.name || null,

        status: fixture.status?.short || null,

        team_score: isHome ? goals?.home ?? null : goals?.away ?? null,
        opponent_score: isHome ? goals?.away ?? null : goals?.home ?? null,

        updated_at: new Date().toISOString(),
      };

      // 🔍 CHECK SE ESISTE
      const { data: existing, error: selectError } = await supabase
        .from("matches")
        .select("id")
        .eq("match_uid", match_uid)
        .maybeSingle();

      if (selectError) {
        console.error("Select error:", selectError);
        continue;
      }

      // 🔄 UPDATE
      if (existing) {
        const { error: updateError } = await supabase
          .from("matches")
          .update(payload)
          .eq("match_uid", match_uid);

        if (updateError) {
          console.error("Update error:", updateError);
          continue;
        }

        updated++;
      }

      // ➕ INSERT
      else {
        const { error: insertError } = await supabase
          .from("matches")
          .insert({
            ...payload,
            created_at: new Date().toISOString(),
          });

        if (insertError) {
          console.error("Insert error:", insertError);
          continue;
        }

        inserted++;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        inserted,
        updated,
      }),
      { status: 200 }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: error.message,
      }),
      { status: 500 }
    );
  }
});