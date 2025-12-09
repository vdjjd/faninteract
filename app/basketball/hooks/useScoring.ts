"use client";

import { useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

export interface ScoreEvent {
  laneIndex: number;     // which player/lane
  forcedMake: boolean;   // hitZone = true → guaranteed make
  swish: boolean;        // optional physics-based swish
  points?: number;       // default 2
}

/**
 * Scoring logic for Basketball Game
 * - Handles zone-makes
 * - Handles swish/hard-hit styles
 * - Writes score to Supabase
 */
export function useScoring(players: any[]) {
  /**
   * Register a score for a specific lane
   */
  const registerScore = useCallback(
    async ({ laneIndex, forcedMake, swish, points = 2 }: ScoreEvent) => {
      try {
        const player = players.find((p) => p.cell === laneIndex);
        if (!player) return;

        // Always assign points for forced hitZone makes
        const newScore = player.score + points;

        await supabase
          .from("bb_game_players")
          .update({ score: newScore })
          .eq("id", player.id);

        console.log(
          `%c SCORE → Lane ${laneIndex + 1}: +${points}${swish ? " (swish)" : forcedMake ? " (zone make)" : ""
          }`,
          "color:#00ff9d;font-weight:bold"
        );

      } catch (err) {
        console.error("❌ Score update failed:", err);
      }
    },
    [players]
  );

  return { registerScore };
}
