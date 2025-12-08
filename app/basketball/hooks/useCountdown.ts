"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

/**
 * STABLE VERSION — FanInteract Original Style
 * Returns ONLY a number.
 */
export function useCountdown(gameId: string) {
  const [countdown, setCountdown] = useState<number | null>(null);

  /* -----------------------------------------------------------
     LISTEN FOR DASHBOARD → start_countdown
  ----------------------------------------------------------- */
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.data?.type === "start_countdown") {
        setCountdown(10);
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  /* -----------------------------------------------------------
     LISTEN FOR SUPABASE BROADCAST
  ----------------------------------------------------------- */
  useEffect(() => {
    const channel = supabase
      .channel(`basketball-${gameId}`)
      .on("broadcast", { event: "start_countdown" }, () => {
        setCountdown(10);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  /* -----------------------------------------------------------
     COUNTDOWN TICK + GAME START
  ----------------------------------------------------------- */
  useEffect(() => {
    if (countdown === null) return;

    if (countdown <= 0) {
      setCountdown(null);

      // START GAME
      (async () => {
        const startTime = new Date().toISOString();

        await supabase
          .from("bb_games")
          .update({
            game_running: true,
            game_timer_start: startTime,
          })
          .eq("id", gameId);

        // Broadcast start_game
        supabase.channel(`basketball-${gameId}`).send({
          type: "broadcast",
          event: "start_game",
          payload: { startTime },
        });
      })();

      return;
    }

    const t = setTimeout(() => {
      setCountdown((n) => (n !== null ? n - 1 : null));
    }, 1000);

    return () => clearTimeout(t);
  }, [countdown, gameId]);

  return countdown;
}
