"use client";

import React from "react";

export function Countdown({ preCountdown }: { preCountdown: number | null }) {
  if (preCountdown === null) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.88)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        color: "white",
        fontSize: "clamp(4rem, 10vw, 12rem)",
        fontWeight: 900,
        textShadow: "0 0 60px rgba(255,0,0,0.9)",
        zIndex: 9999,
      }}
    >
      {preCountdown > 0 ? preCountdown : "START!"}
    </div>
  );
}
