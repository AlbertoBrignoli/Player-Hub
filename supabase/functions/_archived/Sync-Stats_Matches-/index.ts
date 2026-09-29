import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const NOTION_API_KEY = Deno.env.get("NOTION_API_KEY")!;

// ✅ DATABASE CORRETTO
const NOTION_DATABASE_ID = "24ff083e6e66411eafb02ac8d29fb5ac";

async function findNotionPage(match_uid: string) {
  const res = await fetch(
    `https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NOTION_API_KEY}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filter: {
          property: "Match UID",
          rich_text: {
            equals: match_uid,
          },
        },
      }),
    }
  );

  const data = await res.json();
  return data.results?.[0] || null;
}

Deno.serve(async () => {
  try {
    const { data: matches } = await supabase
      .from("matches")
      .select("*")
      .limit(20);

    let created = 0;
    let updated = 0;

    for (const m of matches) {
      const match_uid = m.match_uid || `${m.fixture_id}_${m.player_id}`;

      const existingPage = await findNotionPage(match_uid);

      const properties = {
        // 🔑 IDENTITÀ
        "Fixture ID": {
          title: [{ text: { content: String(m.fixture_id) } }],
        },

        "Match UID": {
          rich_text: [{ text: { content: match_uid } }],
        },

        // 📅 BASE
        "Match Date": {
          date: { start: m.match_date },
        },

        "Home Team": {
          rich_text: [{ text: { content: m.home_team || "" } }],
        },

        "Away Team": {
          rich_text: [{ text: { content: m.away_team || "" } }],
        },

        "Player": {
          rich_text: [
            { text: { content: m.player_name || "Lorenzo Pirola" } },
          ],
        },

        "Player ID": { number: m.player_id ?? null },

        // 🟢 FILTRI VIEW (FONDAMENTALI)
        "Status": {
          select: { name: m.status || "FT" },
        },

        "League": {
          select: { name: m.league || "Super League 1" },
        },

        "Venue": {
          select: { name: m.venue || "Home" },
        },

        "Round": {
          rich_text: [{ text: { content: m.round || "" } }],
        },

        // 📊 STATS BASE
        "Minutes": { number: m.minutes ?? null },
        "Goals": { number: m.goals ?? null },
        "Assists": { number: m.assists ?? null },
        "Rating": { number: m.rating ?? null },

        // 🟨 CARDS
        "Yellow Cards": { number: m.yellow_cards ?? null },
        "Red Cards": { number: m.red_cards ?? null },

        // ⚽ SCORE
        "Team Score": { number: m.team_score ?? null },
        "Opponent Score": { number: m.opponent_score ?? null },

        // 🛡️ DIFESA
        "Blocks": { number: m.blocks ?? null },
        "Interceptions": { number: m.interceptions ?? null },
        "Tackles": { number: m.tackles ?? null },

        // ⚔️ DUELLI
        "Duels Total": { number: m.duels_total ?? null },
        "Duels Won": { number: m.duels_won ?? null },

        // 🎯 PASSAGGI
        "Passes Total": { number: m.passes_total ?? null },

        "Passes Accuracy": m.passes_accuracy
          ? {
              rich_text: [
                { text: { content: String(m.passes_accuracy) } },
              ],
            }
          : { rich_text: [] },

        // 🚨 FALLI
        "Fouls Drawn": { number: m.fouls_drawn ?? null },
        "Fouls Committed": { number: m.fouls_committed ?? null },

        // 🏟️ EXTRA
        "Team ID": { number: m.team_id ?? null },

        "stadium": {
          rich_text: [{ text: { content: m.stadium || "" } }],
        },
      };

      // 🔄 UPDATE
      if (existingPage) {
        await fetch(`https://api.notion.com/v1/pages/${existingPage.id}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${NOTION_API_KEY}`,
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ properties }),
        });

        updated++;
      }

      // 🆕 CREATE
      else {
        await fetch("https://api.notion.com/v1/pages", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${NOTION_API_KEY}`,
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            parent: { database_id: NOTION_DATABASE_ID },
            properties,
          }),
        });

        created++;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        created,
        updated,
      }),
      { headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: err.message,
      }),
      { status: 500 }
    );
  }
});