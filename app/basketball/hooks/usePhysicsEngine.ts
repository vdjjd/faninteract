"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface BallState {
  id: string;
  lane: number;

  x: number;   // %
  y: number;   // %
  z: number;   // depth (0 near player → 1 rim)

  vx: number;
  vy: number;
  vz: number;

  size: number;
  active: boolean;

  rainbow?: boolean;
  fire?: boolean;

  // accuracy + scoring
  zoneHit?: boolean;       // ⭐ guaranteed make
  madeExpected?: boolean;  // used for animations
  scored?: boolean;        // ball already scored
  swish?: boolean;         // pure-net animation
}

/* ----------------------------------------------
   CONSTANTS (Pop-A-Shot tuned)
---------------------------------------------- */
const GRAVITY = 0.0075;
const DRAG = 0.985;

const RIM_Z = 0.88;
const BACKBOARD_Z = 1.02;
const MAX_Z = 1.25;

const RIM_X = 50;
const RIM_Y = 18;
const RIM_RADIUS = 7;

/* ----------------------------------------------
   MAIN HOOK
---------------------------------------------- */
export function usePhysicsEngine(
  gameRunning: boolean,
  registerScore?: (laneIndex: number, points: number, swish: boolean) => void
) {
  const [balls, setBalls] = useState<BallState[][]>(
    Array.from({ length: 10 }, () => [])
  );

  const rafRef = useRef<number | null>(null);
  const lastTime = useRef<number | null>(null);

  /* ----------------------------------------------
     SPAWN BALL (with bias from zoneHit)
  ---------------------------------------------- */
  const spawnBall = useCallback(
    (
      lane: number,
      power: number,
      fx: { zoneHit?: boolean; madeExpected?: boolean; rainbow?: boolean; fire?: boolean } = {},
      vx: number,
      vy: number
    ) => {
      let biasVX = vx;
      let biasVY = vy;
      let biasVZ = 0.030 + power * 0.030;

      if (fx.zoneHit) {
        // ⭐ HIT ZONE → strengthened arc
        biasVY *= 1.08;
        biasVZ *= 1.10;
        biasVX *= 0.92;
      } else {
        // Normal physics slight randomness
        biasVY *= 0.96;
        biasVZ *= 0.95;
        biasVX *= 1.06;
      }

      const b: BallState = {
        id: crypto.randomUUID(),
        lane,

        x: 50,
        y: 94,
        z: 0,

        vx: biasVX * 0.09,
        vy: biasVY * 0.45,
        vz: biasVZ,

        size: 50,
        active: true,

        rainbow: fx.rainbow,
        fire: fx.fire,

        // NEW: unified fields
        zoneHit: fx.zoneHit ?? false,
        madeExpected: fx.madeExpected ?? false,
        scored: false,
        swish: false,
      };

      setBalls((prev) => {
        const copy = prev.map((laneBalls) => [...laneBalls]);
        copy[lane].push(b);
        return copy;
      });
    },
    []
  );

  /* ----------------------------------------------
     PHYSICS LOOP
---------------------------------------------- */
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

                /* ----------------------------------------------
                   ⭐ RIM SCORING (HIT ZONE → FORCE MAKE)
                ---------------------------------------------- */
                const nearRim = Math.abs(ball.z - RIM_Z) < 0.03;

                if (nearRim && !ball.scored) {
                  const dx = ball.x - RIM_X;
                  const dy = ball.y - RIM_Y;
                  const dist = Math.sqrt(dx * dx + dy * dy);

                  const insideHoop = dist < RIM_RADIUS * 0.65;

                  if (ball.zoneHit) {
                    // ⭐ ALWAYS MAKE
                    ball.scored = true;
                    ball.swish = true;
                    if (registerScore) registerScore(ball.lane, 2, true);
                  } else if (insideHoop) {
                    // normal physics make
                    ball.scored = true;

                    const isSwish =
                      Math.abs(dx) < 2 && Math.abs(dy) < 2 && ball.vy > 0;

                    ball.swish = isSwish;

                    if (registerScore)
                      registerScore(ball.lane, 2, isSwish);
                  }
                }

                /* ----------------------------------------------
                   RIM COLLISION (BOUNCE)
                ---------------------------------------------- */
                if (Math.abs(ball.z - RIM_Z) < 0.05) {
                  const dx = ball.x - RIM_X;
                  const dy = ball.y - RIM_Y;
                  const dist = Math.sqrt(dx * dx + dy * dy);

                  if (dist < RIM_RADIUS) {
                    const nx = dx / (dist || 1);
                    const ny = dy / (dist || 1);

                    const dot = ball.vx * nx + ball.vy * ny;
                    const BOUNCE = 0.55;

                    ball.vx -= 2 * dot * nx * BOUNCE;
                    ball.vy -= 2 * dot * ny * BOUNCE;
                    ball.vz *= 0.8;
                  }
                }

                /* ----------------------------------------------
                   BACKBOARD COLLISION
                ---------------------------------------------- */
                if (ball.z >= BACKBOARD_Z) {
                  ball.z = BACKBOARD_Z;
                  ball.vz *= -0.55;
                  ball.vx *= 0.75;
                  ball.vy *= 0.75;
                }

                /* DRAG */
                ball.vx *= DRAG;
                ball.vy *= DRAG;
                ball.vz *= DRAG;

                /* DEPTH-BASED SIZE */
                const depth = Math.min(ball.z, 1.15);
                ball.size = 50 * (1 - depth * 0.55);

                /* REMOVE OUT-OF-BOUNDS BALLS */
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
    [gameRunning, registerScore]
  );

  useEffect(() => {
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [step]);

  return { balls, spawnBall };
}
