"use client";

import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

/* Lane Colors */
const CELL_COLORS = [
  "#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#5AC8FA",
  "#007AFF", "#5856D6", "#AF52DE", "#FF2D55",
];

export default function ShooterPage({
  params,
}: {
  params: { gameId: string };
}) {
  const { gameId } = params;

  const [playerId, setPlayerId] = useState<string | null>(null);
  const [laneIndex, setLaneIndex] = useState<number | null>(null);
  const [laneColor, setLaneColor] = useState<string>("#222");
  const [score, setScore] = useState(0);

  const [duration, setDuration] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [gameRunning, setGameRunning] = useState(false);
  const [timerStartedAt, setTimerStartedAt] = useState<string | null>(null);

  const [preCountdown, setPreCountdown] = useState<number | null>(null);

  const startY = useRef(0);

  /* -----------------------------------------------------------
     LOAD PLAYER ID FROM LOCAL STORAGE
  ----------------------------------------------------------- */
  useEffect(() => {
    const stored = localStorage.getItem("bb_player_id");
    if (stored) setPlayerId(stored);
  }, []);

  /* -----------------------------------------------------------
     LISTEN FOR START_COUNTDOWN BROADCAST FROM DASHBOARD
     (This is the ONLY trigger for countdown)
  ----------------------------------------------------------- */
  useEffect(() => {
    const channel = supabase
      .channel(`basketball-${gameId}`)
      .on("broadcast", { event: "start_countdown" }, () => {
        console.log("📱 Shooter received start_countdown");
        setPreCountdown(10);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [gameId]);

  /* -----------------------------------------------------------
     COUNTDOWN TICKER
  ----------------------------------------------------------- */
  useEffect(() => {
    if (preCountdown === null) return;

    if (preCountdown <= 0) {
      setPreCountdown(null);
      return;
    }

    const t = setTimeout(() => setPreCountdown((n) => (n !== null ? n - 1 : null)), 1000);
    return () => clearTimeout(t);
  }, [preCountdown]);

  /* -----------------------------------------------------------
     LOAD PLAYER DATA
  ----------------------------------------------------------- */
  useEffect(() => {
    if (!playerId) return;

    async function loadPlayer() {
      const { data } = await supabase
        .from("bb_game_players")
        .select("*")
        .eq("id", playerId)
        .single();

      if (!data) return;

      setLaneIndex(data.lane_index);
      setLaneColor(CELL_COLORS[data.lane_index] || "#444");
      setScore(data.score ?? 0);
    }

    loadPlayer();
    const interval = setInterval(loadPlayer, 2000);
    return () => clearInterval(interval);
  }, [playerId]);

  /* -----------------------------------------------------------
     SCORE REALTIME LISTENER
  ----------------------------------------------------------- */
  useEffect(() => {
    if (!playerId) return;

    const channel = supabase
      .channel(`score-${playerId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "bb_game_players",
          filter: `id=eq.${playerId}`,
        },
        (payload) => {
          setScore(payload.new.score);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [playerId]);

  /* -----------------------------------------------------------
     LOAD GAME STATE (game_running, timer start, duration)
  ----------------------------------------------------------- */
  useEffect(() => {
    async function loadGame() {
      const { data } = await supabase
        .from("bb_games")
        .select("*")
        .eq("id", gameId)
        .single();

      if (!data) return;

      setDuration(data.duration_seconds);
      setGameRunning(data.game_running);
      setTimerStartedAt(data.game_timer_start);

      if (data.game_running && data.game_timer_start) {
        const start = new Date(data.game_timer_start).getTime();
        const now = Date.now();
        const diff = Math.floor((now - start) / 1000);
        const remaining = data.duration_seconds - diff;
        setTimeLeft(Math.max(remaining, 0));
      }
    }

    loadGame();
    const i = setInterval(loadGame, 1200);
    return () => clearInterval(i);
  }, [gameId]);

  /* -----------------------------------------------------------
     LOCAL TICK DOWN TIMER ON PHONE
  ----------------------------------------------------------- */
  useEffect(() => {
    if (!gameRunning) return;
    if (timeLeft === null) return;
    if (timeLeft <= 0) return;

    const t = setTimeout(() => setTimeLeft((t) => (t !== null ? t - 1 : null)), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, gameRunning]);

  /* -----------------------------------------------------------
     SHOOTING INPUT
  ----------------------------------------------------------- */
  async function sendShot(power: number) {
    if (!playerId) return;

    const made = Math.random() < (0.45 + power * 0.35);

    if (!made) return;

    await supabase.rpc("increment_player_score", { p_player_id: playerId });

    await supabase.channel(`basketball-${gameId}`).send({
      type: "broadcast",
      event: "shot_fired",
      payload: { player_id: playerId },
    });
  }

  function handleTouchStart(e: any) {
    startY.current = e.touches[0].clientY;
  }

  function handleTouchEnd(e: any) {
    const endY = e.changedTouches[0].clientY;
    const distance = startY.current - endY;
    if (distance < 30) return;

    let power = Math.min(1, Math.max(0, distance / 500));
    sendShot(power);
  }

  /* -----------------------------------------------------------
     RENDER
  ----------------------------------------------------------- */
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "black",
        border: `min(5px, 1vw) solid ${laneColor}`,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        padding: "min(20px,4vw)",
        color: "white",
        userSelect: "none",
        touchAction: "none",
        position: "fixed",
        top: 0,
        left: 0,
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* FULLSCREEN COUNTDOWN */}
      {preCountdown !== null && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.88)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            color: "white",
            fontSize: "clamp(5rem, 18vw, 12rem)",
            fontWeight: 900,
            zIndex: 9999,
            textShadow: "0 0 40px rgba(255,0,0,0.7)",
          }}
        >
          {preCountdown > 0 ? preCountdown : "START!"}
        </div>
      )}

      {/* HEADER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "clamp(1.6rem, 7vw, 3rem)",
          fontWeight: 900,
          marginBottom: "min(20px,4vw)",
        }}
      >
        <div>P{(laneIndex ?? 0) + 1}</div>
        <div>{score}</div>
        <div>{timeLeft ?? "--"}</div>
      </div>

      {/* MAIN PROMPT */}
      <div
        style={{
          flexGrow: 1,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          fontSize: "clamp(2rem, 8vw, 4rem)",
          opacity: 0.75,
          textAlign: "center",
        }}
      >
        SWIPE UP TO SHOOT
      </div>
    </div>
  );
}
