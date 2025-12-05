"use client";

import React from "react";
import { Ball } from "./Ball";
import { BallState } from "@/app/basketball/hooks/useShots";
import { Player } from "@/app/basketball/hooks/usePlayers";

const RIM_WIDTH = 14;
const BACKBOARD_SCALE = 1;
const RIM_SCALE = 1;
const SELFIE_SIZE = 42;

export function PlayerCard({
  index,
  player,
  balls,        // ← MULTIPLE BALLS
  timeLeft,
  score,
  borderColor,
  timerExpired,
  hostLogo,
  maxScore,
}: {
  index: number;
  player: Player | undefined;
  balls: BallState[];      // ← FIXED TYPE
  timeLeft: number | null;
  score: number;
  borderColor: string;
  timerExpired: boolean;
  hostLogo: string | null;
  maxScore: number;
}) {
  const isWinner =
    timerExpired &&
    player &&
    player.score === maxScore &&
    maxScore > 0;

  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 20,
        border: `5px solid ${borderColor}`,
        backgroundImage: "url('/BBgamebackground.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        animation: isWinner ? "winnerBlink 0.18s infinite alternate" : "none",
        "--winner-color": borderColor,
      } as any}
    >
      {/* TIMER */}
      <div
        style={{
          position: "absolute",
          top: 6,
          right: 10,
          padding: "4px 8px",
          borderRadius: 6,
          background: "rgba(0,0,0,0.55)",
          color: "white",
          fontSize: "1rem",
          fontFamily: "Digital, monospace",
          fontWeight: 700,
        }}
      >
        {timeLeft !== null
          ? `${Math.floor(timeLeft / 60)}:${(timeLeft % 60)
              .toString()
              .padStart(2, "0")}`
          : "--:--"}
      </div>

      {/* LABEL */}
      <div
        style={{
          position: "absolute",
          top: 6,
          left: 10,
          padding: "4px 10px",
          borderRadius: 8,
          background: borderColor,
          color: "white",
          fontWeight: 800,
          fontSize: "1rem",
        }}
      >
        P{index + 1}
      </div>

      {/* BACKBOARD */}
      <div
        style={{
          position: "absolute",
          top: "4%",
          left: "50%",
          transform: "translateX(-50%)",
          width: `${35 * BACKBOARD_SCALE}%`,
          height: `${7 * BACKBOARD_SCALE}vh`,
          background: "rgba(255,255,255,0.08)",
          border: "2px solid rgba(255,0,0,0.45)",
          borderRadius: 6,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          backdropFilter: "blur(4px)",
        }}
      >
        {hostLogo && (
          <img
            src={hostLogo}
            style={{
              maxWidth: "72%",
              maxHeight: "72%",
              objectFit: "contain",
              opacity: 0.3,
            }}
          />
        )}
      </div>

      {/* RIM */}
      <div
        style={{
          position: "absolute",
          top: `calc(4% + ${7 * BACKBOARD_SCALE}vh - 0.3vh)`,
          left: "50%",
          transform: "translateX(-50%)",
          width: `${RIM_WIDTH * RIM_SCALE}%`,
          height: "4px",
          background: "#ff5a00",
          borderRadius: 4,
        }}
      />

      {/* NET */}
      <div
        style={{
          position: "absolute",
          top: `calc(4% + ${7 * BACKBOARD_SCALE}vh + 0.4vh)`,
          left: "50%",
          transform: "translateX(-50%)",
          width: `${RIM_WIDTH * 0.8 * RIM_SCALE}%`,
          height: "3vh",
          background:
            "repeating-linear-gradient(135deg, white 0, white 2px, transparent 3px 6px)",
          opacity: 0.5,
          borderRadius: "0 0 10px 10px",
        }}
      />

      {/* MULTI-BALL RENDER */}
      {balls.map((b) =>
        b.active ? <Ball key={b.id} ball={b} /> : null
      )}

      {/* SELFIE */}
      <div
        style={{
          position: "absolute",
          bottom: "8%",
          left: "2%",
          width: SELFIE_SIZE,
          height: SELFIE_SIZE,
          borderRadius: "50%",
          border: `3px solid ${borderColor}`,
          overflow: "hidden",
        }}
      >
        {player?.selfie_url ? (
          <img src={player.selfie_url} style={{ width: "100%", height: "100%" }} />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              background: "#444",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              color: "#bbb",
            }}
          >
            ?
          </div>
        )}
      </div>

      {/* SCORE */}
      <div
        style={{
          position: "absolute",
          bottom: "-1%",
          right: "2%",
          fontFamily: "Digital, monospace",
          fontSize: "2.6rem",
          color: "#ff2d2d",
          fontWeight: 900,
        }}
      >
        {score}
      </div>

      {/* NAME */}
      <div
        style={{
          position: "absolute",
          bottom: "1.5%",
          left: "2%",
          color: "white",
          fontSize: "1rem",
          fontWeight: 700,
        }}
      >
        {player
          ? `${player.nickname?.split(" ")[0] || ""} ${
              player.nickname?.split(" ")[1]
                ? player.nickname.split(" ")[1][0] + "."
                : ""
            }`
          : "Open Slot"}
      </div>
    </div>
  );
}
