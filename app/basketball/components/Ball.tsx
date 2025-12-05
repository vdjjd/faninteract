"use client";

import React from "react";
import { BallState } from "@/app/basketball/hooks/useShots";

/**
 * 2.5D Renderer:
 *  - ball.y = projected screen-space Y (depth + arc)
 *  - ball.x = spin drift (left/right)
 *  - ball.scale = depth shrink/grow
 *  - shadow uses depth projection only
 */

export function Ball({ ball }: { ball: BallState }) {
  // If idle, show resting ball
  if (!ball.active) {
    return (
      <div
        style={{
          position: "absolute",
          bottom: "4%",
          left: "50%",
          transform: "translateX(-50%)",
          width: 30,
          height: 30,
          borderRadius: "50%",
          background: "radial-gradient(circle, #ff9d00, #ff6100)",
          opacity: 0.4,
        }}
      />
    );
  }

  /* ============================================================
     2.5D PRIMITIVES
     ball.y is already a computed screen-space vertical position.
     ball.scale gives depth.
     ball.x is horizontal drift.
  ============================================================= */

  const screenX = `calc(50% + ${ball.x}px)`;    // horizontal drift only
  const screenY = `${ball.y}%`;                // projected Y (depth + arc)

  /* Shadow should ONLY depend on depth, so it sits “on the floor” */
  const shadowY = `${4 + ball.depth * 3}%`;    // small lift off floor as depth increases

  return (
    <>
      {/* SHADOW */}
      <div
        style={{
          position: "absolute",
          bottom: shadowY,
          left: screenX,
          transform: "translateX(-50%)",
          width: `${40 * ball.scale + 14}px`,
          height: `${14 * ball.scale + 4}px`,
          background: "rgba(0,0,0,0.45)",
          borderRadius: "50%",
          filter: "blur(6px)",
          zIndex: 2,
          transition: "all 0.016s linear",
        }}
      />

      {/* BALL */}
      <div
        style={{
          position: "absolute",
          bottom: screenY,
          left: screenX,
          transform: `translateX(-50%) scale(${ball.scale})`,
          width: `38px`,
          height: `38px`,
          borderRadius: "50%",
          background: `
            radial-gradient(circle at 30% 30%, rgba(255,255,255,0.65), rgba(0,0,0,0) 40%),
            radial-gradient(circle at 70% 70%, #ff9d00, #ff6100)
          `,
          animation:
            ball.spin > 0.66
              ? "ballSpinFast 0.28s linear infinite"
              : ball.spin > 0.33
              ? "ballSpinMedium 0.34s linear infinite"
              : "ballSpinSlow 0.42s linear infinite",
          boxShadow:
            "inset 0 0 6px rgba(0,0,0,0.55), inset -4px -6px 10px rgba(0,0,0,0.55)",
          zIndex: 10,
        }}
      >
        {/* SEAMS */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: `1.5px solid rgba(0,0,0,0.55)`,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: 0,
            width: "100%",
            height: `1.5px`,
            background: "rgba(0,0,0,0.55)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            width: `1.5px`,
            height: "100%",
            background: "rgba(0,0,0,0.55)",
          }}
        />
      </div>
    </>
  );
}
