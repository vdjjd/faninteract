"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

interface GameRow {
  duration_seconds: number;
  game_running: boolean;
  game_timer_start: string | null;
}

export function useGameTimer(gameId: string, preCountdown: number | null) {
  const [duration, setDuration] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [timerStartedAt, setTimerStartedAt] = useState<string | null>(null);
  const [timerExpired, setTimerExpired] = useState(false);
  const [gameRunning, setGameRunning] = useState(false);

  /* -----------------------------------------------------------
     LOAD GAME STATUS
  ----------------------------------------------------------- */
  useEffect(() => {
    async function loadGame() {
      const { data } = await supabase
        .from("bb_games")
        .select("*")
        .eq("id", gameId)
        .single();

      const row = data as GameRow | null;
      if (!row) return;

      setDuration(row.duration_seconds);
      setGameRunning(row.game_running);
      setTimerStartedAt(row.game_timer_start);

      // Countdown is running → timer frozen
      if (preCountdown !== null) {
        setTimeLeft(row.duration_seconds);
        return;
      }

      // Game hasn't started yet
      if (!row.game_running || !row.game_timer_start) {
        setTimeLeft(row.duration_seconds);
        return;
      }

      // Compute remaining time
      const start = new Date(row.game_timer_start).getTime();
      const elapsed = Math.floor((Date.now() - start) / 1000);
      const remaining = Math.max(row.duration_seconds - elapsed, 0);

      setTimeLeft(remaining);
    }

    loadGame();
    const interval = setInterval(loadGame, 1500);
    return () => clearInterval(interval);
  }, [gameId, preCountdown]);

  /* -----------------------------------------------------------
     LOCAL TIMER TICK
  ----------------------------------------------------------- */
  useEffect(() => {
    if (!gameRunning) return;
    if (preCountdown !== null) return;
    if (timerStartedAt === null) return;
    if (timeLeft === null || timeLeft <= 0) {
      setTimerExpired(true);
      return;
    }

    const t = setTimeout(() => {
      setTimeLeft((old) => {
        if (old === null) return null;
        if (old <= 1) {
          setTimerExpired(true);
          return 0;
        }
        return old - 1;
      });
    }, 1000);

    return () => clearTimeout(t);
  }, [timeLeft, gameRunning, preCountdown, timerStartedAt]);

  return {
    duration,
    timeLeft,
    timerExpired,
    gameRunning,
    timerStartedAt
  };
}
