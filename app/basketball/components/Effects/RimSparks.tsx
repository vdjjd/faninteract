"use client";

import React, { useEffect, useState } from "react";

interface RimSparksProps {
  x: number;       // screen percentage
  y: number;       // screen percentage
  active: boolean; // whether sparks should play
  zIndex?: number; // optional override
}

export default function RimSparks({ x, y, active, zIndex = 160 }: RimSparksProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) return;

    // Show sparks for 120ms
    setVisible(true);

    const timeout = setTimeout(() => {
      setVisible(false);
    }, 120);

    return () => clearTimeout(timeout);
  }, [active]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        transform: "translate(-50%, -50%)",
        width: 34,
        height: 34,
        pointerEvents: "none",
        zIndex,
        backgroundImage: "url('/spark.png')",
        backgroundSize: "contain",
        backgroundRepeat: "no-repeat",
        filter: "drop-shadow(0 0 8px rgba(255,180,0,0.9))",
      }}
    />
  );
}
