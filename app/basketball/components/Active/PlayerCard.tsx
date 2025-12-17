"use client";

import React, { useEffect, useMemo, useState } from "react";

/* ============================================================
   SHOT PRESETS (PHASE 1 — PROCEDURAL)
============================================================ */

type ShotPreset = {
  xOffset: number;       // horizontal px offset at rim
  arcMultiplier: number; // arc height modifier
  net: boolean;          // net animation
};

const SHOT_PRESETS: Record<string, ShotPreset> = {
  close_hit:        { xOffset: 0,   arcMultiplier: 1.0, net: true },

  close_miss_left:  { xOffset: -22, arcMultiplier: 0.95, net: false },
  close_miss_right: { xOffset: 22,  arcMultiplier: 0.95, net: false },
  close_miss_long:  { xOffset: 0,   arcMultiplier: 1.25, net: false },

  three_hit:        { xOffset: 0,   arcMultiplier: 1.35, net: true },

  three_miss_left:  { xOffset: -32, arcMultiplier: 1.15, net: false },
  three_miss_right: { xOffset: 32,  arcMultiplier: 1.15, net: false },
  three_miss_close: { xOffset: 0,   arcMultiplier: 0.8,  net: false },
};

/* ============================================================
   BASE CONSTANTS
============================================================ */

const RIM_X = 50;
const RIM_Y = 28;

const BALL_START_BOTTOM = 6;
const BALL_END_OFFSET_Y = -6;
const BALL_RADIUS_COMPENSATION = 4;

const BALL_START_SIZE = 80;
const BALL_END_SCALE = 0.52;

const BASE_ARC_PEAK = 240;

// Net
const NET_WIDTH = 45;
const NET_HEIGHT = 34;
const NET_DROP_DISTANCE = 13;
const NET_VERTICAL_OFFSET = 4;

// Timing
const SHOT_DURATION = 900;
const DEPTH_DURATION = 450;
const NET_TRIGGER_TIME = 460;

// Depth
const DEPTH_DROP_Y = 160;
const DEPTH_FORWARD_SHIFT = -1;
const DEPTH_END_SCALE = 0.48;
const DEPTH_OPACITY_END = 100;

/* ============================================================
   COMPONENT
============================================================ */

type PlayerCardProps = {
  index: number;
  borderColor: string;
  score: number;
  animationName?: string | null;
};

export default function PlayerCard({
  index,
  borderColor,
  score,
  animationName,
}: PlayerCardProps) {
  const [shooting, setShooting] = useState(false);
  const [netActive, setNetActive] = useState(false);

  const preset = useMemo<ShotPreset>(() => {
    if (!animationName) return SHOT_PRESETS.close_hit;
    return SHOT_PRESETS[animationName] ?? SHOT_PRESETS.close_hit;
  }, [animationName]);

  useEffect(() => {
    if (!animationName) return;

    setShooting(true);

    if (preset.net) {
      const netTimer = setTimeout(() => setNetActive(true), NET_TRIGGER_TIME);
      return () => clearTimeout(netTimer);
    }
  }, [animationName, preset.net]);

  useEffect(() => {
    if (!animationName) return;

    const endTimer = setTimeout(() => {
      setShooting(false);
      setNetActive(false);
    }, SHOT_DURATION + DEPTH_DURATION);

    return () => clearTimeout(endTimer);
  }, [animationName]);

  const arcPeak = BASE_ARC_PEAK * preset.arcMultiplier;

  return (
    <div
      style={{
        position: "relative",
        borderRadius: 20,
        border: `5px solid ${borderColor}`,
        overflow: "hidden",
        backgroundImage: "url('/newbackground.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {/* LABEL */}
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 10,
          padding: "4px 10px",
          borderRadius: 8,
          background: borderColor,
          color: "white",
          fontWeight: 800,
          zIndex: 50,
        }}
      >
        P{index + 1}
      </div>

      {/* SCORE */}
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 10,
          fontSize: "2.4rem",
          fontWeight: 900,
          color: "#ff2d2d",
          zIndex: 50,
        }}
      >
        {score}
      </div>

      {/* 🏀 BALL */}
      {shooting && (
        <img
          src="/ball.png"
          alt="ball"
          style={{
            position: "absolute",
            left: "50%",
            bottom: `${BALL_START_BOTTOM}%`,
            width: BALL_START_SIZE,
            height: BALL_START_SIZE,
            transform: "translateX(-50%)",
            animation: `
              ballArc ${SHOT_DURATION}ms ease-out forwards,
              ballDepthFinish ${DEPTH_DURATION}ms ${SHOT_DURATION}ms ease-out forwards
            `,
            zIndex: 40,
            pointerEvents: "none",
          }}
        />
      )}

      {/* NET */}
      {netActive && (
        <div
          style={{
            position: "absolute",
            left: `${RIM_X}%`,
            top: `calc(${RIM_Y}% + ${NET_VERTICAL_OFFSET}px)`,
            width: NET_WIDTH,
            height: NET_HEIGHT,
            transform: "translateX(-50%)",
            borderRadius: "0 0 50% 50%",
            background: "rgba(255,255,255,0.35)",
            animation: "netPull 0.25s ease-out",
            zIndex: 45,
            pointerEvents: "none",
          }}
        />
      )}

      <style>{`
        @keyframes ballArc {
          0% {
            transform: translate(-50%, 0) scale(1);
            bottom: ${BALL_START_BOTTOM}%;
          }
          60% {
            transform: translate(-50%, -${arcPeak}%) scale(0.75);
          }
          100% {
            left: calc(${RIM_X}% + ${preset.xOffset}px);
            bottom: ${
              100 -
              RIM_Y +
              BALL_END_OFFSET_Y -
              BALL_RADIUS_COMPENSATION
            }%;
            transform: translate(-50%, 0) scale(${BALL_END_SCALE});
          }
        }

        @keyframes ballDepthFinish {
          0% {
            transform: translate(-50%, 0) scale(${BALL_END_SCALE});
            opacity: 1;
          }
          100% {
            transform: translate(
              calc(-50% + ${DEPTH_FORWARD_SHIFT}px),
              ${DEPTH_DROP_Y}px
            ) scale(${DEPTH_END_SCALE});
            opacity: ${DEPTH_OPACITY_END};
          }
        }

        @keyframes netPull {
          0% { transform: translateX(-50%) scaleY(1); opacity: 0.9; }
          100% {
            transform: translateX(-50%) translateY(${NET_DROP_DISTANCE}px) scaleY(0.6);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
