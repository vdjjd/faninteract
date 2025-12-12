"use client";

import { useParams } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";

/* =====================================================
   SHOOTER PAGE — SWIPE INTENT ONLY (FOUNDATION)
===================================================== */

export default function ShooterPage() {
  const { gameId } = useParams() as { gameId: string };

  const [laneIndex, setLaneIndex] = useState<number | null>(null);

  /* --------------------------------------------------
     TEMP: assign lane (mock until DB reconnect)
  -------------------------------------------------- */
  useEffect(() => {
    // 🔴 TEMP — pretend this player is lane 3
    setLaneIndex(3);
  }, []);

  /* --------------------------------------------------
     TOUCH TRACKING
  -------------------------------------------------- */
  const touchStartRef = useRef<{
    x: number;
    y: number;
    time: number;
  } | null>(null);

  function handleTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchStartRef.current = {
      x: t.clientX,
      y: t.clientY,
      time: Date.now(),
    };
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (!touchStartRef.current || laneIndex === null) return;

    const start = touchStartRef.current;
    const end = e.changedTouches[0];

    const dx = end.clientX - start.x;
    const dy = end.clientY - start.y;
    const dt = Math.max(Date.now() - start.time, 1);

    const distance = Math.sqrt(dx * dx + dy * dy);

    // Normalize values
    const power = Math.min(distance / 300, 1);
    const angle =
      Math.abs((Math.atan2(-dy, dx) * 180) / Math.PI);

    console.log("🎯 SHOT INTENT", {
      gameId,
      laneIndex,
      dx: Math.round(dx),
      dy: Math.round(dy),
      power: Number(power.toFixed(2)),
      angle: Number(angle.toFixed(1)),
      durationMs: dt,
    });

    touchStartRef.current = null;
  }

  /* --------------------------------------------------
     RENDER
  -------------------------------------------------- */
  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{
        width: "100vw",
        height: "100vh",
        background: "#000",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        touchAction: "none",
        userSelect: "none",
      }}
    >
      <div
        style={{
          textAlign: "center",
          padding: 24,
        }}
      >
        <div
          style={{
            fontSize: 28,
            fontWeight: 900,
            marginBottom: 16,
          }}
        >
          SWIPE UP TO SHOOT
        </div>

        <div
          style={{
            opacity: 0.6,
            fontSize: 16,
          }}
        >
          Lane: {laneIndex ?? "—"}
        </div>
      </div>
    </div>
  );
}
