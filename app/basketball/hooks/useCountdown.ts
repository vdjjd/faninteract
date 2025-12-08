"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

export function useCountdown(gameId: string) {
  const [countdown, setCountdown] = useState<number | null>(null);

  // Dashboard (postMessage)
  useEffect(() => {
    function handleMsg(e: MessageEvent) {
      if (e.data?.type === "start_countdown") setCountdown(10);
    }
    window.addEventListener("message", handleMsg);
    return () => window.removeEventListener("message", handleMsg);
  }, []);

  // Supabase broadcast (Shooter & Wall BOTH listen here)
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

  // Tick + auto-start game
  useEffect(() => {
    if (countdown === null) return;

    if (countdown <= 0) {
      setCountdown(null);

      const startTime = new Date().toISOString();

      supabase
        .from("bb_games")
        .update({
          game_running: true,
          game_timer_start: startTime,
        })
        .eq("id", gameId);

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
