"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export function useCountdown(gameId: string) {
  const [countdown, setCountdown] = useState<number | null>(null);
  const channelRef = useRef<any>(null);
  const tickingRef = useRef(false); // prevents duplicate countdowns

  /* ------------------------------------------------------------
     SUBSCRIBE TO COUNTDOWN & START_GAME BROADCASTS
  ------------------------------------------------------------ */
  useEffect(() => {
    const channel = supabase.channel(`basketball-${gameId}`);
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "start_countdown" }, (payload) => {
        const incomingGame = payload?.payload?.gameId;
        if (incomingGame !== gameId) return;

        if (!tickingRef.current) {
          tickingRef.current = true;
          setCountdown(10);
        }
      })
      .on("broadcast", { event: "start_game" }, async (payload) => {
        const startTime = payload.payload?.startTime;
        if (!startTime) return;

        // Sync with the DB — ensure timer starts if missed event
        await supabase
          .from("bb_games")
          .update({
            game_running: true,
            game_timer_start: startTime,
          })
          .eq("id", gameId)
          .select(); // <-- Required for Supabase w/ Next.js 16
      })
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, [gameId]);

  /* ------------------------------------------------------------
     COUNTDOWN ENGINE — device that received event handles counting
  ------------------------------------------------------------ */
  useEffect(() => {
    if (countdown === null) return;

    // Countdown finished → start game
    if (countdown <= 0) {
      setCountdown(null);
      tickingRef.current = false;

      const startTime = new Date().toISOString();

      // 🚨 REQUIRED FIX: always await update + include .select()
      (async () => {
        await supabase
          .from("bb_games")
          .update({
            game_running: true,
            game_timer_start: startTime,
          })
          .eq("id", gameId)
          .select(); // <-- ensures the update actually runs

        // Broadcast start_game to all clients
        channelRef.current?.send({
          type: "broadcast",
          event: "start_game",
          payload: { startTime },
        });
      })();

      return;
    }

    // Otherwise, keep counting down…
    const t = setTimeout(() => {
      setCountdown((c) => (c === null ? null : c - 1));
    }, 1000);

    return () => clearTimeout(t);
  }, [countdown, gameId]);

  return countdown;
}
