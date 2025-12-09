"use client";

import React from "react";

export default function BallRenderer({ ball }) {
  // ----------------------------------------------
  // SETTINGS tuned to match BBgamebackground.png
  // ----------------------------------------------

  // The vanishing point (relative to PlayerCard)
  const VP_X = 50;   // center
  const VP_Y = 12;   // ~top of the free-throw arc in the background

  // Ball shrinks toward vanishing point
  const scale = 1 - ball.z * 0.60; // tuned to background perspective

  // Horizontal convergence (walls taper inward)
  const perspX = ball.x + (VP_X - ball.x) * (ball.z * 0.55);

  // Vertical perspective (floor rises into depth)
  const perspY = ball.y - ball.z * 22; // pushes ball upward as it moves away

  // Size in % (not px!)
  const size = ball.size * scale * 0.55; // fits lane scale visually

  return (
    <img
      src="/ball.png"
      alt="basketball"
      style={{
        position: "absolute",
        left: `${perspX}%`,
        top: `${perspY}%`,
        width: `${size}%`,
        height: `${size}%`,
        transform: "translate(-50%, -50%)",
        zIndex: 5,
        pointerEvents: "none",
        filter: "brightness(1.08)",
      }}
    />
  );
}
