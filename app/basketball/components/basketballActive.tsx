"use client";

import React from "react";
import { usePlayers } from "@/app/basketball/hooks/usePlayers";
import { useCountdown } from "@/app/basketball/hooks/useCountdown";
import { useGameTimer } from "@/app/basketball/hooks/useGameTimer";
import { useShots } from "@/app/basketball/hooks/useShots";

import { PlayerCard } from "@/app/basketball/components/PlayerCard";
import { Countdown } from "@/app/basketball/components/Countdown";

/* Lane border colors */
const CELL_COLORS = [
  "#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#5AC8FA",
  "#007AFF", "#5856D6", "#AF52DE", "#FF2D55", "#A2845E",
];

export default function ActiveBasketballPage({
  params,
}: {
  params: { gameId: string };
}) {
  const { gameId } = params;

  /* -----------------------------------------------------------
     HOOKS
  ----------------------------------------------------------- */
  const preCountdown = useCountdown(gameId);
  const players = usePlayers(gameId);
  const { timeLeft, timerExpired } = useGameTimer(gameId, preCountdown);
  const laneBalls = useShots(gameId, players);    // ← MULTI-BALL ARRAY

  const hostLogo = "/faninteractlogo.png";

  /* Winner calculation */
  const maxScore = players.length
    ? Math.max(...players.map((p) => p.score), 0)
    : 0;

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
      <Countdown preCountdown={preCountdown} />

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
          const balls = laneBalls[i];   // ← MULTI-BALL ARRAY

          return (
            <PlayerCard
              key={i}
              index={i}
              player={player}
              balls={balls}              // ← PASS ARRAY INSTEAD OF SINGLE BALL
              timeLeft={timeLeft}
              score={score}
              borderColor={CELL_COLORS[i]}
              timerExpired={timerExpired}
              hostLogo={hostLogo}
              maxScore={maxScore}
            />
          );
        })}
      </div>

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
