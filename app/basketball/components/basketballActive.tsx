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
  const ballAnimations = useShots(gameId, players);

  /* Host logo is optional — replace later if needed */
  const hostLogo = "/faninteractlogo.png";

  /* -----------------------------------------------------------
     RENDER UI GRID
  ----------------------------------------------------------- */
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
      <Countdown preCountdown={preCountdown} />

      {/* 10-CELL GRID */}
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
        {Array.from({ length: 10 }).map((_, i) => (
          <PlayerCard
            key={i}
            index={i}
            player={players.find((p) => p.cell === i)}
            ball={ballAnimations[i]}
            timeLeft={timeLeft}
            score={players.find((p) => p.cell === i)?.score ?? 0}
            borderColor={CELL_COLORS[i]}
            timerExpired={timerExpired}
            hostLogo={hostLogo}
          />
        ))}
      </div>

      {/* FULLSCREEN BUTTON */}
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
