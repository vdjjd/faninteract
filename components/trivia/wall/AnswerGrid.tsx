// components/trivia/wall/AnswerGrid.tsx
"use client";

import React from "react";

type WallPhase = "question" | "overlay" | "reveal" | "leaderboard" | "podium";

export type AnswerGridProps = {
  options: string[];
  correctIndex: number | null;

  revealAnswer: boolean;
  wallPhase: WallPhase;

  // ✅ PATCH: wall uses Set<number>
  removedWrongIndices: Set<number>;

  // ✅ Herd highlight (labels + percents)
  herdEnabled: boolean;
  herdPercents: number[];
  herdLabelForIndex: (idx: number) => string;

  // Styling arrays (match your wall file)
  baseBgColors: string[];
  baseBorders: string[];
  highlightBorders: string[];
  glowColors: string[];
};

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
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
  const showHerd =
    Boolean(herdEnabled) && wallPhase === "question" && !revealAnswer;

  // 2x2 grid (your wall assumes 4 options, but this supports any length)
  // For non-4 lengths, it will still render in a responsive grid.
  const cols = options.length <= 2 ? 1 : 2;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: cols === 1 ? "1fr" : "1fr 1fr",
        gap: "2.0vh 2.0vw",
        flex: "1 1 auto",
        minHeight: 0,
        alignContent: "stretch",
      }}
    >
      {options.map((opt, idx) => {
        const isCorrect =
          typeof correctIndex === "number" && idx === correctIndex;

        const isRemoved =
          removedWrongIndices?.has(idx) && wallPhase === "question" && !revealAnswer;

        const percent = showHerd ? (herdPercents?.[idx] ?? 0) : 0;

        // --- Base styling ---
        const bgBase = baseBgColors?.[idx] ?? "rgba(255,255,255,0.08)";
        const borderBase = baseBorders?.[idx] ?? "1px solid rgba(255,255,255,0.18)";
        const borderHighlight =
          highlightBorders?.[idx] ?? "2px solid rgba(255,255,255,0.55)";
        const glow =
          glowColors?.[idx] ?? "rgba(255,255,255,0.7)";

        // --- Dynamic styling ---
        let background = bgBase;
        let border = borderBase;
        let opacity = 1;
        let boxShadow = "0 18px 60px rgba(0,0,0,0.18)";
        let transform = "translateZ(0)";

        // Reveal styling on wall:
        // - Correct gets strong green glow
        // - Others fade
        if (revealAnswer) {
          if (isCorrect) {
            background = "linear-gradient(to right, rgba(34,197,94,0.55), rgba(16,185,129,0.45))";
            border = "3px solid rgba(74,222,128,0.95)";
            boxShadow =
              "0 0 28px rgba(74,222,128,0.35), 0 0 70px rgba(74,222,128,0.18), 0 25px 90px rgba(0,0,0,0.35)";
          } else {
            opacity = 0.35;
            boxShadow = "0 10px 30px rgba(0,0,0,0.18)";
          }
        } else if (isRemoved) {
          background = "rgba(0,0,0,0.22)";
          border = "2px dashed rgba(255,255,255,0.28)";
          opacity = 0.38;
          boxShadow = "0 10px 30px rgba(0,0,0,0.14)";
        }

        // Herd highlight visual emphasis:
        // Make the most popular option subtly “pop” (without breaking your theme).
        // (If you don't want any extra emphasis, delete this block.)
        if (showHerd && !revealAnswer && !isRemoved) {
          const p = clamp01((percent ?? 0) / 100);
          if (p >= 0.45) {
            border = borderHighlight;
            boxShadow = `0 0 26px rgba(255,255,255,0.12), 0 0 40px ${glow.replace(
              "0.9",
              "0.22"
            )}, 0 20px 70px rgba(0,0,0,0.22)`;
            transform = "translateZ(0) scale(1.005)";
          }
        }

        return (
          <div
            key={idx}
            style={{
              borderRadius: 26,
              padding: "2.0vh 2.2vw",
              background,
              border,
              opacity,
              boxShadow,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              overflow: "hidden",
              position: "relative",
              transform,
            }}
          >
            {/* Soft inner sheen */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.02) 50%, rgba(0,0,0,0.10) 100%)",
                opacity: 0.55,
              }}
            />

            {/* Answer Letter + Text */}
            <div
              style={{
                position: "relative",
                zIndex: 2,
                display: "flex",
                gap: "1.6vw",
                alignItems: "flex-start",
              }}
            >
              {/* Badge */}
              <div
                style={{
                  width: "clamp(56px,4.6vw,86px)",
                  height: "clamp(56px,4.6vw,86px)",
                  borderRadius: 999,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 1000,
                  fontSize: "clamp(1.8rem,2.6vw,3.0rem)",
                  letterSpacing: 1,
                  background: "rgba(0,0,0,0.18)",
                  border: "1px solid rgba(255,255,255,0.22)",
                  boxShadow: "0 10px 28px rgba(0,0,0,0.20)",
                }}
              >
                {String.fromCharCode(65 + idx)}
              </div>

              {/* Text */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 900,
                    fontSize: "clamp(1.45rem,2.2vw,2.6rem)",
                    lineHeight: 1.1,
                    wordBreak: "break-word",
                    overflowWrap: "anywhere",
                    textShadow: "0 10px 30px rgba(0,0,0,0.55)",
                    opacity: isRemoved ? 0.9 : 1,
                    textDecoration: isRemoved ? "line-through" : "none",
                  }}
                >
                  {isRemoved ? "Removed" : opt}
                </div>

                {/* ✅ Herd line under the answer (like phone UI) */}
                {showHerd && !isRemoved && (
                  <div
                    style={{
                      marginTop: "1.0vh",
                      fontSize: "clamp(1.05rem,1.5vw,1.65rem)",
                      fontWeight: 900,
                      letterSpacing: 0.2,
                      opacity: 0.92,
                      textShadow: "0 8px 22px rgba(0,0,0,0.55)",
                    }}
                  >
                    {herdLabelForIndex(idx)}
                  </div>
                )}
              </div>
            </div>

            {/* Optional: subtle bottom progress bar per option using herd percent */}
            {showHerd && !isRemoved && (
              <div
                style={{
                  position: "relative",
                  zIndex: 2,
                  marginTop: "1.6vh",
                  height: 10,
                  borderRadius: 999,
                  overflow: "hidden",
                  background: "rgba(255,255,255,0.10)",
                  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.10)",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${Math.max(0, Math.min(100, percent))}%`,
                    background: "rgba(255,255,255,0.28)",
                    transition: "width 0.25s ease",
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

