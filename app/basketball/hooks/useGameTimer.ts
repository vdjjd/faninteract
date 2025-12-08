"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

export function useGameTimer(gameId: string) {
  const [duration, setDuration] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [gameRunning, setGameRunning] = useState(false);
  const [timerExpired, setTimerExpired] = useState(false);

  /* -----------------------------------------------------------
     DB POLLING
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

      if (data.game_running && data.game_timer_start) {
        const start = new Date(data.game_timer_start).getTime();
        const now = Date.now();
        const elapsed = Math.floor((now - start) / 1000);
        const remaining = Math.max(data.duration_seconds - elapsed, 0);

        setGameRunning(true);
        setTimeLeft(remaining);
        if (remaining <= 0) setTimerExpired(true);
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
