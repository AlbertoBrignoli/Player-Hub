import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const NOTION_API_KEY = Deno.env.get("NOTION_API_KEY")!;
const DATABASE_ID = Deno.env.get("NOTION_DATABASE_ID")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async () => {
  try {

    // 1️⃣ prendo matches da supabase
    const res = await fetch(`${SUPABASE_URL}/rest/v1/matches?select=*`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
      },
    });

    const matches = await res.json();

    console.log("MATCHES:", matches.length);

    let updated = 0;

    // 2️⃣ ciclo matches
    for (const m of matches) {

      const fixtureId = String(m.fixture_id);

      // 3️⃣ cerco su notion
      const searchRes = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
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

      const page = searchData.results?.[0];

      if (!page) {
        console.log("NOT FOUND:", fixtureId);
        continue;
      }

      // 4️⃣ UPDATE SOLO STADIUM
      const updateRes = await fetch(`https://api.notion.com/v1/pages/${page.id}`, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${NOTION_API_KEY}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify({
          properties: {
            // ⚠️ NOME ESATTO DELLA COLONNA (come nel tuo Notion)
            "stadium": {
              rich_text: [
                {
                  text: {
                    content: m.stadium || ""
                  }
                }
              ]
            }
          }
        })
      });

      const updateData = await updateRes.json();

      if (!updateRes.ok) {
        console.log("ERROR UPDATE:", updateData);
        continue;
      }

      console.log("UPDATED:", fixtureId, m.stadium);

      updated++;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        updated
      }),
      { status: 200 }
    );

  } catch (err) {
    console.error("ERROR:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500 }
    );
  }
});