"use client";

import { useEffect, useState } from "react";

/**
 * RimSparks
 * Shows a short burst of sparks when a ball hits the rim.
 *
 * Props:
 *  - x, y: position in % for spark origin (from ActiveBasketballPage)
 *  - active: boolean to trigger the spark animation
 */

export default function RimSparks({
  x,
  y,
  active,
}: {
  x: number;
  y: number;
  active: boolean;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) return;

    // Show sparks for 250ms
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 250);
    return () => clearTimeout(t);
  }, [active]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        width: 40,
        height: 40,
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
        zIndex: 20,
      }}
    >
      {/* Spark particles */}
      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "yellow",
            boxShadow: "0 0 10px orange",
            animation: `spark-move-${i} 0.25s ease-out forwards`,
          }}
        />
      ))}

      {/* Animations */}
      <style>{`
        @keyframes spark-move-0 {
          from { transform: translate(0,0); opacity: 1; }
          to   { transform: translate(-20px, -10px); opacity: 0; }
        }
        @keyframes spark-move-1 {
          from { transform: translate(0,0); opacity: 1; }
          to   { transform: translate(20px, -10px); opacity: 0; }
        }
        @keyframes spark-move-2 {
          from { transform: translate(0,0); opacity: 1; }
          to   { transform: translate(-10px, 20px); opacity: 0; }
        }
        @keyframes spark-move-3 {
          from { transform: translate(0,0); opacity: 1; }
          to   { transform: translate(10px, 20px); opacity: 0; }
        }
        @keyframes spark-move-4 {
          from { transform: translate(0,0); opacity: 1; }
          to   { transform: translate(-25px, 5px); opacity: 0; }
        }
        @keyframes spark-move-5 {
          from { transform: translate(0,0); opacity: 1; }
          to   { transform: translate(25px, 5px); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
