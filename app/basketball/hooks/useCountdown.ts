"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

/**
 * Manages:
 * - pre-countdown state (10 → 0)
 * - dashboard window message
 * - supabase broadcast event
 */
export function useCountdown(gameId: string) {
  const [preCountdown, setPreCountdown] = useState<number | null>(null);

  /* -----------------------------------------------------------
     LISTEN FOR DASHBOARD "start_game"
  ----------------------------------------------------------- */
  useEffect(() => {
    const handler = (e: any) => {
      if (e.data?.type === "start_game") {
        setPreCountdown(10);
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  /* -----------------------------------------------------------
     LISTEN FOR SUPABASE start_countdown BROADCAST
  ----------------------------------------------------------- */
  useEffect(() => {
    const channel = supabase
      .channel(`basketball-${gameId}`)
      .on("broadcast", { event: "start_countdown" }, () => {
        setPreCountdown(10);
      })
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, [gameId]);

  /* -----------------------------------------------------------
     COUNTDOWN LOGIC + START GAME WHEN DONE
  ----------------------------------------------------------- */
  useEffect(() => {
    if (preCountdown === null) return;

    if (preCountdown <= 0) {
      setPreCountdown(null);

      // ⭐ ASYNC DB UPDATE ENSURES GAME ACTUALLY STARTS
      (async () => {
        const { error } = await supabase
          .from("bb_games")
          .update({
            game_running: true,
            game_timer_start: new Date().toISOString(),
          })
          .eq("id", gameId);

        if (error) {
          console.error("❌ Game start failed:", error);
        } else {
          console.log("✅ Game started successfully (timer now running)");
        }
      })();

      return;
    }

    const t = setTimeout(() => {
      setPreCountdown((n) => (n !== null ? n - 1 : null));
    }, 1000);

    return () => clearTimeout(t);
  }, [preCountdown, gameId]);

  return preCountdown;
}
