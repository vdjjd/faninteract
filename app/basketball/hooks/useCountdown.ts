"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

/**
 * FINAL SIMPLE VERSION (WORKS ON WALL + PHONE)
 * - Returns number or null
 * - Listens to broadcast "start_countdown"
 */
export function useCountdown(gameId: string) {
  const [countdown, setCountdown] = useState<number | null>(null);

  /* Dashboard → postMessage trigger */
  useEffect(() => {
    function handleMsg(e: MessageEvent) {
      if (e.data?.type === "start_countdown") {
        setCountdown(10);
      }
    }
    window.addEventListener("message", handleMsg);
    return () => window.removeEventListener("message", handleMsg);
  }, []);

  /* Supabase broadcast trigger (THIS IS WHAT PHONE NEEDS) */
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

  /* Tick logic + start game */
  useEffect(() => {
    if (countdown === null) return;

    if (countdown <= 0) {
      setCountdown(null);

      const startTime = new Date().toISOString();

      // Update DB
      supabase
        .from("bb_games")
        .update({
          game_running: true,
          game_timer_start: startTime,
        })
        .eq("id", gameId);

      // Broadcast "start_game"
      supabase.channel(`basketball-${gameId}`).send({
        type: "broadcast",
        event: "start_game",
        payload: { startTime },
      });

      return;
    }

    const t = setTimeout(() => {
      setCountdown((c) => (c !== null ? c - 1 : null));
    }, 1000);

    return () => clearTimeout(t);
  }, [countdown, gameId]);

  return countdown;
}
