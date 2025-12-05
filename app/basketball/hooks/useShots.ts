"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

import {
  BALL_RADIUS,
  RIM_Z,
  FLOOR_Z,
  FRONT_Z,
  computeArc,
  depthToScale,
  projectY,
  spinDrift,
  detectRimCollision,
  applyRimBounce,
  detectBackboardCollision,
  applyBackboardBounce,
  resolveBallCollision,
  updateBall,
} from "@/app/basketball/utils/physics";

interface Player {
  id: string;
  cell: number;
  score: number;
}

/* ============================================================
   BallState MUST MATCH BallPhysics REQUIREMENTS
============================================================ */
export interface BallState {
  id: number;
  active: boolean;

  state: "idle" | "flying" | "falling" | "rolling";

  // physics (FULL BallPhysics compatibility)
  x: number;
  y: number;
  z: number;

  vx: number;
  vy: number;
  vz: number;

  radius: number;     // ← REQUIRED BY PHYSICS ENGINE

  // visual
  scale: number;
  spin: number;

  // effects
  rimShake: "soft" | "medium" | "hard" | null;
  netStage: 0 | 1 | 2;
}

/* ============================================================
   CONSTANTS
============================================================ */

const NUM_BALLS = 5;
const IDLE_SPACING = BALL_RADIUS * 2;
const IDLE_Y = 4;
const IDLE_Z = FRONT_Z;

const RIM = {
  x: 0,
  y: 48,
  z: RIM_Z,
  width: 14,
};

const BACKBOARD = {
  x: 0,
  y: 48 - 6,
  z: RIM_Z + 0.02,
  width: 40,
};

/* ============================================================
   MAIN HOOK
============================================================ */
export function useShots(gameId: string, players: Player[]) {
  /* ------------------------------------------------------------
     INITIAL BALL POOL (5 balls per lane)
  ------------------------------------------------------------ */
  const [laneBalls, setLaneBalls] = useState<BallState[][]>(() =>
    Array.from({ length: 10 }, () =>
      Array.from({ length: NUM_BALLS }, (_, i) => ({
        id: i,
        active: true,
        state: "idle",

        x: 0,
        y: IDLE_Y,
        z: IDLE_Z,

        vx: 0,
        vy: 0,
        vz: 0,

        radius: BALL_RADIUS,  // REQUIRED FIELD

        scale: 1,
        spin: 0,

        rimShake: null,
        netStage: 0,
      }))
    )
  );

  /* ------------------------------------------------------------
     SHOOT ONE BALL FROM A LANE
  ------------------------------------------------------------ */
  function shootBall(lane: number, power: number) {
    setLaneBalls((prev) => {
      const next = [...prev];
      const balls = next[lane];

      const ball = balls.find((b) => b.state === "idle");
      if (!ball) return next;

      ball.state = "flying";
      ball.spin = power;

      ball.vx = 0;
      ball.vy = 0.4 + power * 0.25;
      ball.vz = 0.018 + power * 0.01;

      return next;
    });
  }

  /* ------------------------------------------------------------
     FRAME LOOP: Physics + Collisions
  ------------------------------------------------------------ */
  useEffect(() => {
    const interval = setInterval(() => {
      setLaneBalls((prevLanes) => {
        return prevLanes.map((balls) => {
          /* ---------------------------------------------------
             STEP 1 — INDIVIDUAL BALL PHYSICS
          --------------------------------------------------- */
          balls.forEach((ball) => {
            if (ball.state === "idle") return;

            /* -----------------------------
               FLYING PHASE
            ----------------------------- */
            if (ball.state === "flying") {
              ball.vz = 0.02;
              ball.z += ball.vz;

              const progress = ball.z / RIM_Z;
              const arcY = computeArc(progress, ball.spin);

              ball.y = IDLE_Y + (RIM.y - IDLE_Y) * progress - arcY;

              ball.x = spinDrift(ball.spin, ball.z);

              if (detectRimCollision(ball, RIM)) {
                applyRimBounce(ball);
                ball.state = "falling";
              }

              if (detectBackboardCollision(ball, BACKBOARD)) {
                applyBackboardBounce(ball);
              }

              if (ball.z >= RIM_Z) {
                ball.state = "falling";
              }
            }

            /* -----------------------------
               FALLING PHASE
            ----------------------------- */
            else if (ball.state === "falling") {
              ball.vy -= 0.55; // gravity
              ball.y += ball.vy;
              ball.z += ball.vz;

              if (ball.z >= FLOOR_Z) {
                ball.z = FLOOR_Z;
                ball.vy *= -0.35;

                if (Math.abs(ball.vy) < 1) {
                  ball.state = "rolling";
                  ball.vz = -0.02;
                  ball.vy = 0;
                }
              }
            }

            /* -----------------------------
               ROLLING PHASE
            ----------------------------- */
            else if (ball.state === "rolling") {
              ball.z += ball.vz;

              if (ball.z <= FRONT_Z + 0.01) {
                ball.z = FRONT_Z;
                ball.vz = 0;
                ball.state = "idle";
              }

              ball.x *= 0.92;
            }

            /* Global Physics Update */
            updateBall(ball);

            /* Apply depth scaling */
            ball.scale = depthToScale(ball.z);
          });

          /* ---------------------------------------------------
             STEP 2 — BALL-TO-BALL COLLISIONS
          --------------------------------------------------- */
          for (let i = 0; i < balls.length; i++) {
            for (let j = i + 1; j < balls.length; j++) {
              resolveBallCollision(balls[i], balls[j]);
            }
          }

          /* ---------------------------------------------------
             STEP 3 — ALIGN IDLE BALLS IN FRONT ROW
          --------------------------------------------------- */
          let idleIndex = 0;
          balls.forEach((ball) => {
            if (ball.state === "idle") {
              ball.x = idleIndex * IDLE_SPACING - (IDLE_SPACING * 2);
              ball.y = IDLE_Y;
              ball.z = FRONT_Z;
              ball.vx = ball.vy = ball.vz = 0;
              ball.scale = 1;
              idleIndex++;
            }
          });

          return [...balls];
        });
      });
    }, 16);

    return () => clearInterval(interval);
  }, []);

  /* ------------------------------------------------------------
     LISTEN FOR SHOT EVENTS
  ------------------------------------------------------------ */
  useEffect(() => {
    const channel = supabase
      .channel(`basketball-${gameId}`)
      .on("broadcast", { event: "shot_fired" }, ({ payload }) => {
        shootBall(payload.lane_index, payload.power);
      })
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, [gameId]);

  return laneBalls;
}
