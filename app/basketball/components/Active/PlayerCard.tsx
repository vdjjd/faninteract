"use client";

import React from "react";
import { BallState } from "@/app/basketball/hooks/usePhysicsEngine";
import BallRenderer from "@/app/basketball/components/Active/BallRenderer";

import Fire from "@/app/basketball/components/Effects/Fire";
import Rainbow from "@/app/basketball/components/Effects/Rainbow";

import { Player } from "@/app/basketball/hooks/usePlayers";

/* ---- GEOMETRY CONSTANTS ---- */
const BACKBOARD_SCALE = 1;
const RIM_WIDTH = 16;
const RIM_SCALE = 1;
const SELFIE_SIZE = 42;

/* FX geometry */
const RIM_Y = 12;
const RIM_ZONE_TOP = RIM_Y - 2;
const RIM_ZONE_BOTTOM = RIM_Y + 2;
const SWISH_MIN = 47;
const SWISH_MAX = 53;

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

      {/* BACKBOARD ⬛ (GLASS + LOGO + REFLECTION) */}
      <div
        style={{
          position: "absolute",
          top: "3.5%",
          left: "50%",
          transform: "translateX(-50%)",
          width: `${38 * BACKBOARD_SCALE}%`,
          height: `${8 * BACKBOARD_SCALE}vh`,
          borderRadius: 8,
          border: "4px solid rgba(255,255,255,0.45)",
          background: "rgba(255,255,255,0.10)",
          overflow: "hidden",
          boxShadow:
            "inset 0 0 18px rgba(255,255,255,0.35), inset 0 0 28px rgba(0,0,0,0.35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {hostLogo && (
          <img
            src={hostLogo}
            style={{
              width: "50%",
              height: "50%",
              objectFit: "contain",
              opacity: 0.5,
              filter: "drop-shadow(0 0 6px rgba(0,0,0,0.35))",
            }}
          />
        )}

        {/* GLOSS REFLECTION */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.03) 45%, rgba(255,255,255,0))",
            pointerEvents: "none",
          }}
        />
      </div>

      {/* RIM (NBA-STYLE METAL) */}
      <div
        style={{
          position: "absolute",
          top: `calc(3.5% + ${8 * BACKBOARD_SCALE}vh)`,
          left: "50%",
          transform: "translateX(-50%)",
          width: `${RIM_WIDTH}%`,
          height: 5,
          background:
            "linear-gradient(to bottom, #ff9a3c, #ff5a00, #b33900)", // metal gradient
          borderRadius: 8,
          boxShadow:
            "0 0 6px rgba(255,100,0,0.9), inset 0 0 4px rgba(0,0,0,0.4)", // glow + depth
          zIndex: 2,
        }}
      />

      {/* NET (ROPE TEXTURE + DEPTH) */}
      <div
        style={{
          position: "absolute",
          top: `calc(3.5% + ${8 * BACKBOARD_SCALE}vh + 0.5vh)`,
          left: "50%",
          transform: "translateX(-50%)",
          width: `${RIM_WIDTH * 0.75}%`,
          height: "4vh",
          background:
            "repeating-linear-gradient(135deg, white 0 2px, transparent 3px 6px)",
          opacity: 0.75,
          borderRadius: "0 0 15px 15px",
          boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
          filter: "drop-shadow(0 2px 2px rgba(255,255,255,0.5))",
          zIndex: 1,
        }}
      />

      {/* BALL EFFECTS + RENDERING */}
      {balls.map((ball) => {
        const hitsRim =
          ball.y > RIM_ZONE_TOP &&
          ball.y < RIM_ZONE_BOTTOM &&
          ball.x > 50 - RIM_WIDTH / 2 &&
          ball.x < 50 + RIM_WIDTH / 2;

        const swish =
          ball.y > RIM_Y &&
          ball.x > SWISH_MIN &&
          ball.x < SWISH_MAX &&
          ball.vy > 0;

        return (
          <React.Fragment key={ball.id}>
            {ball.fire && <Fire x={ball.x} y={ball.y} />}
            {ball.rainbow && <Rainbow x={ball.x} y={ball.y} />}

            {/* RIM SPARKS */}
            {hitsRim && (
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: `${RIM_Y}%`,
                  width: "28%",
                  height: "3%",
                  transform: "translate(-50%, -50%)",
                  background:
                    "radial-gradient(circle, #fff, rgba(255,180,0,0.4))",
                  borderRadius: "50%",
                  filter: "drop-shadow(0 0 12px rgba(255,180,0,1))",
                  animation: "sparkAnim 0.22s ease-out",
                }}
              />
            )}

            {/* SWISH POP EFFECT */}
            {swish && (
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: `${RIM_Y + 5}%`,
                  width: "20%",
                  height: "20%",
                  transform: "translate(-50%, -50%)",
                  borderRadius: "50%",
                  border: "3px solid rgba(255,255,255,0.9)",
                  animation: "swishPop 0.25s ease-out",
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

      {/* KEYFRAMES */}
      <style>{`
        @keyframes sparkAnim {
          0% { opacity:1; transform: scale(1) translate(-50%, -50%); }
          100% { opacity:0; transform: scale(1.8) translate(-50%, -50%); }
        }

        @keyframes swishPop {
          0% { opacity:1; transform: scale(0.4) translate(-50%, -50%); }
          100% { opacity:0; transform: scale(1.3) translate(-50%, -50%); }
        }
      `}</style>
    </div>
  );
}
