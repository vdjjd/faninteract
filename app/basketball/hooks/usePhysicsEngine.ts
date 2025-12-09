"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface BallState {
  id: string;
  lane: number;
  x: number;   // left/right (%)
  y: number;   // vertical (%)
  z: number;   // DEPTH (0 = spawn, 1 = rim)
  vx: number;
  vy: number;
  vz: number;  // forward velocity
  size: number;
  active: boolean;
  rainbow?: boolean;
  fire?: boolean;
}

/* -------------------------------------------
   PHYSICS CONSTANTS
-------------------------------------------- */
const GRAVITY = 0.0038;     // acts on Y only
const DRAG = 0.995;
const FLOOR_Z = 1.15;       // disappears slightly past rim depth
const LAUNCH_POW = 0.022;   // affects vz
const UP_FORCE = 0.018;     // affects vy

export function usePhysicsEngine(gameRunning: boolean) {

  const [balls, setBalls] = useState<BallState[][]>(
    Array.from({ length: 10 }, () => [])
  );

  const rafRef = useRef<number | null>(null);
  const lastTime = useRef<number | null>(null);

  /* -------------------------------------------
     SPAWN BALL
  -------------------------------------------- */
  const spawnBall = useCallback((lane: number, power: number, fx?: any) => {

    const b: BallState = {
      id: crypto.randomUUID(),
      lane,
      x: 50,
      y: 94,
      z: 0,

      vx: (Math.random() - 0.5) * 0.03,
      vy: -power * UP_FORCE,
      vz: power * LAUNCH_POW,   // the REAL forward motion

      size: 38,
      active: true,
      rainbow: fx?.rainbow,
      fire: fx?.fire,
    };

    setBalls(prev => {
      const copy = prev.map(l => [...l]);
      copy[lane].push(b);
      return copy;
    });
  }, []);

  /* -------------------------------------------
     STEP PHYSICS
  -------------------------------------------- */
  const step = useCallback((t: number) => {
    if (!lastTime.current) lastTime.current = t;
    const dt = (t - lastTime.current) * 0.06; // scale for stability
    lastTime.current = t;

    if (gameRunning) {
      setBalls(prev =>
        prev.map(laneBalls =>
          laneBalls
            .map(ball => {
              if (!ball.active) return ball;

              // Gravity
              ball.vy += GRAVITY * dt;

              // Position updates
              ball.x += ball.vx * dt;
              ball.y += ball.vy * dt;
              ball.z += ball.vz * dt;     // DEPTH!

              // Rim zone check (2D)
              const inRimBand = ball.y < 22 && ball.y > 14;
              const inRimWidth = ball.x > 44 && ball.x < 56;

              if (inRimBand && inRimWidth) {
                ball.vy *= -0.32;
                ball.vx *= 0.7;
              }

              // Slow down over time
              ball.vx *= DRAG;
              ball.vy *= DRAG;
              ball.vz *= DRAG;

              // Kill ball past ground / depth
              if (ball.z > FLOOR_Z || ball.y > 120) {
                ball.active = false;
              }

              return { ...ball };
            })
            .filter(b => b.active)
        )
      );
    }

    rafRef.current = requestAnimationFrame(step);
  }, [gameRunning]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(step);
    return () => rafRef.current && cancelAnimationFrame(rafRef.current);
  }, [step]);

  return { balls, spawnBall };
}
