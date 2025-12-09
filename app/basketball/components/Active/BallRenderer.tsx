"use client";

import React from "react";

export default function BallRenderer({ ball }) {
  /* ---------------------------------------------------------
     Perspective constants matched to BBgamebackground.png
  --------------------------------------------------------- */

  const VP_X = 50;  // horizontal vanishing point
  const VP_Y = 11;  // vertical vanishing point

  const HORIZ_PERSPECTIVE = 0.55;
  const VERT_PERSPECTIVE = 22;

  // Depth shrink curve
  const size = ball.size * (1 - ball.z * 0.65);

  /* ---------------------------------------------------------
     Perspective warp positions
  --------------------------------------------------------- */
  const perspX = ball.x + (VP_X - ball.x) * (ball.z * HORIZ_PERSPECTIVE);
  const perspY = ball.y - ball.z * VERT_PERSPECTIVE;

  /* ---------------------------------------------------------
     Shadow under the ball
  --------------------------------------------------------- */
  const shadowSize = size * 1.1;
  const shadowOpacity = 0.25 * (1 - ball.z);

  return (
    <>
      {/* Shadow */}
      <div
        style={{
          position: "absolute",
          left: `${perspX}%`,
          top: `${perspY + size * 0.55}%`,
          width: `${shadowSize}%`,
          height: `${shadowSize * 0.35}%`,
          background: "rgba(0,0,0,0.4)",
          filter: `blur(${shadowSize * 0.25}px)`,
          borderRadius: "50%",
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
          opacity: shadowOpacity,
          zIndex: 1,
        }}
      />

      {/* Ball */}
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
        }}
      />
    </>
  );
}
