"use client";

import React, { useMemo } from "react";

export default function BallRenderer({ ball }) {
  // --- PERSPECTIVE SCALE ---
  // ball.y goes from ~94 (start) to ~16 (rim)
  const scale = useMemo(() => {
    const minScale = 0.55; // smallest size near rim
    const maxScale = 1.0;  // biggest size near bottom
    const t = Math.min(Math.max((ball.y - 16) / (94 - 16), 0), 1);
    return minScale + (maxScale - minScale) * t;
  }, [ball.y]);

  // --- SPIN (based on speed) ---
  const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
  const rotation = ball.id.length * 40 + speed * 120; // each ball unique spin

  return (
    <img
      src="/ball.png"
      alt="basketball"
      style={{
        position: "absolute",
        left: `${ball.x}%`,
        top: `${ball.y}%`,
        width: `${ball.size * scale}px`,
        height: `${ball.size * scale}px`,
        transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
        pointerEvents: "none",
        zIndex: 5,
      }}
    />
  );
}
