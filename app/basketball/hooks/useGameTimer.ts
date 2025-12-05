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
     LOAD GAME STATUS + TIMER SYNC
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

      // Countdown overlay visible → freeze timer
      if (preCountdown !== null) {
        // Don't reset timer unless no start time exists
        if (!row.game_timer_start) {
          setTimeLeft(row.duration_seconds);
        }
        return;
      }

      /* ------------------------------
         GAME NOT STARTED YET
      ------------------------------ */
      if (!row.game_running && !row.game_timer_start) {
        setTimerStartedAt(null);
        setTimeLeft(row.duration_seconds);
        return;
      }

      /* ------------------------------
         GAME RUNNING (or finished but started)
      ------------------------------ */
      setTimerStartedAt(row.game_timer_start);

      if (row.game_timer_start) {
        const start = new Date(row.game_timer_start).getTime();
        const elapsed = Math.floor((Date.now() - start) / 1000);
        const remaining = Math.max(row.duration_seconds - elapsed, 0);

        setTimeLeft(remaining);
      }
    }

    loadGame();
    const interval = setInterval(loadGame, 1500);
    return () => clearInterval(interval);
  }, [gameId, preCountdown]);

  /* -----------------------------------------------------------
     LOCAL TIMER TICK (only runs after countdown ends)
  ----------------------------------------------------------- */
  useEffect(() => {
    if (preCountdown !== null) return;     // freeze until 10-sec overlay ends
    if (!gameRunning) return;              // only tick if admin started game
    if (!timerStartedAt) return;           // must have a timer start
    if (timeLeft === null) return;

    if (timeLeft <= 0) {
      setTimerExpired(true);
      return;
    }

    const t = setTimeout(() => {
      setTimeLeft((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          setTimerExpired(true);
          return 0;
        }
        return prev - 1;
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
