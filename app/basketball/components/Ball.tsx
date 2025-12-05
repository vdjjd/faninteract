"use client";

import React from "react";
import { BallState } from "@/app/basketball/hooks/useShots";
import { projectY, depthToScale } from "@/app/basketball/utils/physics";

export function Ball({ ball }: { ball: BallState }) {
  if (!ball.active) return null;

  /* ------------------------------------------------------------
     POSITIONING CONVERSION
     ball.x → horizontal offset (px)
     ball.y → screen Y metric (% of cell height)
     ball.z → depth → used for scaling & shadow
  ------------------------------------------------------------ */

  // Convert ball.y (virtual vertical position) to screen position,
  // using depth projection to push balls "up" visually.
  const screenY = `${projectY(ball.y, ball.z)}%`;

  // Convert ball.x directly (playerCard is centered, so x=0 is middle)
  const screenX = `calc(50% + ${ball.x}px)`;

  // Scale based on depth
  const scale = ball.scale;

  // Shadow size shrinks with depth
  const shadowScale = scale * 0.65;

  // Shadow Y should hug the front of the ball
  const shadowY = `${Math.max(1, ball.y * 0.22)}%`;

  return (
    <>
      {/* SHADOW */}
      <div
        style={{
          position: "absolute",
          bottom: shadowY,
          left: screenX,
          transform: "translateX(-50%)",
          width: `${50 * shadowScale}px`,
          height: `${18 * shadowScale}px`,
          background: "rgba(0,0,0,0.45)",
          borderRadius: "50%",
          filter: "blur(8px)",
          zIndex: 1,
        }}
      />

      {/* BALL */}
      <div
        style={{
          position: "absolute",
          bottom: screenY,
          left: screenX,
          transform: "translateX(-50%)",
          width: `${38 * scale}px`,
          height: `${38 * scale}px`,
          borderRadius: "50%",
          background: `
            radial-gradient(circle at 30% 30%, rgba(255,255,255,0.7), rgba(0,0,0,0) 40%),
            radial-gradient(circle at 70% 70%, #ff9d00, #ff6100)
          `,
          boxShadow:
            "inset 0 0 6px rgba(0,0,0,0.5), inset -4px -6px 10px rgba(0,0,0,0.55)",
          zIndex: 5 + Math.round((1 - ball.z) * 10), // deeper balls behind closer balls
        }}
      >
        {/* BALL SEAMS */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: `${1.8 * scale}px solid rgba(0,0,0,0.55)`,
          }}
        />

        {/* Horizontal seam */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: 0,
            width: "100%",
            height: `${1.6 * scale}px`,
            background: "rgba(0,0,0,0.55)",
          }}
        />

        {/* Vertical seam */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            width: `${1.6 * scale}px`,
            height: "100%",
            background: "rgba(0,0,0,0.55)",
          }}
        />
      </div>
    </>
  );
}
