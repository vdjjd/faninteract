"use client";

import React from "react";
import { BallState } from "@/app/basketball/hooks/usePhysicsEngine";
import BallRenderer from "@/app/basketball/components/Active/BallRenderer";
import Fire from "@/app/basketball/components/Effects/Fire";
import Rainbow from "@/app/basketball/components/Effects/Rainbow";
import { Player } from "@/app/basketball/hooks/usePlayers";

/* Geometry */
const BACKBOARD_SCALE = 1;
const RIM_WIDTH = 14;
const RIM_SCALE = 1;
const SELFIE_SIZE = 42;

export default function PlayerCard({
  index,
  player,
  balls,
  timeLeft,
  score,
  borderColor,
  timerExpired,
  hostLogo,
  maxScore,
}: {
  index: number;
  player: Player | undefined;
  balls: BallState[];
  timeLeft: number | null;
  score: number;
  borderColor: string;
  timerExpired: boolean;
  hostLogo: string | null;
  maxScore: number;
}) {
  const isWinner =
    timerExpired && player && player.score === maxScore && maxScore > 0;

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
      }}
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
          fontFamily: "Digital, monospace",
          fontSize: "1rem",
          fontWeight: 700,
        }}
      >
        {timeLeft !== null
          ? `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, "0")}`
          : "--:--"}
      </div>

      {/* PLAYER LABEL */}
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
          borderRadius: 6,
          background: "rgba(255,255,255,0.12)",
          border: "2px solid rgba(255,0,0,0.4)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          overflow: "hidden",
        }}
      >
        {hostLogo && (
          <img
            src={hostLogo}
            style={{
              width: "80%",
              height: "80%",
              objectFit: "contain",
              opacity: 0.35,
            }}
          />
        )}
      </div>

      {/* RIM */}
      <div
        style={{
          position: "absolute",
          top: `calc(4% + ${7 * BACKBOARD_SCALE}vh - 0.2vh)`,
          left: "50%",
          transform: "translateX(-50%)",
          width: `${RIM_WIDTH * RIM_SCALE}%`,
          height: "0.7vh",
          background: "#ff6a00",
          borderRadius: 6,
          boxShadow: "0 0 12px rgba(255,120,0,0.8)",
        }}
      />

      {/* SVG NET */}
      <svg
        width="120"
        height="100"
        viewBox="0 0 120 100"
        style={{
          position: "absolute",
          top: `calc(4% + ${7 * BACKBOARD_SCALE}vh + 0.4vh)`,
          left: "50%",
          transform: "translateX(-50%)",
          opacity: 0.9,
        }}
      >
        {/* Realistic net verticals */}
        {[...Array(7)].map((_, i) => {
          const x = 20 + i * 12;
          return (
            <line
              key={i}
              x1={x}
              y1={0}
              x2={x - 10}
              y2={80}
              stroke="white"
              strokeWidth="3"
              strokeOpacity="0.8"
            />
          );
        })}

        {/* Cross knots */}
        {[...Array(5)].map((_, row) =>
          [...Array(6)].map((_, col) => {
            const cx = 26 + col * 12;
            const cy = 20 + row * 15;
            return (
              <circle
                key={`${row}-${col}`}
                cx={cx}
                cy={cy}
                r={2.6}
                fill="white"
                opacity={0.9}
              />
            );
          })
        )}
      </svg>

      {/* BALL + FX */}
      {balls.map((ball) => (
        <React.Fragment key={ball.id}>
          {ball.fire && <Fire x={ball.x} y={ball.y} />}
          {ball.rainbow && <Rainbow x={ball.x} y={ball.y} />}
          <BallRenderer ball={ball} />
        </React.Fragment>
      ))}

      {/* SELFIE */}
      <div
        style={{
          position: "absolute",
          bottom: "8%",
          left: "2%",
          width: SELFIE_SIZE,
          height: SELFIE_SIZE,
          borderRadius: "50%",
          overflow: "hidden",
          border: `3px solid ${borderColor}`,
        }}
      >
        {player?.selfie_url ? (
          <img src={player.selfie_url} style={{ width: "100%", height: "100%" }} />
        ) : (
          <div
            style={{
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
          fontSize: "2.6rem",
          fontFamily: "Digital, monospace",
          fontWeight: 900,
          color: "#ff2d2d",
        }}
      >
        {score}
      </div>
    </div>
  );
}
