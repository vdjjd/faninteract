"use client";

import React from "react";
import { BallState } from "@/app/basketball/hooks/usePhysicsEngine";

export default function BallRenderer({ ball }: { ball: BallState }) {
  if (!ball.active) return null;

  // Optional effects
  const flame = ball.fire
    ? "drop-shadow(0 0 20px rgba(255,80,0,0.9)) drop-shadow(0 0 35px rgba(255,120,0,1))"
    : "";

  const rainbow = ball.rainbow ? "hue-rotate(180deg) saturate(2)" : "";

  return (
    <div
      style={{
        position: "absolute",
        left: `${ball.x}%`,
        top: `${ball.y}%`,
        width: `${ball.size}%`,
        height: `${ball.size}%`,
        borderRadius: "50%",
        background: "radial-gradient(circle, #ff7b00, #ff4500)",
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
        boxShadow: "0 0 12px rgba(255,120,0,0.9)",
        filter: `${flame} ${rainbow}`,
      }}
    />
  );
}
