"use client";

import React from "react";
import { BallState } from "@/app/basketball/hooks/useShots";

/**
 * Renders a basketball + its shadow based on animation state.
 */
export function Ball({ ball }: { ball: BallState }) {
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

  const ballX = `calc(50% + ${ball.x}px)`;
  const ballY = `${ball.y}%`;

  return (
    <>
      {/* Shadow */}
      <div
        style={{
          position: "absolute",
          bottom: `${Math.max(1, ball.y * 0.25)}%`,
          left: ballX,
          transform: "translateX(-50%)",
          width: `${40 * ball.scale + 18}px`,
          height: `${14 * ball.scale + 6}px`,
          background: "rgba(0,0,0,0.45)",
          borderRadius: "50%",
          filter: "blur(6px)",
          transition: "all 0.016s linear",
          zIndex: 3,
        }}
      />

      {/* Ball */}
      <div
        style={{
          position: "absolute",
          bottom: ballY,
          left: ballX,
          transform: "translateX(-50%)",
          width: `${38 * ball.scale}px`,
          height: `${38 * ball.scale}px`,
          borderRadius: "50%",
          background: `
            radial-gradient(circle at 30% 30%, rgba(255,255,255,0.7), rgba(0,0,0,0) 40%),
            radial-gradient(circle at 70% 70%, #ff9d00, #ff6100)
          `,
          animation:
            ball.spin > 0.66
              ? "ballSpinFast 0.28s infinite linear"
              : ball.spin > 0.33
              ? "ballSpinMedium 0.34s infinite linear"
              : "ballSpinSlow 0.42s infinite linear",
          boxShadow:
            "inset 0 0 6px rgba(0,0,0,0.55), inset -4px -6px 10px rgba(0,0,0,0.55)",
          zIndex: 10,
        }}
      >
        {/* RENDER SEAMS */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: `${1.5 * ball.scale}px solid rgba(0,0,0,0.55)`,
          }}
        />

        <div
          style={{
            position: "absolute",
            top: "50%",
            left: 0,
            width: "100%",
            height: `${1.5 * ball.scale}px`,
            background: "rgba(0,0,0,0.55)",
          }}
        />

        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            width: `${1.5 * ball.scale}px`,
            height: "100%",
            background: "rgba(0,0,0,0.55)",
          }}
        />
      </div>
    </>
  );
}
