import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const NOTION_API_KEY = Deno.env.get("NOTION_API_KEY")!;
const DATABASE_ID = Deno.env.get("NOTION_DATABASE_ID")!;

Deno.serve(async () => {
  try {
    const { data: players } = await supabase
      .from("player")
      .select("*");

    let created = 0;
    let updated = 0;

    for (const p of players || []) {

      console.log("🔍 PLAYER:", p.name, "AGE RAW:", p.age);

      // 🔍 CERCA SU NOTION PER Player ID (NO DUPLICATI)
      const searchRes = await fetch(
        `https://api.notion.com/v1/databases/${DATABASE_ID}/query`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${NOTION_API_KEY}`,
            "Content-Type": "application/json",
            "Notion-Version": "2022-06-28",
          },
          body: JSON.stringify({
            filter: {
              property: "Player ID",
              number: {
                equals: p.api_player_id,
              },
            },
          }),
        }
      );

      const searchData = await searchRes.json();
      const existingPage = searchData.results?.[0];

      // 🎯 PROPERTIES BASE (AGE FIX)
      const properties: any = {
        Name: {
          title: [
            {
              text: { content: p.name || "No Name" },
            },
          ],
        },
        "Player ID": {
          number: p.api_player_id || null,
        },
        Age: {
          number: p.age ? Number(p.age) : null,
        },
        Team: {
          rich_text: [
            {
              text: { content: p.team_name || "" },
            },
          ],
        },
        Nationality: {
          rich_text: [
            {
              text: { content: p.nationality || "" },
            },
          ],
        },
        Position: p.position
          ? { select: { name: p.position } }
          : undefined,
        Foot: p.preferred_foot
          ? { select: { name: p.preferred_foot } }
          : undefined,
        Height: {
          rich_text: [
            {
              text: { content: p.height || "" },
            },
          ],
        },
      };

      // 📸 PHOTO
      if (p.photo_url) {
        properties.Photo = {
          files: [
            {
              name: "photo",
              external: {
                url: p.photo_url,
              },
            },
          ],
        };
      }

      // 🔁 SE ESISTE → UPDATE SOLO CAMPI MANCANTI
      if (existingPage) {
        const pageId = existingPage.id;
        const notionProps = existingPage.properties;

        const updatePayload: any = {};

        // 👉 aggiorna solo se vuoto su Notion
        if (!notionProps.Age?.number && p.age) {
          updatePayload.Age = {
            number: Number(p.age),
          };
        }

        if (!notionProps.Nationality?.rich_text?.length && p.nationality) {
          updatePayload.Nationality = properties.Nationality;
        }

        if (!notionProps.Team?.rich_text?.length && p.team_name) {
          updatePayload.Team = properties.Team;
        }

        if (!notionProps.Foot?.select && p.preferred_foot) {
          updatePayload.Foot = properties.Foot;
        }

        if (!notionProps.Height?.rich_text?.length && p.height) {
          updatePayload.Height = properties.Height;
        }

        if (!notionProps.Photo?.files?.length && p.photo_url) {
          updatePayload.Photo = properties.Photo;
        }

        // 👉 SOLO SE C’È QUALCOSA DA AGGIORNARE
        if (Object.keys(updatePayload).length > 0) {
          console.log("🛠 UPDATE:", p.name, updatePayload);

          await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${NOTION_API_KEY}`,
              "Content-Type": "application/json",
              "Notion-Version": "2022-06-28",
            },
            body: JSON.stringify({
              properties: updatePayload,
            }),
          });

          updated++;
        }

        continue;
      }

      // 🆕 CREATE SOLO SE NON ESISTE
      console.log("🆕 CREATE:", p.name);

      const res = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${NOTION_API_KEY}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify({
          parent: { database_id: DATABASE_ID },
          properties,
        }),
      });

      const data = await res.json();

      if (data.id) {
        await supabase
          .from("player")
          .update({ notion_page_id: data.id })
          .eq("id", p.id);

        created++;
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