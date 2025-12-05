"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

/* NEW 80/20 PHYSICS ENGINE */
import {
  computeArcY,
  computeArcX,
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
  progress: number;
  power: number;
  spin: number;
  x: number;
  y: number;
  scale: number;
  rimShake: "soft" | "medium" | "hard" | null;
  netStage: 0 | 1 | 2;
}

/* ------------------------------------------------------------
   REAL SCREEN DEPTH — RIM MUST BE DEEPER
------------------------------------------------------------ */
const RIM_Y = 48;     // was 24 → WAY too close
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
      netStage: 0,
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

      /* --------------------------------------------------------
         NEW TRAJECTORY (deep, realistic)
      -------------------------------------------------------- */
      const arcY = computeArcY(progress, power); // true parabola
      let y = 4 + arcY;

      let x = computeArcX(progress, power, spin); // forward + curve

      const scale = 1 - progress * 0.45;

      /* --------------------------------------------------------
         PHYSICAL OBJECTS
      -------------------------------------------------------- */
      const rim = { x: 0, y: RIM_Y, width: RIM_WIDTH };
      const board = { x: 0, y: 36, width: 40 }; 
      // moved board deeper (was 18)

      /* --------------------------------------------------------
         20% ARCADE RIM ASSIST
      -------------------------------------------------------- */
      x += rimAssist({ x, y }, rim);

      /* --------------------------------------------------------
         BACKBOARD COLLISION
      -------------------------------------------------------- */
      if (detectBackboardCollision({ x, y }, 18 * scale, board)) {
        x += bounceHorizontal(x, power);
        y += bounceVertical(y, power);
      }

      /* --------------------------------------------------------
         RIM COLLISION + RATTLE
      -------------------------------------------------------- */
      const rimHit = detectRimCollision({ x, y }, 18 * scale, rim);

      if (rimHit) {
        const deflect = rimDeflect(x, rim.x, spin);

        if (lipOutChance(power, spin)) {
          x += deflect;
          y += rimRattle(power);
        } else {
          x += deflect * 0.5;
          y += rimRattle(power) * 0.5;
        }
      }

      /* --------------------------------------------------------
         AUTO-SCORE WINDOW
      -------------------------------------------------------- */
      if (progress > 0.82 && progress < 0.93) {
        const player = players.find((p) => p.cell === lane);
        if (player) {
          supabase.from("bb_game_players")
            .update({ score: player.score + 1 })
            .eq("id", player.id);
        }
      }

      /* --------------------------------------------------------
         END ANIMATION
      -------------------------------------------------------- */
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

      /* --------------------------------------------------------
         FRAME UPDATE
      -------------------------------------------------------- */
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
          netStage: rimHit ? (power < 0.66 ? 1 : 2) : 0,
        };
        return next;
      });
    }, 16);
  }

  /* -----------------------------------------------------------
     LISTEN FOR shot_fired
  ----------------------------------------------------------- */
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
