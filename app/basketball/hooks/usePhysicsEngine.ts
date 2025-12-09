"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface BallState {
  id: string;
  lane: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  active: boolean;
  rainbow?: boolean;
  fire?: boolean;
}

/* ---------------------------------------------------------
   Physics constants tuned to your 3D lane & rim bar
--------------------------------------------------------- */

const GRAVITY = 0.00225;
const DRAG = 0.992;
const FLOOR_Z = 1.2;

// Rim/bar collision zone
export const RIM_Z = 0.92;
export const RIM_X = 50;
export const RIM_Y = 18.2;
export const RIM_RADIUS = 6.8;

// Backboard plane
const BACKBOARD_Z = 1.05;
const BACKBOARD_BOUNCE = -0.6;

/* ---------------------------------------------------------
   Hook
--------------------------------------------------------- */

export function usePhysicsEngine(gameRunning: boolean) {
  const [balls, setBalls] = useState<BallState[][]>(
    Array.from({ length: 10 }, () => [])
  );

  const rafRef = useRef<number | null>(null);
  const lastTime = useRef<number | null>(null);

  /* ---------------------------------------------------------
     SPAWN BALL
  --------------------------------------------------------- */
  const spawnBall = useCallback(
    (lane, power, fx = {}, vx, vy) => {
      const b: BallState = {
        id: crypto.randomUUID(),
        lane,

        x: 50,
        y: 94,
        z: 0,

        vx: vx * 0.12,
        vy: vy * 0.62,
        vz: 0.06 + power * 0.045,

        size: 30,
        active: true,
        ...fx,
      };

      setBalls((prev) => {
        const copy = prev.map((x) => [...x]);
        copy[lane].push(b);
        return copy;
      });
    },
    []
  );

  /* ---------------------------------------------------------
     STEP PHYSICS
  --------------------------------------------------------- */
  const step = useCallback(
    (t: number) => {
      if (lastTime.current == null) lastTime.current = t;
      const dt = (t - lastTime.current) * 0.06;
      lastTime.current = t;

      if (gameRunning) {
        setBalls((prev) =>
          prev.map((laneBalls) =>
            laneBalls
              .map((ball) => {
                if (!ball.active) return ball;

                // Gravity
                ball.vy += GRAVITY * dt;

                // Integrate
                ball.x += ball.vx * dt;
                ball.y += ball.vy * dt;
                ball.z += ball.vz * dt;

                /* -----------------------------
                   RIM COLLISION (bar region)
                ------------------------------ */
                const dz = Math.abs(ball.z - RIM_Z);
                if (dz < 0.05) {
                  const dx = ball.x - RIM_X;
                  const dy = ball.y - RIM_Y;
                  const dist = Math.sqrt(dx * dx + dy * dy);

                  if (dist < RIM_RADIUS) {
                    const nx = dx / (dist || 1);
                    const ny = dy / (dist || 1);
                    const dot = ball.vx * nx + ball.vy * ny;

                    ball.vx -= 2 * dot * nx * 0.6;
                    ball.vy -= 2 * dot * ny * 0.6;
                    ball.vz *= 0.85;
                  }
                }

                /* -----------------------------
                   BACKBOARD COLLISION
                ------------------------------ */
                if (ball.z >= BACKBOARD_Z) {
                  ball.z = BACKBOARD_Z;
                  ball.vz *= BACKBOARD_BOUNCE;
                  ball.vx *= 0.8;
                  ball.vy *= 0.8;
                }

                // Drag
                ball.vx *= DRAG;
                ball.vy *= DRAG;
                ball.vz *= DRAG;

                // Shrink with depth
                const depth = Math.min(Math.max(ball.z, 0), 1.1);
                ball.size = 30 * (1 - depth * 0.6);

                // Cleanup
                if (ball.z > FLOOR_Z || ball.y > 120 || ball.y < -10) {
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
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [step]);

  return { balls, spawnBall };
}
