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

/** 🔹 Control how tall the answer buttons are */
const ANSWER_MIN_HEIGHT_PX = 200; // bump this up/down to taste

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

        const herdLabel =
          showHerd && herdLabelForIndex
            ? herdLabelForIndex(idx)
            : undefined;

        return (
          <div
            key={idx}
            style={{
              position: "relative",
              width: "100%",
              // 🔥 This is what makes the button rows taller
              minHeight: `${ANSWER_MIN_HEIGHT_PX}px`,
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
          </div>
        );
      })}
    </div>
  );
}
