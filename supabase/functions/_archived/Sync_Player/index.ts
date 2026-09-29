import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const API_KEY = Deno.env.get("API_FOOTBALL_KEY")!;

Deno.serve(async () => {
  try {
    const { data: players } = await supabase
      .from("player")
      .select("*");

    let updated = 0;

    for (const p of players || []) {

      console.log("🔍 PLAYER:", p.name);

      const res = await fetch(
        `https://v3.football.api-sports.io/players?id=${p.api_player_id}`,
        {
          headers: {
            "x-apisports-key": API_KEY,
          },
        }
      );

      const json = await res.json();

      const apiPlayer = json.response?.[0]?.player;
      const apiStats = json.response?.[0]?.statistics?.[0];

      if (!apiPlayer) {
        console.log("❌ NO PLAYER DATA");
        continue;
      }

      const updateData: any = {};

      // 💣 AGE DA BIRTH DATE (PRIMARY)
      let calculatedAge = null;

      if (apiPlayer.birth?.date) {
        const birthDate = new Date(apiPlayer.birth.date);

        calculatedAge = Math.floor(
          (Date.now() - birthDate.getTime()) /
          (1000 * 60 * 60 * 24 * 365.25)
        );

        console.log("📅 AGE CALCULATED:", calculatedAge);
      }

      // 🔁 FALLBACK SU STATS
      const statsAge = apiStats?.games?.age;

      console.log("📊 AGE STATS:", statsAge);

      const finalAge = calculatedAge || statsAge;

      console.log("🎯 FINAL AGE:", finalAge, "DB:", p.age);

      if (finalAge && Number(p.age) !== Number(finalAge)) {
        updateData.age = Number(finalAge);
      }

      // 🔥 NATIONALITY
      if (
        apiPlayer.nationality &&
        p.nationality !== apiPlayer.nationality
      ) {
        updateData.nationality = apiPlayer.nationality;
      }

      // 🔥 FOOT
      if (
        apiPlayer.foot &&
        p.preferred_foot !== apiPlayer.foot
      ) {
        updateData.preferred_foot = apiPlayer.foot;
      }

      // 🔥 HEIGHT
      if (
        apiPlayer.height &&
        p.height !== apiPlayer.height
      ) {
        updateData.height = apiPlayer.height;
      }

      // 🔥 PHOTO
      if (
        apiPlayer.photo &&
        p.photo_url !== apiPlayer.photo
      ) {
        updateData.photo_url = apiPlayer.photo;
      }

      // 👉 UPDATE
      if (Object.keys(updateData).length > 0) {
        updateData.updated_at = new Date().toISOString();

        console.log("🛠 UPDATE:", updateData);

        await supabase
          .from("player")
          .update(updateData)
          .eq("id", p.id);

        updated++;
      } else {
        console.log("✅ NO CHANGE");
      }
    }

    return new Response(
      JSON.stringify({ ok: true, updated }),
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