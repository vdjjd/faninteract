"use client";

import React from "react";
import RimSparks from "@/app/basketball/components/Effects/RimSparks";
import { project3D } from "@/app/basketball/utils/projection";
import LaneAnimationPlayer from "@/app/basketball/components/LaneAnimationPlayer";

const SELFIE_SIZE = 54;

/* ---------------- NET GRAPHIC ---------------- */
function Net({ state }: { state: "idle" | "swish" | "hit" }) {
  const frame =
    state === "swish"
      ? "/net_swish.png"
      : state === "hit"
      ? "/net_hit.png"
      : "/net_idle.png";

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
        zIndex: 150,
        pointerEvents: "none",
      }}
    />
  );
}

/* ---------------- 3D BACKBOARD ---------------- */
function Backboard({ hostLogo }: { hostLogo?: string }) {
  const { screenX, screenY, scale, zIndex } = project3D(50, 12, 0.96);

  return (
    <div
      style={{
        position: "absolute",
        left: `${screenX}%`,
        top: `${screenY}%`,
        width: `${33 * scale}%`,
        height: `${7 * scale}vh`,
        transform: "translate(-50%, -50%)",
        borderRadius: 6,
        background: "rgba(255,255,255,0.12)",
        border: "2px solid rgba(255,0,0,0.4)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex,
      }}
    >
      {hostLogo && (
        <img
          src={hostLogo}
          style={{
            width: "80%",
            height: "80%",
            opacity: 0.35,
            objectFit: "contain",
          }}
        />
      )}
    </div>
  );
}

/* ------------------- 3D RIM ------------------- */
function Rim3D() {
  const { screenX, screenY, scale, zIndex } = project3D(50, 18, 0.88);

  return (
    <div
      style={{
        position: "absolute",
        left: `${screenX}%`,
        top: `${screenY}%`,
        width: `${14 * scale}%`,
        height: `${1.2 * scale}vh`,
        transform: "translate(-50%, -50%)", // FIXED QUOTE
        background: "#ff6a00",
        boxShadow: "0 0 12px rgba(255,120,0,0.8)",
        borderRadius: 10,
        zIndex,
      }}
    />
  );
}

/* --------------------------------------------------
   MAIN PLAYER CARD
--------------------------------------------------- */
type PlayerCardProps = {
  index: number;
  player: any;
  balls?: any[];
  timeLeft: number;
  score: number;
  borderColor: string;
  timerExpired: boolean;
  hostLogo?: string | null;
  maxScore: number;
  animationName?: string | null; // SYSTEM B
};

export default function PlayerCard({
  index,
  player,
  balls = [],
  timeLeft,
  score,
  borderColor,
  timerExpired,
  hostLogo,
  maxScore,
  animationName,
}: PlayerCardProps) {
  const isWinner =
    timerExpired && player && player.score === maxScore && maxScore > 0;

  let netState: "idle" | "swish" | "hit" = "idle";

  for (const b of balls) {
    if (b.scored) {
      netState = b.swish ? "swish" : "hit";
      break;
    }

    const dx = b.x - 50;
    const dy = b.y - 18;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (Math.abs(b.z - 0.88) < 0.03 && dist < 9) {
      netState = "hit";
    }
  }

  const winnerPulseStyle = isWinner
    ? {
        animation: "winnerPulse 1.35s ease-in-out infinite",
        boxShadow: `0 0 26px ${borderColor}, 0 0 70px ${borderColor}AA`,
      }
    : {};

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
        zIndex: 0,
        ...winnerPulseStyle,
      }}
    >
      {/* SYSTEM B ANIMATION LAYER */}
      {animationName && <LaneAnimationPlayer animationName={animationName} />}

      {/* BACKBOARD + RIM */}
      <Backboard hostLogo={hostLogo ?? undefined} />
      <Rim3D />

      {/* NET */}
      <Net state={netState} />
      <RimSparks x={50} y={18} active={netState === "hit"} zIndex={180} />

      {/* STATIC BALL */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: "-25%",
          transform: "translateX(-50%)",
          zIndex: 14,
          pointerEvents: "none",
        }}
      >
        <img
          src="/ball.png"
          style={{
            width: "200px",
            height: "175px",
            opacity: 1,
          }}
        />
      </div>

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
          zIndex: 120,
        }}
      >
        {timeLeft !== null
          ? `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(
              2,
              "0"
            )}`
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
          zIndex: 120,
        }}
      >
        P{index + 1}
      </div>

      {/* SELFIE */}
      <div
        style={{
          position: "absolute",
          bottom: "-3%",
          left: "0.75%",
          width: SELFIE_SIZE,
          height: SELFIE_SIZE,
          zIndex: 130,
        }}
      >
        <div
          style={{
            width: SELFIE_SIZE * 0.75,
            height: SELFIE_SIZE * 0.75,
            borderRadius: "50%",
            overflow: "hidden",
            border: `3px solid ${borderColor}`,
            background: "#222",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {player?.selfie_url ? (
            <img
              src={player.selfie_url}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                background: "#444",
                color: "#bbb",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                fontSize: "1.6rem",
                fontWeight: 700,
              }}
            >
              ?
            </div>
          )}
        </div>
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
          zIndex: 130,
        }}
      >
        {score}
      </div>

      {/* WINNER LABEL */}
      {isWinner && (
        <div
          style={{
            position: "absolute",
            top: "42%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            fontSize: "2.8rem",
            fontWeight: 900,
            color: "white",
            WebkitTextStroke: `4px ${borderColor}`,
            textShadow: `
              0 0 25px ${borderColor},
              0 0 45px ${borderColor},
              0 0 60px ${borderColor}
            `,
            letterSpacing: "4px",
            textTransform: "uppercase",
            zIndex: 200,
          }}
        >
          WINNER
        </div>
      )}
    </div>
  );
}
