"use client";

import React from "react";
import { useFrameAnimation } from "@/app/basketball/hooks/useFrameAnimation";

export default function LaneAnimationPlayer({
  animationName,
}) {
  const frameCount = 12; // your short miss animation length
  const { frame, playing } = useFrameAnimation(animationName, frameCount, 12);

  if (!animationName) return null;
  if (!playing) return null;

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
        zIndex: 500, // above everything in the lane
        pointerEvents: "none",
      }}
    />
  );
}
