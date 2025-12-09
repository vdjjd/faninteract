"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/* ---------------------------------------------------------
   Ball Type
--------------------------------------------------------- */
export interface BallState {
  id: string;
  lane: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  active: boolean;
  rainbow?: boolean;
  fire?: boolean;
}

/* ---------------------------------------------------------
   Physics Constants (tuned for visibility)
--------------------------------------------------------- */
const GRAVITY = 0.42;              // slight pull
const LAUNCH_POWER = 3.8;          // stronger arc
const FRICTION = 0.985;            // smoother slowdown
const FLOOR_Y = 108;

const RIM_Y = 18;                  // better alignment
const RIM_WIDTH = 22;              // more forgiving

/* ---------------------------------------------------------
   Main Hook
--------------------------------------------------------- */
export function usePhysicsEngine(gameRunning: boolean) {
  const [balls, setBalls] = useState<BallState[][]>(
    Array.from({ length: 10 }, () => [])
  );

  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  /* ---------------------------------------------------------
     Spawn a new ball — THIS WAS THE MAIN FIX
  --------------------------------------------------------- */
  const spawnBall = useCallback(
    (
      lane: number,
      power: number,
      effects?: { rainbow?: boolean; fire?: boolean }
    ) => {
      const newBall: BallState = {
        id: crypto.randomUUID(),
        lane,
        x: 50,            // centered
        y: 72,            // ⭐ MUCH HIGHER — now visible!
        vx: (Math.random() - 0.5) * 1.4,
        vy: -power * LAUNCH_POWER * (1 + Math.random() * 0.05),
        size: 12,
        active: true,
        rainbow: effects?.rainbow,
        fire: effects?.fire,
      };

      setBalls((prev) => {
        const copy = prev.map((laneBalls) => [...laneBalls]);
        copy[lane].push(newBall);
        return copy;
      });
    },
    []
  );

  /* ---------------------------------------------------------
     Physics Step
  --------------------------------------------------------- */
  const step = useCallback(
    (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const delta = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;

      if (gameRunning) {
        setBalls((prev) =>
          prev.map((laneBalls) =>
            laneBalls
              .map((ball) => {
                if (!ball.active) return ball;

                // Gravity
                ball.vy += GRAVITY * (delta / 16.67);

                // Movement
                ball.x += ball.vx;
                ball.y += ball.vy;

                // Rim collision zone
                const inRimBand = ball.y > RIM_Y - 3 && ball.y < RIM_Y + 3;
                const inRimWidth =
                  ball.x > 50 - RIM_WIDTH / 2 &&
                  ball.x < 50 + RIM_WIDTH / 2;

                // Rim bounce
                if (inRimBand && inRimWidth && ball.vy > 0) {
                  ball.vy *= -0.48;  // pop upward
                  ball.vx *= 0.55;
                }

                // Apply friction
                ball.vx *= FRICTION;

                // Floor kill
                if (ball.y > FLOOR_Y) ball.active = false;

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
     Start loop
  --------------------------------------------------------- */
  useEffect(() => {
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [step]);

  return { balls, spawnBall };
}
