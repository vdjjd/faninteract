"use client";

import { BallState } from "@/app/basketball/hooks/usePhysicsEngine";

export default function BallTrail({ ball }: { ball: BallState }) {
  if (!ball.active) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: `${ball.x}%`,
        top: `${ball.y}%`,
        width: `${ball.size}%`,
        height: `${ball.size}%`,
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
        zIndex: 3,
        filter: "blur(5px) brightness(1.8)",
        opacity: 0.45,
        background: "radial-gradient(circle, #ffb200, #ff4500)",
        borderRadius: "50%",
        animation: "trailFade 140ms linear forwards",
      }}
    >
      <style jsx>{`
        @keyframes trailFade {
          0% {
            opacity: 0.45;
            transform: translate(-50%, -50%) scale(1);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.6);
          }
        }
      `}</style>
    </div>
  );
}
