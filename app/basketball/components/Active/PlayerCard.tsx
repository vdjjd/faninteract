"use client";

import React from "react";
import BallRenderer from "@/app/basketball/components/Active/BallRenderer";
import Fire from "@/app/basketball/components/Effects/Fire";
import Rainbow from "@/app/basketball/components/Effects/Rainbow";
import RimSparks from "@/app/basketball/components/Effects/RimSparks";

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

const BACKBOARD_SCALE = 1;
const RIM_WIDTH = 14;
const SELFIE_SIZE = 54;

/* --------------------------------------------------
   MAIN PLAYERCARD
--------------------------------------------------- */
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
}) {
  /* ---------------- WINNER CHECK ---------------- */
  const isWinner =
    timerExpired && player && player.score === maxScore && maxScore > 0;

  /* ---------------- NET LOGIC ---------------- */
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

  /* ---------------- WINNER PULSE STYLE ---------------- */
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
        ...winnerPulseStyle, // ⭐ HERE WE APPLY THE WINNER ANIMATION
      }}
    >
      {/* KEYFRAME STYLE */}
      <style>
        {`
          @keyframes winnerPulse {
            0% {
              transform: scale(1);
              box-shadow: 0 0 18px ${borderColor}, 0 0 45px ${borderColor}55;
            }
            50% {
              transform: scale(1.02);
              box-shadow: 0 0 38px ${borderColor}, 0 0 90px ${borderColor}AA;
            }
            100% {
              transform: scale(1);
              box-shadow: 0 0 18px ${borderColor}, 0 0 45px ${borderColor}55;
            }
          }
        `}
      </style>

      {/* ---------------- TIMER ---------------- */}
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

      {/* ---------------- PLAYER LABEL ---------------- */}
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

      {/* ---------------- BACKBOARD ---------------- */}
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
          zIndex: 20,
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

      {/* ---------------- RIM ---------------- */}
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
          zIndex: 25,
        }}
      />

      {/* ---------------- NET ---------------- */}
      <Net state={netState} />

      {/* ---------------- RIM SPARKS ---------------- */}
      <RimSparks x={50} y={18} active={netState === "hit"} zIndex={180} />

      {/* ---------------- BALLS + FX ---------------- */}
      {balls.map((ball) => (
        <React.Fragment key={ball.id}>
          {ball.fire && <Fire x={ball.x} y={ball.y} />}
          {ball.rainbow && <Rainbow x={ball.x} y={ball.y} />}
          <BallRenderer ball={ball} />
        </React.Fragment>
      ))}

      {/* ---------------- WINNER CROWN ---------------- */}
      {isWinner && (
        <img
          src="/crown.png"
          alt="winner crown"
          style={{
            position: "absolute",
            bottom: SELFIE_SIZE * 0.65,
            left: "2%",
            width: SELFIE_SIZE * 0.8,
            filter: `drop-shadow(0 0 8px ${borderColor})`,
            transform: "rotate(-6deg)",
            zIndex: 200,
          }}
        />
      )}

      {/* ---------------- SELFIE ---------------- */}
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

      {/* ---------------- SCORE ---------------- */}
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

      {/* ---------------- WINNER LABEL ---------------- */}
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
