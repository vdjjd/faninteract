"use client";

import { useState, useRef, useEffect, use } from "react";
import { supabase } from "@/lib/supabaseClient";

/* Lane Colors (must match wall) */
const CELL_COLORS = [
  "#FF3B30",
  "#FF9500",
  "#FFCC00",
  "#34C759",
  "#5AC8FA",
  "#007AFF",
  "#5856D6",
  "#AF52DE",
  "#FF2D55",
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

export default function ShooterPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = use(params);

  const [playerId, setPlayerId] = useState<string | null>(null);
  const [laneIndex, setLaneIndex] = useState<number | null>(null);
  const [laneColor, setLaneColor] = useState<string>("#222");

  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [timerStartedAt, setTimerStartedAt] = useState<string | null>(null);

  /* 🔥 NEW — Global pre-start countdown overlay */
  const [preCountdown, setPreCountdown] = useState<number | null>(null);

  const startY = useRef(0);

  /* --------------------------------------------------------------
     LOAD PLAYER ID FROM LOCAL STORAGE
  -------------------------------------------------------------- */
  useEffect(() => {
    const stored = localStorage.getItem("bb_player_id");

    if (stored) {
      setPlayerId(stored);
    } else {
      console.warn("❗ Shooter page opened without a player ID.");
    }
  }, []);

  /* --------------------------------------------------------------
     LISTEN FOR GLOBAL "start_countdown" BROADCAST
     → Fired when host clicks Start Game on dashboard
  -------------------------------------------------------------- */
  useEffect(() => {
    const channel = supabase
      .channel(`basketball-${gameId}`)
      .on(
        "broadcast",
        { event: "start_countdown" },
        () => {
          console.log("📱 Shooter received countdown signal");
          setPreCountdown(10);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  /* --------------------------------------------------------------
     COUNTDOWN TICKER FOR PHONE OVERLAY
  -------------------------------------------------------------- */
  useEffect(() => {
    if (preCountdown === null) return;

    if (preCountdown <= 0) {
      setPreCountdown(null);
      return;
    }

    const t = setTimeout(() => setPreCountdown(preCountdown - 1), 1000);
    return () => clearTimeout(t);
  }, [preCountdown]);

  /* --------------------------------------------------------------
     LOAD PLAYER INFO (lane color, score)
  -------------------------------------------------------------- */
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

  /* --------------------------------------------------------------
     REALTIME SCORE UPDATES
  -------------------------------------------------------------- */
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
      supabase.removeChannel(channel);
    };
  }, [playerId]);

  /* --------------------------------------------------------------
     LOAD GAME TIMER INFO
  -------------------------------------------------------------- */
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

  /* --------------------------------------------------------------
     LOCAL TIMER TICK
  -------------------------------------------------------------- */
  useEffect(() => {
    if (timerStartedAt == null || timeLeft == null) return;

    if (timeLeft <= 0) return;

    const t = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, timerStartedAt]);

  /* --------------------------------------------------------------
     SEND SHOT → RPC + REALTIME BROADCAST
  -------------------------------------------------------------- */
  async function sendShot(power: number) {
    if (!playerId) return;

    const made = Math.random() < (0.45 + power * 0.35);

    if (made) {
      await supabase.rpc("increment_player_score", {
        p_player_id: playerId,
      });

      await supabase.channel(`basketball-${gameId}`).send({
        type: "broadcast",
        event: "update_score",
        payload: { player_id: playerId },
      });
    }
  }

  /* --------------------------------------------------------------
     TOUCH SWIPE INPUT
  -------------------------------------------------------------- */
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

  /* --------------------------------------------------------------
     RENDER
  -------------------------------------------------------------- */
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: laneColor,
        display: "flex",
        flexDirection: "column",
        padding: "20px",
        color: "white",
        userSelect: "none",
        touchAction: "none",
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* 🔥 PRE-START COUNTDOWN OVERLAY */}
      {preCountdown !== null && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.88)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            color: "white",
            fontSize: "clamp(4rem, 14vw, 12rem)",
            fontWeight: 900,
            textShadow: "0 0 60px rgba(255,0,0,0.9)",
          }}
        >
          {preCountdown > 0 ? preCountdown : "START!"}
        </div>
      )}

      {/* HEADER BAR */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "2rem",
          fontWeight: 900,
          marginBottom: "20px",
        }}
      >
        <div>P{(laneIndex ?? 0) + 1}</div>
        <div>{score}</div>
        <div>{timeLeft ?? "--"}</div>
      </div>

      {/* SWIPE MESSAGE */}
      <div
        style={{
          flexGrow: 1,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          fontSize: "2.4rem",
          opacity: 0.8,
        }}
      >
        SWIPE UP TO SHOOT
      </div>
    </div>
  );
}
