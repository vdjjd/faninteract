"use client";

import { useEffect, useImperativeHandle, forwardRef, useRef, useState } from "react";

export type ShotHandle = {
  shoot: () => void;
};

/* --------------------------------------------
   TUNE THESE NUMBERS
--------------------------------------------- */
const HOOP_Y = 120;
const HOOP_X = 50;

const BALL_START_Y = 360;
const BALL_START_X = 50;

const ARC_HEIGHT = 180;
const SHOT_DURATION = 700;
const BALL_SIZE = 90;

/* --------------------------------------------
   SINGLE LANE (EXPORTED HANDLE)
--------------------------------------------- */
const SingleLaneDemo = forwardRef<ShotHandle>(function SingleLaneDemo(_, ref) {
  const [shooting, setShooting] = useState(false);
  const [t, setT] = useState(0);
  const rafRef = useRef<number | null>(null);

  function shoot() {
    if (shooting) return;

    setShooting(true);
    setT(0);

    const start = performance.now();

    function tick(now: number) {
      const progress = Math.min((now - start) / SHOT_DURATION, 1);
      setT(progress);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setTimeout(() => setShooting(false), 200);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
  }

  useImperativeHandle(ref, () => ({ shoot }));

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const y =
    BALL_START_Y -
    Math.sin(Math.PI * t) * ARC_HEIGHT -
    t * (BALL_START_Y - HOOP_Y);

  const scale = 1 - t * 0.45;
  const zIndex = t > 0.72 ? 4 : 12;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#050A18",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* RIM */}
      <div
        style={{
          position: "absolute",
          left: `${HOOP_X}%`,
          top: HOOP_Y,
          transform: "translateX(-50%)",
          width: 140, // 👈 narrower rim
          height: 12,
          background: "#ff6a00",
          borderRadius: 10,
          boxShadow: "0 0 14px rgba(255,120,0,0.9)",
          zIndex: 10,
        }}
      />

      {/* NET */}
      <div
        style={{
          position: "absolute",
          left: `${HOOP_X}%`,
          top: HOOP_Y + 10,
          transform: "translateX(-50%)",
          width: 70,
          height: 50,
          border: "2px solid white",
          borderTop: "none",
          borderRadius: "0 0 26px 26px",
          opacity: t > 0.85 ? 0.6 : 1,
          zIndex: 9,
        }}
      />

      {/* BALL */}
      {shooting && (
        <img
          src="/ball.png"
          alt="ball"
          style={{
            position: "absolute",
            left: `${BALL_START_X}%`,
            top: y,
            transform: `translate(-50%, -50%) scale(${scale})`,
            width: BALL_SIZE,
            height: BALL_SIZE,
            zIndex,
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
});

export default SingleLaneDemo;
