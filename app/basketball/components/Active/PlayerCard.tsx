"use client";

import React, { useMemo } from "react";
import BallRenderer from "./BallRenderer";
import Fire from "@/app/basketball/components/Effects/Fire";
import Rainbow from "@/app/basketball/components/Effects/Rainbow";

/* NET — Final pixel aligned version */
function Net({ state }: { state: "idle" | "swish" | "hit" }) {
  const src =
    state === "swish"
      ? "/net_swish.png"
      : state === "hit"
      ? "/net_hit.png"
      : "/net_idle.png";

  return (
    <img
      src={src}
      style={{
        position: "absolute",
        top: "calc(4% + 7vh + 0.3vh)",
        left: "50%",
        transform: "translateX(-50%)",
        width: "14%",
        zIndex: 2,
        pointerEvents: "none",
      }}
    />
  );
}

const BACKBOARD_SCALE = 1;
const RIM_WIDTH = 14;
const SELFIE_SIZE = 54;

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
  const isWinner =
    timerExpired && player && player.score === maxScore && maxScore > 0;

  /* Swish + Hit Detection */
  let netState: "idle" | "swish" | "hit" = "idle";

  for (const b of balls) {
    if (
      b.z > 0.88 &&
      b.z < 1.02 &&
      b.x > 47 &&
      b.x < 53 &&
      b.y > 14 &&
      b.y < 22 &&
      b.vy > 0
    ) {
      netState = "swish";
      break;
    }

    if (
      b.z > 0.88 &&
      b.z < 1.02 &&
      b.y > 10 &&
      b.y < 16 &&
      (b.x < 45 || b.x > 55) &&
      (Math.abs(b.vx) + Math.abs(b.vy) > 0.5)
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
      }}
    >
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
            style={{ width: "80%", height: "80%", objectFit: "contain", opacity: 0.35 }}
          />
        )}
      </div>

      {/* Rim bar */}
      <div
        style={{
          position: "absolute",
          top: `calc(4% + 7vh - 0.2vh)`,
          left: "50%",
          transform: "translateX(-50%)",
          width: `${RIM_WIDTH}%`,
          height: "0.7vh",
          background: "#ff6a00",
          borderRadius: 6,
          zIndex: 3,
        }}
      />

      {/* Net */}
      <Net state={netState} />

      {/* Balls */}
      {balls.map((ball) => (
        <React.Fragment key={ball.id}>
          {ball.fire && <Fire x={ball.x} y={ball.y} />}
          {ball.rainbow && <Rainbow x={ball.x} y={ball.y} />}
          <BallRenderer ball={ball} />
        </React.Fragment>
      ))}

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
