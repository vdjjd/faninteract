"use client";

import React from "react";
import { BallState } from "@/app/basketball/hooks/usePhysicsEngine";

/* -------------------------------------------------------
   3D PROJECTION — turns x,y,z into screen position
-------------------------------------------------------- */
function project3D(ball: BallState) {
  const { x, y, z } = ball;

  // How much the ball shrinks with depth
  const scale = 1 - z * 0.55;

  // Push ball visually upward as it travels "forward"
  const projectedY = y - (z * 22); // ← Tune this number for arc height

  return {
    screenX: x,
    screenY: projectedY,
    scale,
    zIndex: 200 - Math.floor(z * 100), // Depth layering
  };
}

/* -------------------------------------------------------
   BALL RENDERER
-------------------------------------------------------- */
export default function BallRenderer({ ball }: { ball: BallState }) {
  const { screenX, screenY, scale, zIndex } = project3D(ball);

  // size with depth
  const renderSize = ball.size * scale;

  return (
    <img
      src="/ball.png"
      alt="basketball"
      style={{
        position: "absolute",
        left: `${screenX}%`,
        top: `${screenY}%`,
        width: `${renderSize}px`,
        height: `${renderSize}px`,
        transform: "translate(-50%, -50%)", // FIXED — now a valid string
        zIndex,
        pointerEvents: "none",
        filter: "drop-shadow(0 3px 5px rgba(0,0,0,0.45))",
      }}
    />
  );
}
