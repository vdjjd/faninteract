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
   HOOK: Load + Realtime Players
-------------------------------------------- */
export function usePlayers(gameId: string) {
  const [players, setPlayers] = useState<Player[]>([]);

  /* ------------------------------
     HELPER: Map DB → Player object
  ------------------------------ */
  function mapRow(r: DBPlayerRow): Player {
    return {
      id: r.id,
      nickname: r.display_name || "Player",
      selfie_url: r.selfie_url,
      score: r.score ?? 0,
      cell: r.lane_index ?? 0,
    };
  }

  /* ------------------------------
     INITIAL LOAD
  ------------------------------ */
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("bb_game_players")
        .select("*")
        .eq("game_id", gameId);

      const active = (data as DBPlayerRow[]).filter((p) => !p.disconnected_at);
      setPlayers(active.map(mapRow));
    }

    load();
  }, [gameId]);

  /* ------------------------------
     REALTIME UPDATES
  ------------------------------ */
  useEffect(() => {
    const channel = supabase
      .channel(`bb_game_players_${gameId}`)
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

          // Player left the game
          if (row.disconnected_at) {
            setPlayers((prev) => prev.filter((p) => p.id !== row.id));
            return;
          }

          // Update or insert
          const mapped = mapRow(row);
          setPlayers((prev) => {
            const idx = prev.findIndex((p) => p.id === mapped.id);
            if (idx === -1) return [...prev, mapped];

            const next = [...prev];
            next[idx] = mapped;
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [gameId]);

  return players;
}
