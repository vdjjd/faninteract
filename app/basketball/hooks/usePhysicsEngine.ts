"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface BallState {
  id: string;
  lane: number;

  x: number;   // 0–100% horizontal
  y: number;   // 0–100% vertical
  z: number;   // 0 = near player, 1 = rim depth

  vx: number;  // horizontal velocity
  vy: number;  // vertical velocity
  vz: number;  // forward / depth velocity

  size: number;
  active: boolean;

  rainbow?: boolean;
  fire?: boolean;
}

/* ---------------------------------------------------------
   PHYSICS CONSTANTS (tuned)
--------------------------------------------------------- */
const GRAVITY = 0.0042;    // acts downward
const DRAG = 0.992;        // slows all motion
const FLOOR_Z = 1.15;      // ball disappears past rim zone

/* ---------------------------------------------------------
   usePhysicsEngine
--------------------------------------------------------- */
export function usePhysicsEngine(gameRunning: boolean) {
  const [balls, setBalls] = useState<BallState[][]>(
    Array.from({ length: 10 }, () => [])
  );

  const rafRef = useRef<number | null>(null);
  const lastTime = useRef<number | null>(null);

  /* ---------------------------------------------------------
     SPAWN BALL (NOW USES vx + vy FROM SHOOTER)
  --------------------------------------------------------- */
  const spawnBall = useCallback(
    (
      lane: number,
      power: number,
      fx: { rainbow?: boolean; fire?: boolean } = {},
      vx: number,
      vy: number
    ) => {
      const b: BallState = {
        id: crypto.randomUUID(),
        lane,

        x: 50,
        y: 94,
        z: 0,

        // REAL velocity from swipe gesture
        vx: vx * 0.12,     // sideways influence
        vy: vy * 0.15,     // arc upward
        vz: power * 0.035, // forward depth (controls arc height)

        size: 38,
        active: true,

        rainbow: fx.rainbow,
        fire: fx.fire,
      };

      setBalls((prev) => {
        const copy = prev.map((laneBalls) => [...laneBalls]);
        copy[lane].push(b);
        return copy;
      });
    },
    []
  );

  /* ---------------------------------------------------------
     STEP PHYSICS (runs every animation frame)
  --------------------------------------------------------- */
  const step = useCallback(
    (t: number) => {
      if (!lastTime.current) lastTime.current = t;
      const dt = (t - lastTime.current) * 0.06; // tuning factor
      lastTime.current = t;

      if (gameRunning) {
        setBalls((prev) =>
          prev.map((laneBalls) =>
            laneBalls
              .map((ball) => {
                if (!ball.active) return ball;

                /* --- GRAVITY ACTS DOWNWARD --- */
                ball.vy += GRAVITY * dt;

                /* --- MOVE BALL --- */
                ball.x += ball.vx * dt;
                ball.y += ball.vy * dt;
                ball.z += ball.vz * dt;

                /* --- SIMPLE RIM COLLISION (2D band) --- */
                const inRimBand = ball.y < 22 && ball.y > 14;
                const inRimWidth = ball.x > 44 && ball.x < 56;

                if (inRimBand && inRimWidth) {
                  ball.vy *= -0.32;
                  ball.vx *= 0.7;
                }

                /* --- DRAG SLOWS EVERYTHING --- */
                ball.vx *= DRAG;
                ball.vy *= DRAG;
                ball.vz *= DRAG;

                /* --- REMOVE BALL WHEN TOO FAR --- */
                if (ball.z > FLOOR_Z || ball.y > 120) {
                  ball.active = false;
                }

                return { ...ball };
              })
              .filter((b) => b.active)
          )
        );
      }

      rafRef.current = requestAnimationFrame(step);
    },
    [gameRunning]
  );

  /* ---------------------------------------------------------
     START PHYSICS LOOP
  --------------------------------------------------------- */
  useEffect(() => {
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [step]);

  return { balls, spawnBall };
}
