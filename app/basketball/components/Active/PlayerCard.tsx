"use client";

import React, { useEffect, useRef, useState } from "react";

type PlayerCardProps = {
  index: number;
  borderColor: string;
  score: number;
  animationName?: string | null;
};

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

    cancelAnimationFrame(rafRef.current!);

    const isHit = animationName.includes("hit");
    const missLeft = animationName.includes("left");
    const missRight = animationName.includes("right");
    const missLong = animationName.includes("long");

    const ball = ballRef.current;
    const start = performance.now();

    setShooting(true);

    function animate(now: number) {
      const t = Math.min((now - start) / 900, 1);

      const arc = -4 * 260 * (t - 0.5) ** 2 + 260;

      let x = 0;
      let y = arc;
      let scale = 1 - t * 0.5;

      if (t === 1) {
        if (isHit) {
          y = 160;
          scale = 0.42;
        } else {
          y = 70;
          scale = 0.46;
          if (missLeft) x = -90;
          if (missRight) x = 90;
          if (missLong) y = 120;
        }
      }

      ball.style.transform = `
        translate(calc(-50% + ${x}px), ${-y}px)
        scale(${scale})
      `;

      if (t < 1) rafRef.current = requestAnimationFrame(animate);
      else setShooting(false);
    }

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current!);
  }, [animationName]);

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
      <div style={{ position: "absolute", top: 8, left: 10, fontWeight: 800 }}>
        P{index + 1}
      </div>

      <div style={{ position: "absolute", top: 8, right: 10, fontSize: 32 }}>
        {score}
      </div>

      {shooting && (
        <img
          ref={ballRef}
          src="/ball.png"
          style={{
            position: "absolute",
            left: "50%",
            bottom: "72%",
            width: 90,
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}
