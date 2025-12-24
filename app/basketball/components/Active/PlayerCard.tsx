"use client";

import React, { useEffect, useRef, useState } from "react";

type PlayerCardProps = {
  index: number;
  borderColor: string;
  score: number;
  animationName?: string | null;
};

/* ============================================================
   CONFIG (LOCK THESE)
============================================================ */

const LANES = 10;
const CENTER_LANE = (LANES - 1) / 2;
const LANE_SPACING = 42;

const BALL_START_BOTTOM = "14%";

// Measured from your image
const HOOP_Y = -245;

/* ============================================================
   PLAYER CARD
============================================================ */

export default function PlayerCard({
  index,
  borderColor,
  score,
  animationName,
}: PlayerCardProps) {
  const ballRef = useRef<HTMLImageElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [shooting, setShooting] = useState(false);

  useEffect(() => {
    if (!animationName || !ballRef.current) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const ball = ballRef.current;
    const start = performance.now();
    const duration = 900;

    // Lane horizontal offset (ONLY X bias)
    const laneOffsetX = (index - CENTER_LANE) * LANE_SPACING;

    setShooting(true);

    function animate(now: number) {
      const t = Math.min((now - start) / duration, 1);

      /* ------------------------------------------------------------
         PURE VERTICAL ARC (NO BIAS EVER)
      ------------------------------------------------------------ */
      const arcHeight = 320;
      const arc = -4 * arcHeight * (t - 0.5) ** 2 + arcHeight;

      const y = -arc;

      /* ------------------------------------------------------------
         PURE HORIZONTAL DRIFT (LINEAR, STABLE)
      ------------------------------------------------------------ */
      const x = laneOffsetX * t;

      /* ------------------------------------------------------------
         SCALE NEAR HOOP ONLY
      ------------------------------------------------------------ */
      let scale = 1;
      if (t > 0.7) {
        const sT = (t - 0.7) / 0.3;
        scale = 1 - sT * 0.55;
      }

      ball.style.transform = `
        translate(${x}px, ${y}px)
        scale(${scale})
      `;

      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setShooting(false);
      }
    }

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [animationName, index]);

  return (
    <div
      style={{
        position: "relative",
        borderRadius: 20,
        border: `5px solid ${borderColor}`,
        backgroundImage: "url('/newbackground.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        overflow: "hidden",
      }}
    >
      {/* PLAYER LABEL */}
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 12,
          fontWeight: 900,
          fontSize: 18,
          color: "#fff",
          textShadow: "1px 1px 2px #000",
        }}
      >
        P{index + 1}
      </div>

      {/* SCORE */}
      <div
        style={{
          position: "absolute",
          top: 10,
          right: 12,
          fontSize: 34,
          fontWeight: 900,
          color: "#fff",
          textShadow: "2px 2px 4px #000",
        }}
      >
        {score}
      </div>

      {/* BALL */}
      <img
        ref={ballRef}
        src="/ball.png"
        alt="Basketball"
        style={{
          position: "absolute",
          left: "50%",
          bottom: BALL_START_BOTTOM,
          width: 90,
          transform: "translateX(-50%)",
          pointerEvents: "none",
          zIndex: 5,
          opacity: shooting ? 1 : 0,
        }}
      />
    </div>
  );
}
