"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import { usePlayers } from "@/app/basketball/hooks/usePlayers";
import { useCountdown } from "@/app/basketball/hooks/useCountdown";
import { useGameTimer } from "@/app/basketball/hooks/useGameTimer";
import { usePhysicsEngine } from "@/app/basketball/hooks/usePhysicsEngine";

import PlayerCard from "./PlayerCard";
import { Countdown } from "../Countdown";

const CELL_COLORS = [
  "#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#5AC8FA",
  "#007AFF", "#5856D6", "#AF52DE", "#FF2D55", "#A2845E",
];

export default function ActiveBasketballPage({
  gameId,
}: {
  gameId: string;
}) {
  /* COUNTDOWN + GAME TIMER */
  const countdownValue = useCountdown(gameId);
  const { duration, timeLeft, timerExpired, gameRunning } = useGameTimer(gameId);

  /* BALL PHYSICS */
  const { balls, spawnBall } = usePhysicsEngine(gameRunning);

  /* PLAYERS */
  const players = usePlayers(gameId);
  const maxScore =
    players.length > 0 ? Math.max(...players.map((p) => p.score ?? 0)) : 0;

  /* LISTEN FOR SHOTS */
  useEffect(() => {
    const channel = supabase
      .channel(`basketball-${gameId}`)
      .on("broadcast", { event: "shot_fired" }, (payload) => {
        const { lane_index, power, streak } = payload.payload;
        spawnBall(lane_index, power, {
          rainbow: power > 0.82,
          fire: streak >= 2,
        });
      })
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, [gameId, spawnBall]);

  /* RENDER */
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
      {/* COUNTDOWN OVERLAY */}
      <Countdown preCountdown={countdownValue} />

      {/* PLAYER GRID */}
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

          return (
            <PlayerCard
              key={i}
              index={i}
              player={player}
              balls={balls[i] || []}
              timeLeft={timeLeft ?? duration}
              score={player?.score ?? 0}
              borderColor={CELL_COLORS[i]}
              timerExpired={timerExpired}
              maxScore={maxScore}
            />
          );
        })}
      </div>
    </div>
  );
}
