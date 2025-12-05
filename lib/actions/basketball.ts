"use server";

import { supabase } from "@/lib/supabaseClient";

export async function createBasketballGame(
  hostId: string,
  fields: { title: string }
) {
  try {
    // ✅ MUST generate UUID manually (client-side defaults do NOT fire)
    const newId = crypto.randomUUID();

    const { data, error } = await supabase
      .from("bb_games")
      .insert({
        id: newId,                    // ⭐ REQUIRED FIX
        host_id: hostId,
        title: fields.title,
        status: "lobby",
        max_players: 10,
        duration_seconds: 90,
        game_running: false,
        game_timer_start: null,
        background_brightness: 100,   // default brightness
      })
      .select()
      .single();

    if (error) {
      console.error("❌ createBasketballGame error:", error);
      return null;
    }

    return data;
  } catch (err) {
    console.error("❌ Unexpected error:", err);
    return null;
  }
}
