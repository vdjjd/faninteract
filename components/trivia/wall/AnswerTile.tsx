// components/trivia/wall/AnswerTile.tsx
"use client";

import React, { useMemo } from "react";

function rgbaWithAlpha(color: string, alpha: number) {
  // expects rgba(r,g,b,a) or rgb(r,g,b)
  const m = color.replace(/\s+/g, "").match(/^rgba?\((\d+),(\d+),(\d+)(?:,([0-9.]+))?\)$/i);
  if (!m) return color;
  const r = Number(m[1]);
  const g = Number(m[2]);
  const b = Number(m[3]);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r},${g},${b},${a})`;
}

export type AnswerTileProps = {
  idx: number;
  text: string;

  baseBg: string;     // e.g. "rgba(59, 130, 246, 0.30)"
  baseBorder: string; // e.g. "1px solid rgba(...)"
  highlightBorder?: string;
  glowColor?: string;

  removed: boolean;

  revealAnswer: boolean;
  isCorrect: boolean;

  // Herd highlight (optional)
  herdEnabled?: boolean;
  herdPercent?: number; // 0..100
  herdLabel?: string;   // "42% (17 votes)"

  // If you want the wall fill to be "tint of its own color"
  herdFillAlpha?: number; // default 0.55
};

export default function AnswerTile({
  idx,
  text,
  baseBg,
  baseBorder,
  highlightBorder,
  glowColor,
  removed,
  revealAnswer,
  isCorrect,
  herdEnabled,
  herdPercent,
  herdLabel,
  herdFillAlpha = 0.55,
}: AnswerTileProps) {
  const pct = Math.max(0, Math.min(100, typeof herdPercent === "number" ? herdPercent : 0));

  const fillColor = useMemo(() => {
    // If baseBg is rgba(...) we can strengthen alpha for the fill tint.
    // If baseBg is not parseable, just use it as-is.
    if (typeof baseBg === "string" && baseBg.toLowerCase().startsWith("rgba")) {
      return rgbaWithAlpha(baseBg, herdFillAlpha);
    }
    if (typeof baseBg === "string" && baseBg.toLowerCase().startsWith("rgb(")) {
      return rgbaWithAlpha(baseBg, herdFillAlpha);
    }
    return baseBg;
  }, [baseBg, herdFillAlpha]);

  let bgc = baseBg;
  let border = baseBorder;
  let opacity = 1;
  let boxShadow = "none";
  let transform = "scale(1)";
  let animation: string | undefined;

  if (removed && !revealAnswer) {
    bgc = "rgba(255,255,255,0.04)";
    border = "1px dashed rgba(255,255,255,0.22)";
    opacity = 0.22;
    transform = "scale(0.985)";
  }

  if (revealAnswer) {
    if (isCorrect) {
      if (highlightBorder) border = highlightBorder;
      if (glowColor) boxShadow = `0 0 40px 8px ${glowColor}`;
      transform = "scale(1.04)";
      animation = "fiCorrectPulse 1.2s ease-in-out infinite";
    } else {
      opacity = 0.35;
    }
  }

  return (
    <div
      style={{
        padding: "2.4vh 2.6vw",
        minHeight: "14vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 18,
        background: bgc,
        border,
        fontSize: "clamp(1.6rem,2vw,2.4rem)",
        fontWeight: 700,
        textAlign: "center",
        opacity,
        boxShadow,
        transform,
        animation,
        transition:
          "opacity 0.3s ease, border 0.3s ease, background 0.3s ease, box-shadow 0.4s ease, transform 0.4s ease",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Herd fill tint (under glass + under text) */}
      {herdEnabled && !removed && !revealAnswer && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${pct}%`,
            background: fillColor,
            transition: "width 140ms linear",
            zIndex: 0,
          }}
        />
      )}

      {/* Glass depth */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02) 55%, rgba(0,0,0,0.06) 100%)",
          opacity: 0.75,
          zIndex: 1,
        }}
      />

      {/* Main text */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          textDecoration: removed && !revealAnswer ? "line-through" : "none",
          opacity: removed && !revealAnswer ? 0.9 : 1,
          paddingBottom: herdEnabled && herdLabel && !revealAnswer ? "0.8rem" : 0,
        }}
      >
        {String.fromCharCode(65 + idx)}. {removed && !revealAnswer ? "Removed" : text}
      </div>

      {/* Herd label (top-right or bottom-right) */}
      {herdEnabled && herdLabel && !removed && !revealAnswer && (
        <div
          style={{
            position: "absolute",
            right: 14,
            bottom: 10,
            zIndex: 3,
            fontSize: "clamp(0.95rem,1.1vw,1.25rem)",
            fontWeight: 900,
            opacity: 0.95,
            textShadow: "0 6px 18px rgba(0,0,0,0.55)",
            background: "rgba(0,0,0,0.30)",
            border: "1px solid rgba(255,255,255,0.18)",
            padding: "6px 10px",
            borderRadius: 999,
            backdropFilter: "blur(6px)",
          }}
        >
          {herdLabel}
        </div>
      )}
    </div>
  );
}
