"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/* ---------------------------------------------------------
   BALL STATE TYPE
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
   🔧 TUNED CONSTANTS — FEEL LIKE REAL ARCADE SHOOTING
--------------------------------------------------------- */

// Ball arc speed
const GRAVITY = 0.62;          // was 0.45 → weak arc → balls float
const LAUNCH_POWER = 2.35;     // was 1.8 → shots were too low

// Horizontal dampening
const FRICTION = 0.987;

// Cleanup
const FLOOR_Y = 108;

// Rim position (in % of PlayerCard height)
const RIM_Y = 16.5;           // FIXED: matches your rendered rim location

// Rim collision width
const RIM_WIDTH = 20;         // was 18 — allows natural bounce forgiveness

/* ---------------------------------------------------------
   PHYSICS ENGINE
--------------------------------------------------------- */
export function usePhysicsEngine(gameRunning: boolean) {
  const [balls, setBalls] = useState<BallState[][]>(
    Array.from({ length: 10 }, () => [])
  );

  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  /* ---------------------------------------------------------
     SPAWN BALL
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
        vx: (Math.random() - 0.5) * 1.8,        // small angle variance
        vy: -power * LAUNCH_POWER * (1 + Math.random() * 0.08),
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
     PHYSICS STEP (smooth, delta-time)
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

                /* -------------------------------------------------
                   RIM COLLISION (FIXED)
                ------------------------------------------------- */
                const inRimBand = ball.y > RIM_Y - 2 && ball.y < RIM_Y + 2;
                const inRimWidth =
                  ball.x > 50 - RIM_WIDTH / 2 &&
                  ball.x < 50 + RIM_WIDTH / 2;

                if (inRimBand && inRimWidth) {
                  ball.vy *= -0.42;     // bounce softness
                  ball.vx *= 0.58;      // slight angle change
                }

                // Horizontal friction
                ball.vx *= FRICTION;

                // Remove ball when off-screen
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
      START LOOP
  --------------------------------------------------------- */
  useEffect(() => {
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [step]);

  return { balls, spawnBall };
}
