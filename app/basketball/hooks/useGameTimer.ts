"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export function useGameTimer(gameId: string) {
  const [duration, setDuration] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [gameRunning, setGameRunning] = useState(false);
  const [timerExpired, setTimerExpired] = useState(false);

  /* -----------------------------------------------------------
     REAL-TIME LISTENER — start_game broadcast
  ----------------------------------------------------------- */
  useEffect(() => {
    const channel = supabase
      .channel(`basketball-${gameId}`)
      .on("broadcast", { event: "start_game" }, (payload) => {
        const startTime = payload?.payload?.startTime;
        if (!startTime) return;

        const start = new Date(startTime).getTime();
        const now = Date.now();
        const elapsed = Math.floor((now - start) / 1000);

        setGameRunning(true);
        setTimerExpired(false);

        setTimeLeft((prev) => {
          // If duration not loaded yet, fallback to 90 seconds
          const fallback = duration || 90;
          const r = Math.max(fallback - elapsed, 0);
          return r;
        });
      })
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, [gameId, duration]);

  /* -----------------------------------------------------------
     DB POLLING — fallback + initial load
  ----------------------------------------------------------- */
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("bb_games")
        .select("*")
        .eq("id", gameId)
        .single();

      if (!data) return;

      setDuration(data.duration_seconds);

      // Game is running from DB perspective
      if (data.game_running && data.game_timer_start) {
        const start = new Date(data.game_timer_start).getTime();
        const now = Date.now();
        const elapsed = Math.floor((now - start) / 1000);
        const remaining = Math.max(data.duration_seconds - elapsed, 0);

        setGameRunning(true);
        setTimeLeft(remaining);
        setTimerExpired(remaining <= 0);
      } else {
        // Game not running
        setGameRunning(false);
      }
    }

    load();
    const int = setInterval(load, 1000);
    return () => clearInterval(int);
  }, [gameId]);

  return {
    duration,
    timeLeft,
    gameRunning,
    timerExpired,
  };
}
