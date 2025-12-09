"use client";

import React, { useMemo } from "react";
import { BallState } from "@/app/basketball/hooks/usePhysicsEngine";
import BallRenderer from "@/app/basketball/components/Active/BallRenderer";
import Fire from "@/app/basketball/components/Effects/Fire";
import Rainbow from "@/app/basketball/components/Effects/Rainbow";
import { Player } from "@/app/basketball/hooks/usePlayers";

/* NET GRAPHIC */
function Net({ state }: { state: "idle" | "swish" | "hit" }) {
  const frame = useMemo(() => {
    switch (state) {
      case "swish": return "/net_swish.png";
      case "hit": return "/net_hit.png";
      default: return "/net_idle.png";
    }
  }, [state]);

  return (
    <img
      src={frame}
      alt="net"
      style={{
        position: "absolute",
        top: "calc(4% + 7vh + 0.4vh)",
        left: "50%",
        transform: "translateX(-50%)",
        width: "14%",
        zIndex: 3,
        pointerEvents: "none",
      }}
    />
  );
}

const BACKBOARD_SCALE = 1;
const RIM_WIDTH = 14;
const SELFIE_SIZE = 42;

/* 🔥 OFFICIAL DEFAULT EXPORT */
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

  let netState: "idle" | "swish" | "hit" = "idle";

  for (const b of balls) {
    const { x, y, vy, vx } = b;

    if (vy > 0 && x > 47 && x < 53 && y > 12 && y < 22) {
      netState = "swish";
      break;
    }

    if (
      y > 10 &&
      y < 15 &&
      (x < 45 || x > 55) &&
      Math.abs(vx) + Math.abs(vy) > 0.6
    ) {
      netState = "hit";
      break;
    }
  }

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
        animation: isWinner ? "winnerBlink 0.18s infinite alternate" : undefined,
      }}
    >
      {/* Timer */}
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

      {/* Player Label */}
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

      {/* Backboard */}
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

      {/* Rim */}
      <div
        style={{
          position: "absolute",
          top: `calc(4% + ${7 * BACKBOARD_SCALE}vh - 0.2vh)`,
          left: "50%",
          transform: "translateX(-50%)",
          width: `${RIM_WIDTH}%`,
          height: "0.7vh",
          background: "#ff6a00",
          borderRadius: 6,
          boxShadow: "0 0 12px rgba(255,120,0,0.8)",
          zIndex: 3,
        }}
      />

      {/* Net */}
      <Net state={netState} />

      {/* Balls & FX */}
      {balls.map((ball) => (
        <React.Fragment key={ball.id}>
          {ball.fire && <Fire x={ball.x} y={ball.y} />}
          {ball.rainbow && <Rainbow x={ball.x} y={ball.y} />}
          <BallRenderer ball={ball} />
        </React.Fragment>
      ))}

      {/* Selfie */}
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

      {/* Score */}
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
