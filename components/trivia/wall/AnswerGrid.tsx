// components/trivia/wall/AnswerGrid.tsx
"use client";

import React from "react";
import AnswerTile from "./AnswerTile";

export type AnswerGridProps = {
  options: string[];
  correctIndex: number | null;

  // State flags from wall
  revealAnswer: boolean;
  wallPhase: "question" | "overlay" | "reveal" | "leaderboard" | "podium";

  // Wrong removal (accept Set OR array to avoid TS pain)
  removedWrongIndices: Set<number> | number[];

  // Herd highlight
  herdEnabled: boolean;
  herdPercents?: number[]; // 0..100
  herdLabelForIndex?: (idx: number) => string; // "42% (17 votes)"

  // Theme arrays
  baseBgColors: string[];
  baseBorders: string[];
  highlightBorders: string[];
  glowColors: string[];
};

function isRemovedIndex(
  removed: Set<number> | number[] | undefined,
  idx: number
) {
  if (!removed) return false;
  return removed instanceof Set ? removed.has(idx) : removed.includes(idx);
}

export default function AnswerGrid({
  options,
  correctIndex,
  revealAnswer,
  wallPhase,
  removedWrongIndices,

  herdEnabled,
  herdPercents,
  herdLabelForIndex,

  baseBgColors,
  baseBorders,
  highlightBorders,
  glowColors,
}: AnswerGridProps) {
  return (
    <div
      style={{
        width: "100%",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "2.5vh",
      }}
    >
      {options.map((opt, idx) => {
        const isCorrect =
          typeof correctIndex === "number" &&
          correctIndex >= 0 &&
          idx === correctIndex;

        const isRemoved =
          wallPhase === "question" &&
          !revealAnswer &&
          isRemovedIndex(removedWrongIndices, idx);

        const showHerd =
          herdEnabled &&
          wallPhase === "question" &&
          !revealAnswer &&
          !isRemoved;

        const herdLabel = herdLabelForIndex
          ? herdLabelForIndex(idx)
          : undefined;

        return (
          <div
            key={idx}
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
            }}
          >
            <AnswerTile
              idx={idx}
              text={opt}
              baseBg={baseBgColors[idx] ?? "rgba(255,255,255,0.12)"}
              baseBorder={
                baseBorders[idx] ?? "1px solid rgba(255,255,255,0.18)"
              }
              highlightBorder={highlightBorders[idx]}
              glowColor={glowColors[idx]}
              removed={isRemoved}
              revealAnswer={revealAnswer}
              isCorrect={isCorrect}
              herdEnabled={herdEnabled}
              herdPercent={herdPercents?.[idx] ?? 0}
              herdLabel={herdLabel}
            />

            {/* ✅ Herd highlight label INSIDE the tile near the bottom (no layout shift) */}
            {showHerd && herdLabel && (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 14,
                  textAlign: "center",
                  pointerEvents: "none",
                  fontSize: "clamp(1.05rem,1.3vw,1.45rem)",
                  fontWeight: 900,
                  opacity: 0.9,
                  textShadow: "0 10px 30px rgba(0,0,0,0.65)",
                }}
              >
                {herdLabel}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
