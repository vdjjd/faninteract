"use client";

import React from "react";
import { BallState } from "@/app/basketball/hooks/usePhysicsEngine";

export default function BallRenderer({ ball }: { ball: BallState }) {
  /* -----------------------------------------------------
     DEPTH SCALING
     ball.size comes from physics engine (~50px at spawn)
     We reduce it slightly more here for smoothness.
  ------------------------------------------------------*/

  const scale = 1 - ball.z * 0.45; // smoother arcade shrink
  const renderSize = ball.size * scale;

  /* -----------------------------------------------------
     OPTIONAL SHADOW (small and soft)
     Appears only when ball is still "in play"
  ------------------------------------------------------*/
  const showShadow = ball.z < 1;

  return (
    <>
      {/* ------- Shadow (optional, below ball) ------- */}
      {showShadow && (
        <div
          style={{
            position: "absolute",
            left: `${ball.x}%`,
            top: `${ball.y + 3}%`, // slightly below ball
            width: `${renderSize * 0.6}px`,
            height: `${renderSize * 0.25}px`,
            background: "rgba(0,0,0,0.35)",
            filter: "blur(6px)",
            transform: "translate(-50%, -50%)",
            borderRadius: "50%",
            zIndex: 8,
            pointerEvents: "none",
          }}
        />
      )}

      {/* ------- BALL IMAGE ------- */}
      <img
        src="/ball.png"
        alt="basketball"
        style={{
          position: "absolute",
          left: `${ball.x}%`,
          top: `${ball.y}%`,
          width: `${renderSize}px`,
          height: `${renderSize}px`,
          transform: "translate(-50%, -50%)",
          zIndex: 15, // above background, below net + labels
          pointerEvents: "none",
          imageRendering: "auto",
          opacity: 1, // prevents ghosting
          filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.35))",
        }}
      />
    </>
  );
}
