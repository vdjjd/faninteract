"use client";

import React from "react";

export default function BallRenderer({ ball }) {

  // Z-axis scale (farther = smaller)
  const scale = 1 - ball.z * 0.65;  
  const px = 0;   // optional x-offset curve
  const py = 0;

  return (
    <img
      src="/ball.png"
      alt="basketball"
      style={{
        position: "absolute",
        left: `${ball.x + px}%`,
        top: `${ball.y + py}%`,
        width: `${ball.size * scale}px`,
        height: `${ball.size * scale}px`,
        transform: "translate(-50%, -50%)",
        zIndex: 5,
        pointerEvents: "none",
      }}
    />
  );
}
