"use client";

import React, { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

import { usePlayers } from "@/app/basketball/hooks/usePlayers";
import { useCountdown } from "@/app/basketball/hooks/useCountdown";
import { useGameTimer } from "@/app/basketball/hooks/useGameTimer";
import { usePhysicsEngine } from "@/app/basketball/hooks/usePhysicsEngine";

import PlayerCard from "@/app/basketball/components/Active/PlayerCard";
import { Countdown } from "@/app/basketball/components/Countdown";

const CELL_COLORS = [
  "#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#5AC8FA",
  "#007AFF", "#5856D6", "#AF52DE", "#FF2D55", "#A2845E",
];

// ⭐ MUST ACCEPT countdownTrigger to satisfy the page component
export default function ActiveBasketballPage({
  gameId,
  countdownTrigger,      // ✅ Option A fix – prop accepted
}: {
  gameId: string;
  countdownTrigger?: boolean;  // ✅ needs to be declared
}) {
  /* -------------------------------------------------------------
     1. Pre-game 10-second overlay
  ------------------------------------------------------------- */
  const preCountdown = useCountdown(gameId);

  /* -------------------------------------------------------------
     2. Load players
  ------------------------------------------------------------- */
  const players = usePlayers(gameId);

  /* -------------------------------------------------------------
     3. Central game timer (controlled by admin starting the game)
  ------------------------------------------------------------- */
  const {
    duration,
    timeLeft,
    timerExpired,
    gameRunning,
    startCountdownNow, // <-- OPTION A requires this
  } = useGameTimer(gameId, preCountdown);

  /* -------------------------------------------------------------
     4. Physics engine (runs only when gameRunning = true)
  ------------------------------------------------------------- */
  const { balls, spawnBall } = usePhysicsEngine(gameRunning);
  const hostLogo = "/faninteractlogo.png";

  /* -------------------------------------------------------------
     5. SHOT LISTENER — adds balls to the wall
  ------------------------------------------------------------- */
  useEffect(() => {
    const channel = supabase
      .channel(`basketball-${gameId}`)
      .on("broadcast", { event: "shot_fired" }, (payload) => {
        const { lane_index, power, streak } = payload.payload;

        // Power-based effects
        const rainbow = power > 0.82;
        const fire = streak >= 2;

        spawnBall(lane_index, power, { rainbow, fire });
      })
      .on("broadcast", { event: "start_countdown" }, () => {
        // Backup trigger: Start 10-second overlay
        startCountdownNow();
      })
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, [gameId, spawnBall, startCountdownNow]);

  /* -------------------------------------------------------------
     6. Dashboard → Wall communication via window.postMessage
  ------------------------------------------------------------- */
  useEffect(() => {
    function handleMsg(event: MessageEvent) {
      if (!event.data) return;

      if (event.data.type === "start_game") {
        startCountdownNow(); // admin pressed "Start Game"
      }
    }

    window.addEventListener("message", handleMsg);
    return () => window.removeEventListener("message", handleMsg);
  }, [startCountdownNow]);

  /* -------------------------------------------------------------
     7. Winner highlight
  ------------------------------------------------------------- */
  const maxScore = players.length
    ? Math.max(...players.map((p) => p.score), 0)
    : 0;

  /* -------------------------------------------------------------
     8. RENDER WALL
  ------------------------------------------------------------- */
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#050A18",
        padding: 20,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* ⏱️ 10-second overlay countdown */}
      <Countdown preCountdown={preCountdown} />

      {/* 10-player matrix */}
      <div
        style={{
          width: "94vw",
          height: "90vh",
          display: "grid",
          gap: "1.5vh",
          gridTemplateColumns: "repeat(5, 1fr)",
          gridTemplateRows: "repeat(2, 1fr)",
        }}
      >
        {Array.from({ length: 10 }).map((_, i) => {
          const player = players.find((p) => p.cell === i);
          const score = player?.score ?? 0;
          const laneBalls = balls[i] || [];

          return (
            <PlayerCard
              key={i}
              index={i}
              player={player}
              balls={laneBalls}
              timeLeft={timeLeft ?? duration}
              score={score}
              borderColor={CELL_COLORS[i]}
              timerExpired={timerExpired}
              hostLogo={hostLogo}
              maxScore={maxScore}
            />
          );
        })}
      </div>

      {/* Fullscreen toggle */}
      <div
        onClick={() => {
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
          } else {
            document.exitFullscreen();
          }
        }}
        style={{
          position: "absolute",
          bottom: "2vh",
          right: "2vw",
          width: 42,
          height: 42,
          borderRadius: 12,
          background: "rgba(255,255,255,0.1)",
          border: "1px solid rgba(255,255,255,0.25)",
          cursor: "pointer",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          fontSize: "1.4rem",
          color: "#fff",
          zIndex: 50,
        }}
      >
        ⛶
      </div>
    </div>
  );
}
