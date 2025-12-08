"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

/**
 * FINAL LOCKED VERSION
 * ---------------------
 * useCountdown ALWAYS returns a NUMBER or NULL.
 * No objects. No .value. No .done. No .startCountdownNow.
 */
export function useCountdown(gameId: string) {
  const [countdown, setCountdown] = useState<number | null>(null);

  /* Dashboard → postMessage trigger */
  useEffect(() => {
    function handleMsg(e: MessageEvent) {
      if (e.data?.type === "start_countdown") setCountdown(10);
    }
    window.addEventListener("message", handleMsg);
    return () => window.removeEventListener("message", handleMsg);
  }, []);

  /* Supabase broadcast trigger */
  useEffect(() => {
    const channel = supabase
      .channel(`basketball-${gameId}`)
      .on("broadcast", { event: "start_countdown" }, () => {
        setCountdown(10);
      })
      .subscribe();

    return () => {
      try { supabase.removeChannel(channel); } catch {}
    };
  }, [gameId]);

  /* Tick + start game */
  useEffect(() => {
    if (countdown === null) return;

    if (countdown <= 0) {
      setCountdown(null);

      const startTime = new Date().toISOString();

      // Write game start to DB
      supabase
        .from("bb_games")
        .update({
          game_running: true,
          game_timer_start: startTime,
        })
        .eq("id", gameId);

      // Broadcast start
      supabase.channel(`basketball-${gameId}`).send({
        type: "broadcast",
        event: "start_game",
        payload: { startTime },
      });

      return;
    }

    const timer = setTimeout(() => {
      setCountdown((c) => (c !== null ? c - 1 : null));
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown, gameId]);

  return countdown;
}
