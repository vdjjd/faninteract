"use client";

import React, { useEffect, useState } from "react";

/* ============================================================
   REAL PLAYER CARD — MANUAL TUNING (SECOND PART ADDED)
============================================================ */

/* =======================
   🔧 FIRST-PHASE (ARC) CONTROLS
======================= */

const RIM_X = 50;
const RIM_Y = 28;

const BALL_START_BOTTOM = 6;
const BALL_END_OFFSET_Y = -6;
const BALL_RADIUS_COMPENSATION = 4;

const BALL_START_SIZE = 80;
const BALL_END_SCALE = 0.52;

const ARC_PEAK_HEIGHT = 240;

// Net
const NET_WIDTH = 45;
const NET_HEIGHT = 34;
const NET_DROP_DISTANCE = 13;
const NET_VERTICAL_OFFSET = 4;

// Timing
const SHOT_DURATION = 900; // arc
const DEPTH_DURATION = 450; // second phase
const NET_TRIGGER_TIME = 460;

/* =======================
   🔧 SECOND-PHASE (DEPTH) CONTROLS
======================= */

// How far the ball should fall after reaching the rim
const DEPTH_DROP_Y = 160;           // px downward movement after rim — **ADJUST ME**
const DEPTH_FORWARD_SHIFT = -1;     // px horizontal shift (illusion of moving "into screen")
const DEPTH_END_SCALE = .48;      // final scale — **ADJUST ME**
const DEPTH_OPACITY_END = 100;       // final opacity — 0 = disappear

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

  useEffect(() => {
    if (!animationName) return;

    setShooting(true);

    const netTimer = setTimeout(() => setNetActive(true), NET_TRIGGER_TIME);
    const endTimer = setTimeout(() => {
      setShooting(false);
      setNetActive(false);
    }, SHOT_DURATION + DEPTH_DURATION);

    return () => {
      clearTimeout(netTimer);
      clearTimeout(endTimer);
    };
  }, [animationName]);

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

      {/* 🏀 BALL (2-phase animation) */}
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
            transform: translate(-50%, -${ARC_PEAK_HEIGHT}%) scale(0.75);
          }
          100% {
            left: ${RIM_X}%;
            bottom: ${
              100 -
              RIM_Y +
              BALL_END_OFFSET_Y -
              BALL_RADIUS_COMPENSATION
            }%;
            transform: translate(-50%, 0) scale(${BALL_END_SCALE});
          }
        }

        /* ✔ SECOND PART — FULLY MANUAL */
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
