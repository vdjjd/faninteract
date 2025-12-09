"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

/* --------------------------------------------
   TYPES
-------------------------------------------- */
export interface Player {
  id: string;
  nickname: string;
  selfie_url: string | null;
  score: number;
  cell: number;
}

interface DBPlayerRow {
  id: string;
  lane_index: number | null;
  display_name: string | null;
  selfie_url: string | null;
  score: number | null;
  disconnected_at: string | null;
}

/* --------------------------------------------
   HOOK: Load + realtime players
-------------------------------------------- */
export function usePlayers(gameId: string) {
  const [players, setPlayers] = useState<Player[]>([]);

  /* Map DB row → Player */
  function mapRow(r: DBPlayerRow): Player {
    return {
      id: r.id,
      nickname: r.display_name || "Player",
      selfie_url: r.selfie_url,
      score: r.score ?? 0,
      cell: r.lane_index ?? 0,
    };
  }

  /* Initial load */
  useEffect(() => {
    if (!gameId) return;

    async function load() {
      const { data, error } = await supabase
        .from("bb_game_players")
        .select("*")
        .eq("game_id", gameId);

      if (error || !data) return;

      const active = (data as DBPlayerRow[]).filter((p) => !p.disconnected_at);
      setPlayers(active.map(mapRow));
    }

    load();
  }, [gameId]);

  /* Realtime updates */
  useEffect(() => {
    if (!gameId) return;

    const channel = supabase
      .channel(`players-${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bb_game_players",
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          const row = payload.new as DBPlayerRow;
          if (!row) return;

          // if player disconnects → remove them
          if (row.disconnected_at) {
            setPlayers((prev) => prev.filter((p) => p.id !== row.id));
            return;
          }

          const mapped = mapRow(row);

          setPlayers((prev) => {
            const idx = prev.findIndex((p) => p.id === mapped.id);
            if (idx === -1) return [...prev, mapped];

            const arr = [...prev];
            arr[idx] = mapped;
            return arr;
          });
        }
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, [gameId]);

  return players;
}
