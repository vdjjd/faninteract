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

  /* ---------------- COUNTDOWN ---------------- */
  const countdownValue = useCountdown(gameId);
  const [localCountdown, setLocalCountdown] = useState<number | null>(null);
  const displayCountdown = localCountdown ?? countdownValue;

  /* ---------------- PLAYER STATE ---------------- */
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [laneIndex, setLaneIndex] = useState<number | null>(null);
  const [laneColor, setLaneColor] = useState("#222");
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const streakRef = useRef(0);
  const swipeRef = useRef({ x: 0, y: 0, time: 0 });

  /* ---------------- LOAD PLAYER FROM LOCAL STORAGE ---------------- */
  useEffect(() => {
    const stored = localStorage.getItem("bb_player_id");
    if (stored) setPlayerId(stored);
  }, []);

  /* ---------------- LOAD PLAYER DETAILS ---------------- */
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
      setLaneColor(CELL_COLORS[data.lane_index]); // RESTORED BORDER COLOR
      setScore(data.score ?? 0);
    }

    loadPlayer();
    const interval = setInterval(loadPlayer, 1000);
    return () => clearInterval(interval);
  }, [playerId]);

  /* ---------------- GAME TIMER SYNC ---------------- */
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

  /* ---------------- SUBSCRIPTIONS ---------------- */
  useEffect(() => {
    if (!gameId) return;

    const channel = supabase
      .channel(`basketball-${gameId}`)
      .on("broadcast", { event: "start_countdown" }, () => {
        setLocalCountdown(10);
      })
      .on("broadcast", { event: "start_game" }, () => {
        syncGameStart();
      })
      .on("broadcast", { event: "reset_game" }, () => {
        setLocalCountdown(null);
        setTimeLeft(null);
        streakRef.current = 0;
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  /* ---------------- COUNTDOWN TICK ---------------- */
  useEffect(() => {
    if (localCountdown === null) return;

    if (localCountdown <= 0) {
      setLocalCountdown(null);
      syncGameStart();
      return;
    }

    const timer = setTimeout(() => {
      setLocalCountdown((c) => (c !== null ? c - 1 : null));
    }, 1000);

    return () => clearTimeout(timer);
  }, [localCountdown]);

  /* ---------------- 1-SECOND HEARTBEAT ---------------- */
  useEffect(() => {
    if (!gameId) return;

    async function tick() {
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

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [gameId]);

  /* ---------------- SEND SHOT ---------------- */
  async function handleShot({ vx, vy, power }) {
    if (!playerId || laneIndex === null) return;
    if (displayCountdown !== null) return; // block during countdown

    supabase.channel(`basketball-${gameId}`).send({
      type: "broadcast",
      event: "shot_fired",
      payload: {
        lane_index: laneIndex,
        vx,
        vy,
        power,
        streak: streakRef.current,
      },
    });
  }

  /* ---------------- UI ---------------- */
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "black",
        border: `8px solid ${laneColor}`, // RESTORED BORDER COLOR
        position: "relative",
        overflow: "hidden",
        touchAction: "none",
      }}
      onTouchStart={(e) => {
        const t = e.touches[0];
        swipeRef.current = {
          x: t.clientX,
          y: t.clientY,
          time: Date.now(),
        };
      }}
      onTouchEnd={(e) => {
        const t = e.changedTouches[0];

        const dx = t.clientX - swipeRef.current.x;
        const dy = swipeRef.current.y - t.clientY;
        const dt = Date.now() - swipeRef.current.time;

        if (dy < 10) return;

        const speed = dy / dt;

        // Pop-A-Shot tuned physics input
        const vy = -Math.min(8, speed * 10);
        const vx = dx * 0.018;
        const power = Math.min(1, speed * 1.25);

        handleShot({ vx, vy, power });
      }}
    >
      {/* COUNTDOWN OVERLAY */}
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
            textShadow: "0 0 40px red",
            zIndex: 1000,
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
