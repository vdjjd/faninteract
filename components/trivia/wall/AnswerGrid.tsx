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

  // Wrong removal
  removedWrongIndices: Set<number>;

  // Herd highlight
  herdEnabled: boolean;
  herdPercents?: number[]; // 0..100
  herdLabelForIndex?: (idx: number) => string; // "42% (17 votes)"

  // Theme arrays (same ones you already have)
  baseBgColors: string[];
  baseBorders: string[];
  highlightBorders: string[];
  glowColors: string[];
};

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
          typeof correctIndex === "number" && correctIndex >= 0 && idx === correctIndex;

        const isRemoved =
          wallPhase === "question" && !revealAnswer && removedWrongIndices.has(idx);

        return (
          <AnswerTile
            key={idx}
            idx={idx}
            text={opt}
            baseBg={baseBgColors[idx] ?? "rgba(255,255,255,0.12)"}
            baseBorder={baseBorders[idx] ?? "1px solid rgba(255,255,255,0.18)"}
            highlightBorder={highlightBorders[idx]}
            glowColor={glowColors[idx]}
            removed={isRemoved}
            revealAnswer={revealAnswer}
            isCorrect={isCorrect}
            herdEnabled={herdEnabled}
            herdPercent={herdPercents?.[idx] ?? 0}
            herdLabel={herdLabelForIndex ? herdLabelForIndex(idx) : undefined}
          />
        );
      })}
    </div>
  );
}
