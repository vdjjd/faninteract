"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export function useCountdown(gameId: string) {
  const [countdown, setCountdown] = useState<number | null>(null);
  const channelRef = useRef<any>(null);
  const tickingRef = useRef(false); // prevents duplicate countdowns

  /* ------------------------------------------------------------
     SUBSCRIBE TO COUNTDOWN BROADCASTS
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
      .on("broadcast", { event: "start_game" }, (payload) => {
        const startTime = payload.payload?.startTime;
        if (!startTime) return;

        // Sync up in case local device missed exact countdown end
        supabase
          .from("bb_games")
          .update({
            game_running: true,
            game_timer_start: startTime,
          })
          .eq("id", gameId);
      })
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, [gameId]);

  /* ------------------------------------------------------------
     COUNTDOWN ENGINE — only this device counts down
  ------------------------------------------------------------ */
  useEffect(() => {
    if (countdown === null) return;

    // Countdown finished → broadcast start_game
    if (countdown <= 0) {
      setCountdown(null);
      tickingRef.current = false;

      const startTime = new Date().toISOString();

      supabase
        .from("bb_games")
        .update({
          game_running: true,
          game_timer_start: startTime,
        })
        .eq("id", gameId);

      channelRef.current?.send({
        type: "broadcast",
        event: "start_game",
        payload: { startTime },
      });

      return;
    }

    // Reduce countdown
    const t = setTimeout(() => {
      setCountdown((c) => (c === null ? null : c - 1));
    }, 1000);

    return () => clearTimeout(t);
  }, [countdown, gameId]);

  return countdown;
}
