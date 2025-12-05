"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

import {
  computeArcY,
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
  phase: "forward" | "return";      // NEW
  progress: number;
  power: number;
  spin: number;
  x: number;
  y: number;
  scale: number;
  rimShake: "soft" | "medium" | "hard" | null;
  netStage: 0 | 1 | 2;
}

const RIM_Y = 48;   // ← YOU SAID: Use the layout value
const FLOOR_Y = 4;  // ← Bottom of cell
const BALL_START_SCALE = 1;
const BALL_FAR_SCALE = 0.45;

/* ============================================================
   MAIN HOOK
============================================================ */
export function useShots(gameId: string, players: Player[]) {

  const [ballAnimations, setBallAnimations] = useState<BallState[]>(
    Array.from({ length: 10 }, () => ({
      active: false,
      phase: "forward",
      progress: 0,
      power: 0,
      spin: 0,
      x: 0,
      y: FLOOR_Y,
      scale: BALL_START_SCALE,
      rimShake: null,
      netStage: 0,
    }))
  );

  /* ============================================================
     ANIMATE SINGLE SHOT
  ============================================================= */
  function animateShot(lane: number, power: number) {
    if (lane < 0 || lane > 9) return;

    const spin = power;

    setBallAnimations(prev => {
      const next = [...prev];
      next[lane] = {
        active: true,
        phase: "forward",      // start by going toward the rim
        progress: 0,
        power,
        spin,
        x: 0,
        y: FLOOR_Y,
        scale: BALL_START_SCALE,
        rimShake: null,
        netStage: 0,
      };
      return next;
    });

    let step = 0;
    const totalSteps = 70;

    const interval = setInterval(() => {
      step++;
      let progress = step / totalSteps;

      setBallAnimations(prev => {
        const next = [...prev];
        const ball = next[lane];

        if (!ball.active) return next;

        /* --------------------------------------------------------
           PHASE 1: BALL MOVES TOWARD RIM (shrinks)
        -------------------------------------------------------- */
        if (ball.phase === "forward") {
          const arc = computeArcY(progress, power);  // vertical arc

          ball.y = FLOOR_Y + (RIM_Y - FLOOR_Y) * progress - arc;

          // Ball shrinks as it moves “into the screen”
          ball.scale = BALL_START_SCALE - progress * (BALL_START_SCALE - BALL_FAR_SCALE);

          // Small spin drift only
          ball.x = spin * progress * 4;

          const rim = { x: 0, y: RIM_Y, width: 14 };
          const board = { x: 0, y: RIM_Y - 6, width: 40 };

          // Rim collisions
          const rimHit = detectRimCollision({ x: ball.x, y: ball.y }, 18 * ball.scale, rim);

          if (rimHit) {
            if (lipOutChance(power, spin)) {
              ball.x += rimDeflect(ball.x, rim.x, spin);
              ball.y += rimRattle(power);
            } else {
              ball.x += rimDeflect(ball.x, rim.x, spin) * 0.5;
              ball.y += rimRattle(power) * 0.4;
            }

            // Begin “return” phase shortly after rim contact
            ball.phase = "return";
            ball.progress = 0;
          }

          // Backboard
          if (detectBackboardCollision({ x: ball.x, y: ball.y }, 18 * ball.scale, board)) {
            ball.y += bounceVertical(ball.y, power);
          }

          // Score window
          if (progress > 0.8 && progress < 0.95) {
            const player = players.find(p => p.cell === lane);
            if (player) {
              supabase.from("bb_game_players")
                .update({ score: player.score + 1 })
                .eq("id", player.id);
            }
          }

          // Switch to return at the peak if no rim hit
          if (progress >= 1) {
            ball.phase = "return";
            ball.progress = 0;
          }

          return next;
        }

        /* --------------------------------------------------------
           PHASE 2: BALL RETURNS TOWARD PLAYER (grows)
        -------------------------------------------------------- */
        if (ball.phase === "return") {
          ball.progress += 0.03;

          if (ball.progress > 1) ball.progress = 1;

          // interpolate from rim back to floor
          ball.y = RIM_Y + (FLOOR_Y - RIM_Y) * ball.progress;

          // grow ball back to full scale
          ball.scale = BALL_FAR_SCALE + (BALL_START_SCALE - BALL_FAR_SCALE) * ball.progress;

          // slight spin drift
          ball.x += spin * 0.2;

          // End animation
          if (ball.progress >= 1) {
            ball.active = false;
            ball.x = 0;
            ball.y = FLOOR_Y;
            ball.scale = BALL_START_SCALE;
          }

          return next;
        }

        return next;
      });

      if (step >= totalSteps * 2) {
        clearInterval(interval);
      }

    }, 16);
  }

  /* ============================================================
     LISTEN FOR SHOT EVENTS
  ============================================================= */
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
