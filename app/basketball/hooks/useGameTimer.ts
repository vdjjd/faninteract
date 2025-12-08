"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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

  // NEW — external countdown trigger
  const externalCountdownTriggered = useRef(false);

  /* -----------------------------------------------------------
     FUNCTION: ADMIN TRIGGERS COUNTDOWN NOW
  ----------------------------------------------------------- */
  const startCountdownNow = useCallback(() => {
    externalCountdownTriggered.current = true;
  }, []);

  /* -----------------------------------------------------------
     LISTEN FOR postMessage FROM DASHBOARD
  ----------------------------------------------------------- */
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data?.type === "start_game") {
        startCountdownNow();
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [startCountdownNow]);

  /* -----------------------------------------------------------
     LISTEN FOR REALTIME 'start_countdown'
  ----------------------------------------------------------- */
  useEffect(() => {
    const channel = supabase
      .channel(`timer-${gameId}`)
      .on("broadcast", { event: "start_countdown" }, () => {
        startCountdownNow();
      })
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, [gameId, startCountdownNow]);

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

      // Freeze timer during countdown overlay
      if (preCountdown !== null) {
        if (!row.game_timer_start) {
          setTimeLeft(row.duration_seconds);
        }
        return;
      }

      // If external countdown is triggered → do not override local timer until countdown ends
      if (externalCountdownTriggered.current) return;

      /* ------------------------------
         GAME NOT STARTED YET
      ------------------------------ */
      if (!row.game_running && !row.game_timer_start) {
        setTimerStartedAt(null);
        setTimeLeft(row.duration_seconds);
        return;
      }

      /* ------------------------------
         GAME RUNNING OR FINISHED
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
     LOCAL TICK
  ----------------------------------------------------------- */
  useEffect(() => {
    if (preCountdown !== null) return;
    if (!gameRunning) return;
    if (!timerStartedAt) return;
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

  /* -----------------------------------------------------------
     PUBLIC API RETURN
  ----------------------------------------------------------- */
  return {
    duration,
    timeLeft,
    timerExpired,
    gameRunning,
    timerStartedAt,

    // NEW
    startCountdownNow,
  };
}
