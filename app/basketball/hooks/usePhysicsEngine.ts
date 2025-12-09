"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/* ---------------------------------------------------------
   Ball Type
--------------------------------------------------------- */
export interface BallState {
  id: string;
  lane: number;
  x: number;   // percentage (0–100)
  y: number;   // percentage (0–100)
  vx: number;
  vy: number;
  size: number;
  active: boolean;
  grounded?: boolean;  // NEW
  rainbow?: boolean;
  fire?: boolean;
}

/* ---------------------------------------------------------
   Physics Constants
--------------------------------------------------------- */
const GRAVITY = 0.55;
const LAUNCH_POWER = 3.4;

const AIR_FRICTION = 0.992;
const GROUND_FRICTION = 0.92;

const FLOOR_Y = 108;     // percent
const RIM_Y = 16.5;
const RIM_WIDTH = 20;
const SIDE_WALL_LEFT = 20;
const SIDE_WALL_RIGHT = 80;

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
      const b: BallState = {
        id: crypto.randomUUID(),
        lane,
        x: 50,
        y: 94,
        vx: (Math.random() - 0.5) * 1.4,
        vy: -power * LAUNCH_POWER * (1 + Math.random() * 0.03),
        size: 20,
        active: true,
        grounded: false,
        rainbow: effects?.rainbow,
        fire: effects?.fire,
      };

      setBalls((prev) => {
        const copy = prev.map((laneBalls) => [...laneBalls]);

        // KEEP ONLY 6 BALLS TOTAL (1 active + 5 ground)
        if (copy[lane].length >= 6) {
          // remove OLDEST grounded ball
          const idx = copy[lane].findIndex((x) => x.grounded);
          if (idx !== -1) copy[lane].splice(idx, 1);
          else copy[lane].shift(); // fallback if none grounded
        }

        copy[lane].push(b);
        return copy;
      });
    },
    []
  );

  /* ---------------------------------------------------------
     Step Physics Loop
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

                // -----------------------------------
                // FLOOR CONTACT
                // -----------------------------------
                if (ball.grounded) {
                  ball.vx *= GROUND_FRICTION;

                  ball.x += ball.vx;

                  // Stop completely if almost still
                  if (Math.abs(ball.vx) < 0.05) {
                    ball.vx = 0;
                  }

                  return { ...ball };
                }

                // -----------------------------------
                // AIR PHYSICS
                // -----------------------------------
                ball.vy += GRAVITY * (delta / 16.67);
                ball.x += ball.vx;
                ball.y += ball.vy;

                ball.vx *= AIR_FRICTION;
                ball.vy *= AIR_FRICTION;

                // -----------------------------------
                // RIM COLLISION
                // -----------------------------------
                const inRimBand = ball.y > RIM_Y - 2 && ball.y < RIM_Y + 2;
                const inRimWidth =
                  ball.x > 50 - RIM_WIDTH / 2 &&
                  ball.x < 50 + RIM_WIDTH / 2;

                if (inRimBand && inRimWidth) {
                  ball.vy *= -0.48;
                  ball.vx *= 0.8;
                }

                // -----------------------------------
                // SIDE WALLS
                // -----------------------------------
                if (ball.x < SIDE_WALL_LEFT) {
                  ball.x = SIDE_WALL_LEFT;
                  ball.vx *= -0.55;
                }

                if (ball.x > SIDE_WALL_RIGHT) {
                  ball.x = SIDE_WALL_RIGHT;
                  ball.vx *= -0.55;
                }

                // -----------------------------------
                // FLOOR COLLISION → become grounded ball
                // -----------------------------------
                if (ball.y > FLOOR_Y) {
                  ball.y = FLOOR_Y;
                  ball.vy = 0;
                  ball.grounded = true;
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
     Start Loop
  --------------------------------------------------------- */
  useEffect(() => {
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [step]);

  return { balls, spawnBall };
}
