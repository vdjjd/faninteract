"use client";

import { useState, useRef, useEffect, use } from "react";
import { supabase } from "@/lib/supabaseClient";

/* Lane Colors (must match wall) */
const CELL_COLORS = [
  "#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#5AC8FA",
  "#007AFF", "#5856D6", "#AF52DE", "#FF2D55",
];

interface DBPlayer {
  id: string;
  lane_index: number;
  score: number;
  display_name: string | null;
  selfie_url: string | null;
  disconnected_at: string | null;
}

interface DBGame {
  duration_seconds: number;
  game_timer_start: string | null;
}

export default function ShooterPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = use(params);

  const [playerId, setPlayerId] = useState<string | null>(null);
  const [laneIndex, setLaneIndex] = useState<number | null>(null);
  const [laneColor, setLaneColor] = useState<string>("#222");

  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [timerStartedAt, setTimerStartedAt] = useState<string | null>(null);

  const [preCountdown, setPreCountdown] = useState<number | null>(null);

  const startY = useRef(0);

  /* Load local player id */
  useEffect(() => {
    const stored = localStorage.getItem("bb_player_id");
    if (stored) setPlayerId(stored);
  }, []);

  /* LISTEN FOR COUNTDOWN EVENTS */
  useEffect(() => {
    const channel = supabase
      .channel(`basketball-${gameId}`)

      .on("broadcast", { event: "start_countdown" }, () => {
        console.log("📱 Phone received start_countdown");
        setPreCountdown(10);
      })

      .on("broadcast", { event: "start_game" }, () => {
        console.log("📱 Phone received start_game");
        setPreCountdown(10);
      })

      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  /* Countdown ticker */
  useEffect(() => {
    if (preCountdown === null) return;
    if (preCountdown <= 0) {
      setPreCountdown(null);
      return;
    }
    const t = setTimeout(() => setPreCountdown(preCountdown - 1), 1000);
    return () => clearTimeout(t);
  }, [preCountdown]);

  /* Load player info */
  useEffect(() => {
    if (!playerId) return;

    async function loadPlayer() {
      const { data } = await supabase
        .from("bb_game_players")
        .select("*")
        .eq("id", playerId)
        .single();

      if (data) {
        const p = data as DBPlayer;
        setLaneIndex(p.lane_index);
        setLaneColor(CELL_COLORS[p.lane_index] ?? "#444");
        setScore(p.score ?? 0);
      }
    }

    loadPlayer();
    const interval = setInterval(loadPlayer, 2000);
    return () => clearInterval(interval);
  }, [playerId]);

  /* Listen for realtime score updates */
  useEffect(() => {
    if (!playerId) return;

    const channel = supabase
      .channel(`score-${playerId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "bb_game_players", filter: `id=eq.${playerId}` },
        (payload) => {
          setScore(payload.new.score);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [playerId]);

  /* Load game timer */
  useEffect(() => {
    async function loadGame() {
      const { data } = await supabase
        .from("bb_games")
        .select("*")
        .eq("id", gameId)
        .single();

      if (!data) return;

      const g = data as DBGame;

      setDuration(g.duration_seconds);
      setTimerStartedAt(g.game_timer_start);

      if (!g.game_timer_start) {
        setTimeLeft(g.duration_seconds);
        return;
      }

      const start = new Date(g.game_timer_start).getTime();
      const now = Date.now();
      const elapsed = Math.floor((now - start) / 1000);
      const remaining = g.duration_seconds - elapsed;

      setTimeLeft(Math.max(remaining, 0));
    }

    loadGame();
    const interval = setInterval(loadGame, 1500);
    return () => clearInterval(interval);
  }, [gameId]);

  /* Timer local tick */
  useEffect(() => {
    if (timerStartedAt == null || timeLeft == null) return;
    if (timeLeft <= 0) return;
    const t = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, timerStartedAt]);

  /* Shooting mechanics */
  async function sendShot(power: number) {
    if (!playerId) return;

    const made = Math.random() < (0.45 + power * 0.35);

    if (made) {
      await supabase.rpc("increment_player_score", { p_player_id: playerId });
      await supabase.channel(`basketball-${gameId}`).send({
        type: "broadcast",
        event: "update_score",
        payload: { player_id: playerId },
      });
    }
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

  /* ============================
     MOBILE-RESPONSIVE UI
  ============================ */
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "black",
        border: `min(5px, 1vw) solid ${laneColor}`,   // scaled border
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        padding: "min(20px, 4vw)",                   // scaled padding
        color: "white",
        userSelect: "none",
        touchAction: "none",
        position: "fixed",                            // lock to screen
        top: 0,
        left: 0,
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* COUNTDOWN OVERLAY */}
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
            fontSize: "clamp(4rem, 20vw, 12rem)",   // responsive countdown
            fontWeight: 900,
            textShadow: "0 0 60px rgba(255,0,0,0.9)",
            zIndex: 9999,
          }}
        >
          {preCountdown > 0 ? preCountdown : "START!"}
        </div>
      )}

      {/* HEADER AREA */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "clamp(1.6rem, 7vw, 3rem)", // scales per phone size
          fontWeight: 900,
          marginBottom: "min(20px, 4vw)",
        }}
      >
        <div>P{(laneIndex ?? 0) + 1}</div>
        <div>{score}</div>
        <div>{timeLeft ?? "--"}</div>
      </div>

      {/* MAIN SWIPE AREA */}
      <div
        style={{
          flexGrow: 1,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          fontSize: "clamp(1.8rem, 8vw, 3rem)",
          opacity: 0.85,
          padding: "0 4vw",
          textAlign: "center",
        }}
      >
        SWIPE UP TO SHOOT
      </div>
    </div>
  );
}
