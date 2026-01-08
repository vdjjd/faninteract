"use client";

import React, { useEffect, useRef, useState } from "react";

type Props = {
  laneIndex: number; // 0..9
  playerName: string | null;
  selfieUrl: string | null;
  score: number;
  animationName?: string | null;
  empty?: boolean;
};

const LANES = 10;
const CENTER_LANE = (LANES - 1) / 2;
const LANE_SPACING = 42;
const BALL_START_BOTTOM = "14%";

export default function PlayerCard({
  laneIndex,
  playerName,
  selfieUrl,
  score,
  animationName,
  empty,
}: Props) {
  const ballRef = useRef<HTMLImageElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [shooting, setShooting] = useState(false);

  useEffect(() => {
    if (!animationName || !ballRef.current) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const ball = ballRef.current;
    const start = performance.now();
    const duration = 900;

    const offsetX = (laneIndex - CENTER_LANE) * LANE_SPACING;

    setShooting(true);

    function animate(now: number) {
      const t = Math.min((now - start) / duration, 1);

      const arcHeight = animationName === "dunk" ? 420 : 320;
      const arc = -4 * arcHeight * (t - 0.5) ** 2 + arcHeight;

      const y = -arc;
      const x = offsetX * t;

      let scale = 1;
      if (t > 0.7) {
        const sT = (t - 0.7) / 0.3;
        scale = 1 - sT * 0.55;
      }

      ball.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;

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
  }, [animationName, laneIndex]);

  return (
    <div
      style={{
        position: "relative",
        borderRadius: 20,
        overflow: "hidden",
        border: "2px solid rgba(255,255,255,0.16)",
        background: "rgba(0,0,0,0.45)",
        boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
      }}
    >
      {/* Header row */}
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 12,
          right: 12,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          zIndex: 10,
          gap: 10,
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 18, color: "#fff", textShadow: "1px 1px 2px #000" }}>
          Lane {laneIndex + 1}
        </div>

        <div style={{ fontSize: 34, fontWeight: 900, color: "#fff", textShadow: "2px 2px 4px #000" }}>
          {score}
        </div>
      </div>

      {/* Player */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          paddingTop: 24,
          zIndex: 5,
          gap: 10,
        }}
      >
        {empty ? (
          <>
            <div style={{ fontWeight: 900, fontSize: 22, color: "rgba(255,255,255,0.8)" }}>OPEN</div>
            <div style={{ color: "rgba(255,255,255,0.55)", fontWeight: 700 }}>Waiting for player…</div>
          </>
        ) : (
          <>
            <div
              style={{
                width: 92,
                height: 92,
                borderRadius: 999,
                overflow: "hidden",
                border: "2px solid rgba(255,255,255,0.35)",
                background: "rgba(255,255,255,0.1)",
              }}
            >
              <img
                src={selfieUrl || "/faninteractlogo.png"}
                alt="selfie"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>

            <div style={{ fontWeight: 900, fontSize: 20, color: "#fff", textAlign: "center" }}>
              {playerName || "Player"}
            </div>
          </>
        )}
      </div>

      {/* Ball */}
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
          zIndex: 30,
          opacity: shooting ? 1 : 0,
        }}
      />
    </div>
  );
}
