"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export function useGameTimer(gameId: string) {
  const [duration, setDuration] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [gameRunning, setGameRunning] = useState(false);
  const [timerExpired, setTimerExpired] = useState(false);

  /* -----------------------------------------------------------
     REAL-TIME START — instant response to start_game event
  ----------------------------------------------------------- */
  useEffect(() => {
    if (!gameId) return;

    const channel = supabase
      .channel(`basketball-${gameId}`)
      .on("broadcast", { event: "start_game" }, (payload) => {
        const startTime = payload?.payload?.startTime;
        if (!startTime) return;

        const startMs = new Date(startTime).getTime();
        const elapsed = Math.floor((Date.now() - startMs) / 1000);

        setGameRunning(true);
        setTimerExpired(false);

        setTimeLeft((prev) =>
          Math.max((duration || 90) - elapsed, 0)
        );
      })
      .subscribe();

    return () => {
      try { supabase.removeChannel(channel); } catch {}
    };
  }, [gameId, duration]);

  /* -----------------------------------------------------------
     DB POLLING — keeps timer aligned even if event missed
  ----------------------------------------------------------- */
  useEffect(() => {
    if (!gameId) return;

    async function load() {
      const { data } = await supabase
        .from("bb_games")
        .select("*")
        .eq("id", gameId)
        .single();

      if (!data) return;

      setDuration(data.duration_seconds);

      if (data.game_running && data.game_timer_start) {
        const startMs = new Date(data.game_timer_start).getTime();
        const elapsed = Math.floor((Date.now() - startMs) / 1000);

        const remaining = Math.max(data.duration_seconds - elapsed, 0);

        setGameRunning(true);
        setTimeLeft(remaining);
        setTimerExpired(remaining <= 0);
      } else {
        setGameRunning(false);
      }
    }

    load();
    const id = setInterval(load, 1000);
    return () => clearInterval(id);
  }, [gameId]);

  return {
    duration,
    timeLeft,
    gameRunning,
    timerExpired,
  };
}
