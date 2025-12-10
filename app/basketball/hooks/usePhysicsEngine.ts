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

  scored?: boolean;
  swish?: boolean;
  zoneHit?: boolean;
}

/* ----------------------------------------------------------
   🎯 NBA ARCADE PHYSICS — HIGH RAINBOW ARC
----------------------------------------------------------- */
export const SETTINGS = {
  /* Spawn (matches preview ball visually) */
  SPAWN_X: 50,
  SPAWN_Y: 82,
  SPAWN_Z: 0,
  SPAWN_SIZE: 200,

  /* Swipe → Velocity mapping */
  VX_MULT: 0.0022,      // horizontal effect
  VY_SWipe_MULT: 0.25,  // converts swipe to upward velocity
  VY_BASE: 1.65,        // ⭐ THE MAGIC NUMBER → strong NBA arc lift
  VZ_BASE: 0.002,       // slow forward motion for high arc
  VZ_POWER_MULT: 0.001, // power adds small extra push forward

  /* Arc curvature */
  ARC_MULT: 1.35,       // exaggerates arc shape

  /* Gravity */
  GRAVITY: 0.0048,      // soft gravity for long rainbow shots
  DRAG: 0.985,          // smoother flight

  /* Rim + Backboard */
  RIM_X: 50,
  RIM_Y: 18,
  RIM_Z: 0.88,
  RIM_RADIUS: 7,
  BACKBOARD_Z: 1.02,

  RIM_BOUNCE: 0.55,
  RIM_SOFTEN: 0.75,

  /* Removal bounds */
  MAX_Z: 1.25,
  MAX_Y: 130,
  MIN_Y: -20,
};

/* ----------------------------------------------------------
   MAIN ENGINE
----------------------------------------------------------- */
export function usePhysicsEngine(
  gameRunning: boolean,
  registerScore?: (laneIndex: number, points: number, swish: boolean) => void
) {
  const [balls, setBalls] = useState<BallState[][]>(
    Array.from({ length: 10 }, () => [])
  );

  const rafRef = useRef<number | null>(null);
  const lastTime = useRef<number | null>(null);

  /* ----------------------------------------------------------
     SPAWN BALL — NBA ARC VERSION
----------------------------------------------------------- */
  const spawnBall = useCallback(
    (lane: number, power: number, fx: any, swipeVX: number, swipeVY: number) => {
      const vyUpward =
        swipeVY * SETTINGS.VY_SWipe_MULT * SETTINGS.ARC_MULT +
        SETTINGS.VY_BASE;

      const vzForward =
        SETTINGS.VZ_BASE + power * SETTINGS.VZ_POWER_MULT;

      const b: BallState = {
        id: crypto.randomUUID(),
        lane,

        x: SETTINGS.SPAWN_X,
        y: SETTINGS.SPAWN_Y,
        z: SETTINGS.SPAWN_Z,

        vx: swipeVX * SETTINGS.VX_MULT,
        vy: vyUpward,       // ⭐ GOES UP FIRST
        vz: vzForward,      // ⭐ SLOW FORWARD PUSH (NBA arc)

        size: SETTINGS.SPAWN_SIZE,
        active: true,

        scored: false,
        swish: false,
        zoneHit: fx?.zoneHit ?? false,
      };

      setBalls((prev) => {
        const arr = prev.map((r) => [...r]);
        arr[lane].push(b);
        return arr;
      });
    },
    []
  );

  /* ----------------------------------------------------------
     PHYSICS LOOP — DOWNWARD CURVE + FORWARD MOTION
----------------------------------------------------------- */
  const step = useCallback(
    (t: number) => {
      if (lastTime.current == null) lastTime.current = t;
      const dt = (t - lastTime.current) * 0.075;
      lastTime.current = t;

      if (gameRunning) {
        setBalls((prev) =>
          prev.map((laneBalls) =>
            laneBalls
              .map((ball) => {
                if (!ball.active) return ball;

                /* Gravity, adjusted for high arc */
                ball.vy -= SETTINGS.GRAVITY * dt;

                /* Update position */
                ball.x += ball.vx * dt;
                ball.y -= ball.vy * dt;     // ⭐ smaller y = higher on screen
                ball.z += ball.vz * dt;

                /* Perspective depth */
                const depth = Math.min(ball.z, 1);
                const perspective = Math.pow(1 - depth, 2.15);
                ball.size = SETTINGS.SPAWN_SIZE * perspective;

                /* Rim scoring */
                const near =
                  ball.z > SETTINGS.RIM_Z - 0.02 &&
                  ball.z < SETTINGS.RIM_Z + 0.02;

                if (near && !ball.scored) {
                  const dx = ball.x - SETTINGS.RIM_X;
                  const dy = ball.y - SETTINGS.RIM_Y;
                  const dist = Math.sqrt(dx * dx + dy * dy);

                  if (dist < SETTINGS.RIM_RADIUS * 0.65) {
                    ball.scored = true;
                    ball.swish = ball.zoneHit === true;
                    registerScore?.(ball.lane, 2, ball.swish);
                  }
                }

                /* Rim collision */
                const dx = ball.x - SETTINGS.RIM_X;
                const dy = ball.y - SETTINGS.RIM_Y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (Math.abs(ball.z - SETTINGS.RIM_Z) < 0.05 && dist < SETTINGS.RIM_RADIUS) {
                  const nx = dx / (dist || 1);
                  const ny = dy / (dist || 1);
                  const dot = ball.vx * nx + ball.vy * ny;

                  ball.vx -= 2 * dot * nx * SETTINGS.RIM_BOUNCE;
                  ball.vy -= 2 * dot * ny * SETTINGS.RIM_BOUNCE;
                  ball.vz *= SETTINGS.RIM_SOFTEN;
                }

                /* Backboard collision */
                if (ball.z >= SETTINGS.BACKBOARD_Z) {
                  ball.z = SETTINGS.BACKBOARD_Z;
                  ball.vz *= -0.55;
                  ball.vx *= 0.8;
                  ball.vy *= 0.8;
                }

                /* Air resistance */
                ball.vx *= SETTINGS.DRAG;
                ball.vy *= SETTINGS.DRAG;
                ball.vz *= SETTINGS.DRAG;

                /* Out of bounds */
                if (
                  ball.z > SETTINGS.MAX_Z ||
                  ball.y > SETTINGS.MAX_Y ||
                  ball.y < SETTINGS.MIN_Y
                ) {
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
    return () =>
      rafRef.current && cancelAnimationFrame(rafRef.current);
  }, [step]);

  return { balls, spawnBall };
}
