"use client";

import React from "react";
import { BallState } from "@/app/basketball/hooks/usePhysicsEngine";

// Default import from BallRenderer
import BallRenderer from "@/app/basketball/components/Active/BallRenderer";

import Fire from "@/app/basketball/components/Effects/Fire";
import Rainbow from "@/app/basketball/components/Effects/Rainbow";

import { Player } from "@/app/basketball/hooks/usePlayers";

/* ---- GEOMETRY CONSTANTS ---- */
const BACKBOARD_SCALE = 1;
const RIM_WIDTH = 14;
const RIM_SCALE = 1;
const SELFIE_SIZE = 42;

// FX thresholds (tuned for physics engine)
const RIM_Y = 12;
const RIM_ZONE_TOP = RIM_Y - 2;
const RIM_ZONE_BOTTOM = RIM_Y + 2;
const SWISH_CENTER_MIN = 47;
const SWISH_CENTER_MAX = 53;

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
          background: "rgba(255,255,255,0.1)",
          border: "2px solid rgba(255,0,0,0.45)",
        }}
      >
        {hostLogo && (
          <img
            src={hostLogo}
            style={{
              width: "70%",
              height: "70%",
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
          top: `calc(4% + ${7 * BACKBOARD_SCALE}vh)`,
          left: "50%",
          transform: "translateX(-50%)",
          width: `${RIM_WIDTH * RIM_SCALE}%`,
          height: 4,
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
          opacity: 0.5,
          background:
            "repeating-linear-gradient(135deg, white 0, white 2px, transparent 3px 6px)",
          borderRadius: "0 0 10px 10px",
        }}
      />

      {/* BALL FX + BALL */}
      {balls.map((ball) => {
        const hitsRim =
          ball.y > RIM_ZONE_TOP &&
          ball.y < RIM_ZONE_BOTTOM &&
          ball.x > 50 - RIM_WIDTH / 2 &&
          ball.x < 50 + RIM_WIDTH / 2;

        const swish =
          ball.y > RIM_Y &&
          ball.x > SWISH_CENTER_MIN &&
          ball.x < SWISH_CENTER_MAX &&
          ball.vy > 0;

        return (
          <React.Fragment key={ball.id}>
            {/* Fire trail */}
            {ball.fire && <Fire x={ball.x} y={ball.y} />}

            {/* Rainbow trail */}
            {ball.rainbow && <Rainbow x={ball.x} y={ball.y} />}

            {/* RIM SPARKS */}
            {hitsRim && (
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: `${RIM_Y}%`,
                  width: "26%",
                  height: "3%",
                  transform: "translate(-50%, -50%)",
                  background:
                    "radial-gradient(circle, #ffffff, rgba(255,200,0,0.3))",
                  borderRadius: "50%",
                  filter: "drop-shadow(0 0 12px rgba(255,200,0,0.9))",
                  animation: "sparkAnim 0.22s ease-out",
                  pointerEvents: "none",
                }}
              />
            )}

            {/* SWISH POP */}
            {swish && (
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: `${RIM_Y + 4}%`,
                  width: "20%",
                  height: "20%",
                  transform: "translate(-50%, -50%)",
                  borderRadius: "50%",
                  border: "3px solid rgba(255,255,255,0.9)",
                  opacity: 0.8,
                  animation: "swishPop 0.28s ease-out",
                }}
              />
            )}

            <BallRenderer ball={ball} />
          </React.Fragment>
        );
      })}

      {/* PLAYER SELFIE */}
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
          <img
            src={player.selfie_url}
            style={{ width: "100%", height: "100%" }}
          />
        ) : (
          <div
            style={{
              background: "#444",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
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

      {/* LOCAL KEYFRAMES */}
      <style>{`
        @keyframes sparkAnim {
          0% {
            opacity: 1;
            transform: scale(1) translate(-50%, -50%);
          }
          100% {
            opacity: 0;
            transform: scale(1.8) translate(-50%, -50%);
          }
        }

        @keyframes swishPop {
          0% {
            opacity: 1;
            transform: scale(0.4) translate(-50%, -50%);
          }
          100% {
            opacity: 0;
            transform: scale(1.4) translate(-50%, -50%);
          }
        }
      `}</style>
    </div>
  );
}
