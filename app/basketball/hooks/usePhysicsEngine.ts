"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/* ---------------------------------------------------------
   Ball Type
--------------------------------------------------------- */
export interface BallState {
  id: string;
  lane: number;
  x: number;     // percent-based
  y: number;     // percent-based
  vx: number;    // px velocity
  vy: number;    // px velocity
  size: number;
  active: boolean;
  rainbow?: boolean;
  fire?: boolean;
}

/* ---------------------------------------------------------
   Physics Constants (Tuned for realism)
--------------------------------------------------------- */
const GRAVITY = 0.65;          // px/frame gravity
const LAUNCH_POWER = 14.0;     // MUCH stronger to reach rim
const FRICTION = 0.985;        // for rolling
const FLOOR_Y = 108;           // floor percent

// Rim collisions
const RIM_Y = 16.5;
const RIM_WIDTH = 20;

// Convert px → percent of game board
const PX_TO_PERCENT = 0.12;    // tuned so shots reach rim naturally

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
        x: 50,                 // mid-lane
        y: 94,                 // bottom
        vx: (Math.random() - 0.5) * 10, // px velocity → percent after scaling
        vy: -(power * LAUNCH_POWER),    // upward velocity (px)
        size: 22,              // bigger ball for visibility
        active: true,
        rainbow: effects?.rainbow,
        fire: effects?.fire,
      };

      setBalls((prev) => {
        const copy = prev.map((laneBalls) => [...laneBalls]);

        // Limit ground clutter → max 6 balls per lane
        if (copy[lane].length > 6) copy[lane].shift();

        copy[lane].push(newBall);
        return copy;
      });
    },
    []
  );

  /* ---------------------------------------------------------
     Physics Step (runs every animation frame)
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

                /* ---------------------------------------------------------
                   Apply gravity (in px)
                --------------------------------------------------------- */
                ball.vy += GRAVITY * (delta / 16.67);

                /* ---------------------------------------------------------
                   Convert px velocities into percent movement
                --------------------------------------------------------- */
                ball.x += ball.vx * PX_TO_PERCENT;
                ball.y += ball.vy * PX_TO_PERCENT;

                /* ---------------------------------------------------------
                   Rim collision (soft bounce)
                --------------------------------------------------------- */
                const rimHit =
                  ball.y > RIM_Y - 2 &&
                  ball.y < RIM_Y + 2 &&
                  ball.x > 50 - RIM_WIDTH / 2 &&
                  ball.x < 50 + RIM_WIDTH / 2;

                if (rimHit) {
                  ball.vy *= -0.45;   // bounce upward
                  ball.vx *= 0.7;     // sideways deflection
                }

                /* ---------------------------------------------------------
                   Floor bounce + roll
                --------------------------------------------------------- */
                if (ball.y >= FLOOR_Y) {
                  ball.y = FLOOR_Y;

                  // bounce until it’s basically dead
                  ball.vy *= -0.35;
                  ball.vx *= 0.9;

                  if (Math.abs(ball.vy) < 0.15) {
                    // ball stops moving → despawn
                    ball.active = false;
                  }
                }

                /* ---------------------------------------------------------
                   Wall bounce (keep balls inside lane area)
                --------------------------------------------------------- */
                if (ball.x < 6) {
                  ball.x = 6;
                  ball.vx *= -0.6;
                }
                if (ball.x > 94) {
                  ball.x = 94;
                  ball.vx *= -0.6;
                }

                /* ---------------------------------------------------------
                   Apply friction
                --------------------------------------------------------- */
                ball.vx *= FRICTION;

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
     Start engine loop
  --------------------------------------------------------- */
  useEffect(() => {
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [step]);

  return { balls, spawnBall };
}
