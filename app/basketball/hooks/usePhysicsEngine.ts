"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface BallState {
  id: string;
  lane: number;

  x: number; // screen %
  y: number; // screen %
  z: number; // depth (0 = near player, 1 = rim)

  vx: number; // sideways
  vy: number; // up/down
  vz: number; // forward depth

  size: number;
  active: boolean;

  rainbow?: boolean;
  fire?: boolean;
}

/* ---------------------------------------------------------
   POP-A-SHOT ARCADE PHYSICS CONSTANTS
--------------------------------------------------------- */

// Gravity → strong, arcade feel
const GRAVITY = 0.0075;

// Drag → minimal slowdown
const DRAG = 0.985;

// Rim bucket depth
const RIM_Z = 0.88;

// Backboard plane depth
const BACKBOARD_Z = 1.02;

// Remove ball when too far
const MAX_Z = 1.25;

/* Rim geometry (from your PlayerCard) */
const RIM_X = 50;
const RIM_Y = 18;
const RIM_RADIUS = 7;

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
     SPAWN BALL (Pop-A-Shot tuned)
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

        // Arcade tuning → big arc, forgiving control
        vx: vx * 0.09,           // slight side movement
        vy: vy * 0.45,           // upward boost
        vz: 0.030 + power * 0.030, // forward depth

        size: 50, // matches your visual scale
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
     PHYSICS LOOP
--------------------------------------------------------- */
  const step = useCallback(
    (t: number) => {
      if (lastTime.current == null) lastTime.current = t;
      const dt = (t - lastTime.current) * 0.065;
      lastTime.current = t;

      if (gameRunning) {
        setBalls((prev) =>
          prev.map((laneBalls) =>
            laneBalls
              .map((ball) => {
                if (!ball.active) return ball;

                /* GRAVITY */
                ball.vy += GRAVITY * dt;

                /* MOVE */
                ball.x += ball.vx * dt;
                ball.y += ball.vy * dt;
                ball.z += ball.vz * dt;

                /* -------------------------------
                   RIM COLLISION (Circle in 3D)
                --------------------------------*/
                if (Math.abs(ball.z - RIM_Z) < 0.05) {
                  const dx = ball.x - RIM_X;
                  const dy = ball.y - RIM_Y;
                  const dist = Math.sqrt(dx * dx + dy * dy);

                  if (dist < RIM_RADIUS) {
                    // Normalize
                    const nx = dx / (dist || 1);
                    const ny = dy / (dist || 1);

                    // Bounce outward
                    const dot = ball.vx * nx + ball.vy * ny;
                    const BOUNCE = 0.55;

                    ball.vx -= 2 * dot * nx * BOUNCE;
                    ball.vy -= 2 * dot * ny * BOUNCE;

                    // Slow depth slightly
                    ball.vz *= 0.8;
                  }
                }

                /* -------------------------------
                   BACKBOARD COLLISION (vertical plane)
                --------------------------------*/
                if (ball.z >= BACKBOARD_Z) {
                  ball.z = BACKBOARD_Z;
                  ball.vz *= -0.55; // bounce toward player
                  ball.vx *= 0.75;
                  ball.vy *= 0.75;
                }

                /* DRAG */
                ball.vx *= DRAG;
                ball.vy *= DRAG;
                ball.vz *= DRAG;

                /* SIZE → shrinks with depth (fake 3D) */
                const depth = Math.min(ball.z, 1.15);
                ball.size = 50 * (1 - depth * 0.55);

                /* DELETE ball past play area */
                if (ball.z > MAX_Z || ball.y > 130 || ball.y < -20) {
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

  useEffect(() => {
    rafRef.current = requestAnimationFrame(step);
    return () => rafRef.current && cancelAnimationFrame(rafRef.current);
  }, [step]);

  return { balls, spawnBall };
}
