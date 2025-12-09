"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface BallState {
  id: string;
  lane: number;

  // Screen-space (0–100)
  x: number; // horizontal
  y: number; // vertical

  // Depth into scene
  z: number; // 0 = shooter, 1 = rim, >1 = backboard

  // Velocities
  vx: number;
  vy: number;
  vz: number;

  size: number; // base size, scaled in renderer
  active: boolean;

  rainbow?: boolean;
  fire?: boolean;
}

/* ---------------------------------------------------------
   PHYSICS CONSTANTS — TUNED FOR 3D TUNNEL BACKGROUND
--------------------------------------------------------- */

// Slightly lighter gravity for longer hang-time
const GRAVITY = 0.00225;

// Global drag
const DRAG = 0.992;

// Remove ball beyond this depth
const FLOOR_Z = 1.2;

/* --- Rim + Backboard geometry --- */

const RIM_Z = 0.9;
const RIM_X = 50;
const RIM_Y = 18;
const RIM_RADIUS = 5.2;

const BACKBOARD_Z = 1.02;
const BACKBOARD_BOUNCE = -0.6;

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
     SPAWN BALL
     (matches new BallRenderer perspective)
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

        // Start near shooter
        x: 50,
        y: 94,
        z: 0,

        // Tuned for realistic arc inside 3D tunnel
        vx: vx * 0.12,
        vy: vy * 0.62,
        vz: 0.06 + power * 0.045,

        size: 30,
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
     STEP PHYSICS — runs every animation frame
--------------------------------------------------------- */
  const step = useCallback(
    (t: number) => {
      if (lastTime.current == null) {
        lastTime.current = t;
      }
      const dt = (t - lastTime.current) * 0.06;
      lastTime.current = t;

      if (gameRunning) {
        setBalls((prev) =>
          prev.map((laneBalls) =>
            laneBalls
              .map((ball) => {
                if (!ball.active) return ball;

                /* --- GRAVITY --- */
                ball.vy += GRAVITY * dt;

                /* --- INTEGRATE POSITION --- */
                ball.x += ball.vx * dt;
                ball.y += ball.vy * dt;
                ball.z += ball.vz * dt;

                /* -------------------------------------------
                   RIM COLLISION (3D ring, matches background)
                -------------------------------------------- */
                if (Math.abs(ball.z - RIM_Z) < 0.05) {
                  const dx = ball.x - RIM_X;
                  const dy = ball.y - RIM_Y;
                  const dist = Math.sqrt(dx * dx + dy * dy);

                  if (dist < RIM_RADIUS) {
                    const nx = dx / (dist || 1);
                    const ny = dy / (dist || 1);

                    const dot = ball.vx * nx + ball.vy * ny;

                    const BOUNCE = 0.6;
                    ball.vx -= 2 * dot * nx * BOUNCE;
                    ball.vy -= 2 * dot * ny * BOUNCE;

                    ball.vz *= 0.85; // lose a little forward energy
                  }
                }

                /* -------------------------------------------
                   BACKBOARD COLLISION (behind rim)
                -------------------------------------------- */
                if (ball.z >= BACKBOARD_Z) {
                  ball.z = BACKBOARD_Z;
                  ball.vz *= BACKBOARD_BOUNCE;
                  ball.vx *= 0.8;
                  ball.vy *= 0.8;
                }

                /* --- DRAG --- */
                ball.vx *= DRAG;
                ball.vy *= DRAG;
                ball.vz *= DRAG;

                /* --- SIZE SHRINKS WITH DEPTH (matches renderer) --- */
                const depth = Math.min(Math.max(ball.z, 0), 1.1);
                ball.size = 30 * (1 - depth * 0.6); // 30 → ~12

                /* --- REMOVE BALL WHEN OUT OF VIEW --- */
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

  /* ---------------------------------------------------------
     START / STOP LOOP
--------------------------------------------------------- */
  useEffect(() => {
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [step]);

  return { balls, spawnBall };
}
