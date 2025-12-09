"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

/* --------------------------------------------
   TYPES
-------------------------------------------- */
export interface Player {
  id: string;
  nickname: string;   // Already formatted (John D.)
  selfie_url: string | null;
  score: number;
  cell: number;
}

interface DBPlayerRow {
  id: string;
  lane_index: number | null;
  display_name: string | null;  // raw name from DB
  selfie_url: string | null;
  score: number | null;
  disconnected_at: string | null;
}

/* --------------------------------------------
   FORMAT NAME → "John D."
-------------------------------------------- */
function formatName(raw: string | null): string {
  if (!raw) return "Player";

  const parts = raw.trim().split(" ");
  if (parts.length === 1) return parts[0];

  const first = parts[0];
  const last = parts[1].charAt(0).toUpperCase();

  return `${first} ${last}.`;
}

/* --------------------------------------------
   HOOK: Load + realtime players
-------------------------------------------- */
export function usePlayers(gameId: string) {
  const [players, setPlayers] = useState<Player[]>([]);

  /* Map DB Row → Player */
  function mapRow(r: DBPlayerRow): Player {
    return {
      id: r.id,
      nickname: formatName(r.display_name),
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

          // Disconnection → remove
          if (row.disconnected_at) {
            setPlayers((prev) => prev.filter((p) => p.id !== row.id));
            return;
          }

          const mapped = mapRow(row);

          setPlayers((prev) => {
            const idx = prev.findIndex((p) => p.id === mapped.id);
            if (idx === -1) return [...prev, mapped];

            const copy = [...prev];
            copy[idx] = mapped;
            return copy;
          });
        }
      )
      .subscribe();

    return () => {
      try { supabase.removeChannel(channel); } catch {}
    };
  }, [gameId]);

  return players;
}
