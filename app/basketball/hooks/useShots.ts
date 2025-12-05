"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

/* Physics imports */
import {
  computeDepth,
  computeArcVertical,
  projectScreenY,
  spinDrift,
  detectRimCollision,
  detectBackboardCollision,
  rimDeflect,
  rimRattle,
  lipOutChance,
  bounceVertical,
  bounceHorizontal,
  rimAssist
} from "@/app/basketball/utils/physics";

interface Player {
  id: string;
  cell: number;
  score: number;
}

export interface BallState {
  active: boolean;
  phase: "forward" | "return";
  depth: number;     // 0 → 1 toward rim
  progress: number;  // animation progress for current phase
  power: number;
  spin: number;
  x: number;         // horizontal drift only
  y: number;         // screen Y
  scale: number;     // screen scale for 2.5D effect
  rimShake: "soft" | "medium" | "hard" | null;
  netStage: 0 | 1 | 2;
}

/* ============================================================
   GLOBAL TUNING CONSTANTS
============================================================ */

// Screen positions inside PlayerCard
const FLOOR_Y = 4;     // bottom of card where ball starts
const RIM_Y = 48;      // vertical rim height (Option B confirmed)

// Depth-to-scale mapping
const BALL_START_SCALE = 1.0;
const BALL_FAR_SCALE = 0.45;

// Collision radii
const BALL_RADIUS = 18;

/* Rim + backboard geometry (screen coords) */
const RIM = { x: 0, y: RIM_Y, width: 14 };
const BACKBOARD = { x: 0, y: RIM_Y - 6, width: 38 };

/* ============================================================
   MAIN HOOK
============================================================ */
export function useShots(gameId: string, players: Player[]) {
  const [ballAnimations, setBallAnimations] = useState<BallState[]>(
    Array.from({ length: 10 }, () => ({
      active: false,
      phase: "forward",
      depth: 0,
      progress: 0,
      power: 0,
      spin: 0,
      x: 0,
      y: FLOOR_Y,
      scale: BALL_START_SCALE,
      rimShake: null,
      netStage: 0
    }))
  );

  /* ============================================================
     ANIMATE A SHOT
============================================================ */
  function animateShot(lane: number, power: number) {
    if (lane < 0 || lane > 9) return;

    const spin = power;

    // Reset starting state
    setBallAnimations(prev => {
      const next = [...prev];
      next[lane] = {
        active: true,
        phase: "forward",
        depth: 0,
        progress: 0,
        power,
        spin,
        x: 0,
        y: FLOOR_Y,
        scale: BALL_START_SCALE,
        rimShake: null,
        netStage: 0
      };
      return next;
    });

    let step = 0;
    const totalSteps = 70;

    const interval = setInterval(() => {
      step++;
      const globalProgress = step / totalSteps;

      setBallAnimations(prev => {
        const next = [...prev];
        const ball = next[lane];
        if (!ball.active) return next;

        /* ---------------------------------------------------------
           PHASE 1: Forward toward rim (depth increases)
        --------------------------------------------------------- */
        if (ball.phase === "forward") {
          const depth = computeDepth(globalProgress);
          ball.depth = depth;
          ball.progress = globalProgress;

          // Vertical arc component
          const arcVertical = computeArcVertical(depth, ball.power);

          // Convert arc + depth → on-screen Y
          ball.y = projectScreenY(depth, arcVertical, FLOOR_Y, RIM_Y);

          // Ball scale (depth illusion)
          ball.scale =
            BALL_START_SCALE -
            depth * (BALL_START_SCALE - BALL_FAR_SCALE);

          // Spin drift + rim assist
          ball.x = spinDrift(depth, spin);
          ball.x += rimAssist({ x: ball.x, y: ball.y }, RIM);

          /* -----------------------------
             Backboard collision
          ----------------------------- */
          if (
            detectBackboardCollision(
              { x: ball.x, y: ball.y },
              BALL_RADIUS * ball.scale,
              BACKBOARD
            )
          ) {
            ball.y += bounceVertical(ball.y, ball.power);
          }

          /* -----------------------------
             Rim collision
          ----------------------------- */
          const rimHit = detectRimCollision(
            { x: ball.x, y: ball.y },
            BALL_RADIUS * ball.scale,
            RIM
          );

          if (rimHit) {
            if (lipOutChance(ball.power, ball.spin)) {
              ball.x += rimDeflect(ball.x, RIM.x, ball.spin);
              ball.y += rimRattle(ball.power);
            } else {
              ball.x += rimDeflect(ball.x, RIM.x, ball.spin) * 0.5;
              ball.y += rimRattle(ball.power) * 0.4;
            }

            // Briefly animate rim shake
            ball.rimShake =
              ball.power < 0.33 ? "soft" :
              ball.power < 0.66 ? "medium" :
              "hard";

            // Switch to RETURN PHASE
            ball.phase = "return";
            ball.progress = 0;
          }

          /* -----------------------------
             Score window
          ----------------------------- */
          if (globalProgress > 0.83 && globalProgress < 0.95) {
            const player = players.find(p => p.cell === lane);
            if (player) {
              supabase
                .from("bb_game_players")
                .update({ score: player.score + 1 })
                .eq("id", player.id);
            }
          }

          /* -----------------------------
             If forward motion ends → return
          ----------------------------- */
          if (globalProgress >= 1) {
            ball.phase = "return";
            ball.progress = 0;
          }

          return next;
        }

        /* ---------------------------------------------------------
           PHASE 2: Ball returns to player (grows + falls)
        --------------------------------------------------------- */
        if (ball.phase === "return") {
          ball.progress += 0.04;
          const p = ball.progress;

          // Move from rim back down to floor
          ball.y = RIM_Y + (FLOOR_Y - RIM_Y) * p;

          // Scale grows back toward 1.0
          ball.scale =
            BALL_FAR_SCALE + (BALL_START_SCALE - BALL_FAR_SCALE) * p;

          // Drift slightly on return
          ball.x += spin * 0.2;

          // End animation
          if (p >= 1) {
            ball.active = false;
            ball.depth = 0;
            ball.x = 0;
            ball.y = FLOOR_Y;
            ball.scale = BALL_START_SCALE;
          }
        }

        return next;
      });

      if (step >= totalSteps * 2) clearInterval(interval);
    }, 16);
  }

  /* ============================================================
     LISTEN FOR shot_fired
============================================================ */
  useEffect(() => {
    const channel = supabase
      .channel(`basketball-${gameId}`)
      .on("broadcast", { event: "shot_fired" }, ({ payload }) => {
        animateShot(payload.lane_index, payload.power);
      })
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, [gameId, players]);

  return ballAnimations;
}
