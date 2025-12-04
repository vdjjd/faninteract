"use server";

import { supabase } from "@/lib/supabaseClient";

export async function createBasketballGame(hostId: string, fields: { title: string }) {
  try {
    const { data, error } = await supabase
      .from("bb_games")
      .insert({
        host_id: hostId,
        title: fields.title,
        status: "lobby",
        max_players: 10,
        duration_seconds: 90,
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
