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
   Physics Constants (tuned)
--------------------------------------------------------- */
const GRAVITY = 0.45;
const LAUNCH_POWER = 3.1;
const FRICTION = 0.99;
const FLOOR_Y = 108;

const RIM_Y = 16.5;
const RIM_WIDTH = 20;

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
     Spawn a new ball
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
        x: 50,
        y: 94,
        vx: (Math.random() - 0.5) * 1.2,
        vy: -power * LAUNCH_POWER * (1 + Math.random() * 0.03),
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
     Step physics (delta time)
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

                ball.vy += GRAVITY * (delta / 16.67);
                ball.x += ball.vx;
                ball.y += ball.vy;

                const inRimBand = ball.y > RIM_Y - 2 && ball.y < RIM_Y + 2;
                const inRimWidth =
                  ball.x > 50 - RIM_WIDTH / 2 &&
                  ball.x < 50 + RIM_WIDTH / 2;

                if (inRimBand && inRimWidth) {
                  ball.vy *= -0.42;
                  ball.vx *= 0.58;
                }

                ball.vx *= FRICTION;

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
