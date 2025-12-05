"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

/* Physics imports */
import {
  gravityEase,
  detectRimCollision,
  detectBackboardCollision,
  rimDeflect,
  rimRattle,
  lipOutChance,
  bankShotBounce,
  bounceVertical,
  bounceHorizontal
} from "@/app/basketball/utils/physics";

interface Player {
  id: string;
  cell: number;
  score: number;
}

export interface BallState {
  active: boolean;
  progress: number;
  power: number;
  spin: number;
  x: number;
  y: number;
  scale: number;
  rimShake: "soft" | "medium" | "hard" | null;
  netStage: 0 | 1 | 2;
}

const RIM_WIDTH = 14;

/* ============================================================
   HOOK: Shot Listener + Ball Animation Engine
============================================================ */
export function useShots(gameId: string, players: Player[]) {
  const [ballAnimations, setBallAnimations] = useState<BallState[]>(
    Array.from({ length: 10 }, () => ({
      active: false,
      progress: 0,
      power: 0,
      spin: 0,
      x: 0,
      y: 4,
      scale: 1,
      rimShake: null,
      netStage: 0
    }))
  );

  /* -----------------------------------------------------------
     ANIMATE SHOT
  ----------------------------------------------------------- */
  function animateShot(lane: number, power: number) {
    if (lane < 0 || lane > 9) return;

    const spin = power;
    const totalSteps = 62;
    let step = 0;

    // Reset lane ball
    setBallAnimations((prev) => {
      const next = [...prev];
      next[lane] = {
        active: true,
        progress: 0,
        power,
        spin,
        x: 0,
        y: 4,
        scale: 1,
        rimShake: null,
        netStage: 0,
      };
      return next;
    });

    const interval = setInterval(() => {
      step++;

      const progress = step / totalSteps;
      const eased = gravityEase(progress);

      // Basic trajectory
      let x = (progress - 0.5) * (8 + power * 5);
      let y = 4 + eased * (80 + power * 55);
      const scale = 1 - progress * 0.45;

      /* RIM + BOARD CONSTANTS */
      const rim = { x: 0, y: 24, width: RIM_WIDTH * 1 };
      const board = { x: 0, y: 18, width: 40 };

      /* BACKBOARD COLLISION */
      if (detectBackboardCollision({ x, y }, 18 * scale, board)) {
        y += bounceVertical(y, power);
        x += bounceHorizontal(x, power);
      }

      /* RIM COLLISION */
      const rimHit = detectRimCollision({ x, y }, 18 * scale, rim);
      if (rimHit) {
        if (lipOutChance(power, spin)) {
          x += rimDeflect(x, spin);
          y += rimRattle(power);
        } else {
          x += rimDeflect(x, spin) * 0.5;
          y += rimRattle(power) * 0.6;
        }
      }

      /* AUTO-SCORE WINDOW */
      if (progress > 0.85 && progress < 0.94) {
        const player = players.find((p) => p.cell === lane);
        if (player) {
          supabase
            .from("bb_game_players")
            .update({ score: player.score + 1 })
            .eq("id", player.id);
        }
      }

      /* END ANIMATION */
      if (step >= totalSteps) {
        clearInterval(interval);

        setBallAnimations((prev) => {
          const next = [...prev];
          next[lane] = {
            active: false,
            progress: 0,
            power: 0,
            spin: 0,
            x: 0,
            y: 4,
            scale: 1,
            rimShake: null,
            netStage: 0,
          };
          return next;
        });

        return;
      }

      /* FRAME UPDATE */
      setBallAnimations((prev) => {
        const next = [...prev];
        next[lane] = {
          active: true,
          progress,
          power,
          spin,
          x,
          y,
          scale,
          rimShake: rimHit
            ? power < 0.33
              ? "soft"
              : power < 0.66
              ? "medium"
              : "hard"
            : null,
          netStage: rimHit ? (power < 0.66 ? 1 : 2) : 0
        };
        return next;
      });
    }, 16);
  }

  /* -----------------------------------------------------------
     LISTEN FOR Supabase "shot_fired" broadcast
  ----------------------------------------------------------- */
  useEffect(() => {
    const channel = supabase
      .channel(`basketball-${gameId}`)
      .on("broadcast", { event: "shot_fired" }, ({ payload }) => {
        const { lane_index, power } = payload;
        animateShot(lane_index, power);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [gameId, players]);

  return ballAnimations;
}
