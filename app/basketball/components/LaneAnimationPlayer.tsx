"use client";

import React, { useEffect, useState } from "react";
import { useFrameAnimation } from "@/app/basketball/hooks/useFrameAnimation";

export default function LaneAnimationPlayer({ animationName }) {
  // Total frames: 00 → 11  (12 frames)
  const frameCount = 12;

  // Start frame at 0
  const { frame, playing } = useFrameAnimation(animationName, frameCount, 12);

  if (!animationName) return null;
  if (!playing) return null;

  // IMPORTANT: Your files START at 00, so we generate 00–11
  const src = `/animations/${animationName}/shortmissed_Shot${String(
    frame
  ).padStart(2, "0")}.png`;

  return (
    <img
      src={src}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        zIndex: 500,
        pointerEvents: "none",
      }}
    />
  );
}
