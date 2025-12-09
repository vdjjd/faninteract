"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useCountdown } from "@/app/basketball/hooks/useCountdown";

const CELL_COLORS = [
  "#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#5AC8FA",
  "#007AFF", "#5856D6", "#AF52DE", "#FF2D55", "#A2845E",
];

export default function ShooterPage() {
  const { gameId } = useParams() as { gameId: string };

  /* ------------------------------------------------------------
     SHARED COUNTDOWN
  ------------------------------------------------------------ */
  const countdownValue = useCountdown(gameId);
  const [localCountdown, setLocalCountdown] = useState<number | null>(null);
  const displayCountdown = localCountdown ?? countdownValue;

  /* ------------------------------------------------------------
     LOCAL PLAYER STATE
  ------------------------------------------------------------ */
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [laneIndex, setLaneIndex] = useState<number | null>(null);
  const [laneColor, setLaneColor] = useState("#222");
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const streakRef = useRef(0);

  /* --- SWIPE VELOCITY TRACKER --- */
  const swipeRef = useRef({ x: 0, y: 0, time: 0 });

  /* ------------------------------------------------------------
     LOAD PLAYER
  ------------------------------------------------------------ */
  useEffect(() => {
    const stored = localStorage.getItem("bb_player_id");
    if (stored) setPlayerId(stored);
  }, []);

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
      setLaneColor(CELL_COLORS[data.lane_index]);
      setScore(data.score ?? 0);
    }

    loadPlayer();
    const t = setInterval(loadPlayer, 1000);
    return () => clearInterval(t);
  }, [playerId]);

  /* ------------------------------------------------------------
     GAME TIMER SYNC
  ------------------------------------------------------------ */
  async function syncGameStart() {
    const { data } = await supabase
      .from("bb_games")
      .select("*")
      .eq("id", gameId)
      .single();

    if (!data?.game_running || !data.game_timer_start) return;

    const startMS = new Date(data.game_timer_start).getTime();
    const elapsed = Math.floor((Date.now() - startMS) / 1000);

    setTimeLeft(Math.max(data.duration_seconds - elapsed, 0));
  }

  /* ------------------------------------------------------------
     SUBSCRIBE TO WALL EVENTS
  ------------------------------------------------------------ */
  useEffect(() => {
    if (!gameId) return;

    const channel = supabase
      .channel(`basketball-${gameId}`)
      .on("broadcast", { event: "start_countdown" }, () => {
        setLocalCountdown(10);
      })
      .on("broadcast", { event: "start_game" }, syncGameStart)
      .on("broadcast", { event: "reset_game" }, () => {
        setTimeLeft(null);
        setLocalCountdown(null);
      })
      .subscribe();

    return () => {
      try { supabase.removeChannel(channel); } catch {}
    };
  }, [gameId]);

  /* ------------------------------------------------------------
     COUNTDOWN TICK
  ------------------------------------------------------------ */
  useEffect(() => {
    if (localCountdown === null) return;

    if (localCountdown <= 0) {
      setLocalCountdown(null);
      syncGameStart();
      return;
    }

    const t = setTimeout(() => {
      setLocalCountdown((c) => (c !== null ? c - 1 : null));
    }, 1000);

    return () => clearTimeout(t);
  }, [localCountdown]);

  /* ------------------------------------------------------------
     TIMER HEARTBEAT
  ------------------------------------------------------------ */
  useEffect(() => {
    if (!gameId) return;

    async function pollTimer() {
      const { data } = await supabase
        .from("bb_games")
        .select("game_running, game_timer_start, duration_seconds")
        .eq("id", gameId)
        .single();

      if (!data?.game_running || !data.game_timer_start) return;

      const startMS = new Date(data.game_timer_start).getTime();
      const elapsed = Math.floor((Date.now() - startMS) / 1000);

      setTimeLeft(Math.max(data.duration_seconds - elapsed, 0));
    }

    pollTimer();
    const id = setInterval(pollTimer, 1000);

    return () => clearInterval(id);
  }, [gameId]);

  /* ------------------------------------------------------------
     SHOOT LOGIC (vx + vy tuned for 3D physics)
  ------------------------------------------------------------ */
  async function handleShot({ vx, vy, power }) {
    if (!playerId || laneIndex === null) return;
    if (displayCountdown !== null) return;

    const streak = streakRef.current;

    supabase.channel(`basketball-${gameId}`).send({
      type: "broadcast",
      event: "shot_fired",
      payload: { lane_index: laneIndex, vx, vy, power, streak },
    });

    const made = Math.random() < (0.45 + power * 0.35);

    if (made) {
      streakRef.current++;
      await supabase.rpc("increment_player_score", { p_player_id: playerId });
    } else {
      streakRef.current = 0;
    }
  }

  /* ------------------------------------------------------------
     RENDER
  ------------------------------------------------------------ */
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "black",
        border: `8px solid ${laneColor}`,
        position: "relative",
        overflow: "hidden",
        touchAction: "none",
      }}

      /* --- SWIPE START --- */
      onTouchStart={(e) => {
        const touch = e.touches[0];
        swipeRef.current = {
          x: touch.clientX,
          y: touch.clientY,
          time: Date.now(),
        };
      }}

      /* --- SWIPE END → compute vx, vy, power --- */
      onTouchEnd={(e) => {
        const touch = e.changedTouches[0];

        const dx = touch.clientX - swipeRef.current.x;
        const dy = swipeRef.current.y - touch.clientY; // upward = positive
        const dt = Date.now() - swipeRef.current.time;

        if (dy < 10) return;

        const speed = dy / dt;

        // Tuned velocities for new 3D physics engine:
        const vy = -Math.min(7, speed * 9);     // upward throw strength
        const vx = dx * 0.015;                 // subtle sideways curve
        const power = Math.min(1, speed * 1.2);

        handleShot({ vx, vy, power });
      }}
    >
      {/* FULLSCREEN COUNTDOWN */}
      {displayCountdown !== null && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.88)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            color: "white",
            fontSize: "clamp(4rem, 10vw, 12rem)",
            fontWeight: 900,
            textShadow: "0 0 60px rgba(255,0,0,0.9)",
            zIndex: 9999,
          }}
        >
          {displayCountdown > 0 ? displayCountdown : "START!"}
        </div>
      )}

      {/* SCORE */}
      <div
        style={{
          position: "absolute",
          top: 20,
          left: 20,
          color: "white",
          fontSize: "2.5rem",
        }}
      >
        {score}
      </div>

      {/* TIMER */}
      <div
        style={{
          position: "absolute",
          top: 20,
          right: 20,
          color: "white",
          fontSize: "2.5rem",
        }}
      >
        {timeLeft ?? "--"}
      </div>

      {/* SHOOT MESSAGE */}
      <div
        style={{
          position: "absolute",
          bottom: "5%",
          width: "100%",
          textAlign: "center",
          color: "#ccc",
          fontSize: "2rem",
          opacity: displayCountdown !== null ? 0 : 1,
        }}
      >
        SWIPE UP TO SHOOT
      </div>
    </div>
  );
}
