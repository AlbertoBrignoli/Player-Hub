import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const NOTION_API_KEY = Deno.env.get("NOTION_API_KEY")!;
const DATABASE_ID = Deno.env.get("NOTION_MATCHES_DB_ID")!;

Deno.serve(async () => {
  try {

    // 🔹 1. PRENDI MATCHES DA SUPABASE
    const { data: matches, error } = await supabase
      .from("matches")
      .select("*")
      .limit(50);

    if (error) throw error;

    let created = 0;
    let updated = 0;

    // 🔹 VALID STATUS
    const validStatus = ["NS", "1H", "HT", "2H", "FT"];

    for (const m of matches || []) {

      const fixtureId = String(m.fixture_id);

      // 🔍 2. CERCA SE ESISTE GIÀ SU NOTION
      const searchRes = await fetch("https://api.notion.com/v1/databases/" + DATABASE_ID + "/query", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${NOTION_API_KEY}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify({
          filter: {
            property: "Fixture ID",
            title: {
              equals: fixtureId
            }
          }
        })
      });

      const searchData = await searchRes.json();
      const existingPage = searchData.results?.[0];

      // 🧱 3. COSTRUISCI PROPERTIES (SAFE)
      const properties: any = {};

      // TITLE
      properties["Fixture ID"] = {
        title: [
          {
            text: { content: fixtureId }
          }
        ]
      };

      properties["Match UID"] = {
        rich_text: [{ text: { content: m.match_uid || "" } }]
      };

      properties["Player"] = {
        rich_text: [{ text: { content: String(m.player_id || "") } }]
      };

      properties["Player ID"] = {
        number: m.player_id ?? null
      };

      properties["Team ID"] = {
        number: m.team_id ?? null
      };

      properties["Home Team"] = {
        rich_text: [{ text: { content: m.home_team || "" } }]
      };

      properties["Away Team"] = {
        rich_text: [{ text: { content: m.away_team || "" } }]
      };

      properties["Round"] = {
        rich_text: [{ text: { content: m.round || "" } }]
      };

      properties["Team Score"] = {
        number: m.team_score ?? null
      };

      properties["Opponent Score"] = {
        number: m.opponent_score ?? null
      };

      properties["Goals"] = {
        number: m.goals ?? null
      };

      properties["Assists"] = {
        number: m.assists ?? null
      };

      properties["Minutes"] = {
        number: m.minutes ?? null
      };

      properties["Rating"] = {
        number: m.rating ?? null
      };

      properties["Yellow Cards"] = {
        number: m.yellow_cards ?? null
      };

      properties["Red Cards"] = {
        number: m.red_cards ?? null
      };

      // 🏟️ STADIUM
      properties["Stadium"] = {
        rich_text: [
          {
            text: { content: m.stadium || "" }
          }
        ]
      };

      // 📅 MATCH DATE
      if (m.match_date) {
        properties["Match Date"] = {
          date: {
            start: m.match_date
          }
        };
      }

      // ⚽ STATUS (solo se valido)
      if (validStatus.includes(m.status)) {
        properties["Status"] = {
          select: { name: m.status }
        };
      }

      // 🏠 VENUE
      if (m.venue) {
        properties["Venue"] = {
          select: {
            name: m.venue === "home" ? "Home" : "Away"
          }
        };
      }

      // 🔹 4. CREATE o UPDATE
      if (!existingPage) {

        const createRes = await fetch("https://api.notion.com/v1/pages", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${NOTION_API_KEY}`,
            "Content-Type": "application/json",
            "Notion-Version": "2022-06-28",
          },
          body: JSON.stringify({
            parent: { database_id: DATABASE_ID },
            properties
          })
        });

        const createData = await createRes.json();

        if (createData.id) created++;

      } else {

        const updateRes = await fetch(`https://api.notion.com/v1/pages/${existingPage.id}`, {
          method: "PATCH",
          headers: {
            "Authorization": `Bearer ${NOTION_API_KEY}`,
            "Content-Type": "application/json",
            "Notion-Version": "2022-06-28",
          },
          body: JSON.stringify({
            properties
          })
        });

        const updateData = await updateRes.json();

        if (updateData.id) updated++;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, created, updated }),
      { status: 200 }
    );

  } catch (err) {
    console.error("❌ ERROR:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500 }
    );
  }
});