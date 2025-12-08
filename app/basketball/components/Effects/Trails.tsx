"use client";

import { BallState } from "@/app/basketball/hooks/usePhysicsEngine";

export default function Trails({
  ball,
  length = 4,
}: {
  ball: BallState;
  length?: number;
}) {
  // Generate ghost positions behind the ball
  const trailPieces = Array.from({ length }).map((_, i) => ({
    x: ball.x - ball.vx * i * 0.8,
    y: ball.y - ball.vy * i * 0.8,
    opacity: Math.max(0, 0.35 - i * 0.07),
    scale: 1 - i * 0.12,
  }));

  return (
    <>
      {trailPieces.map((t, idx) => (
        <div
          key={idx}
          style={{
            position: "absolute",
            left: `${t.x}%`,
            top: `${t.y}%`,
            width: `${ball.size}%`,
            height: `${ball.size}%`,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.5)",
            transform: `translate(-50%, -50%) scale(${t.scale})`,
            opacity: t.opacity,
            filter: "blur(6px)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />
      ))}
    </>
  );
}
