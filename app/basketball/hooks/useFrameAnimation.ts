// /app/basketball/hooks/useFrameAnimation.ts
"use client";

import { useEffect, useState } from "react";

export function useFrameAnimation(name?: string, frameCount = 12, fps = 12) {
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!name) return;

    setFrame(0);
    setPlaying(true);

    const interval = setInterval(() => {
      setFrame((f) => {
        if (f >= frameCount - 1) {
          clearInterval(interval);
          return frameCount - 1;
        }
        return f + 1;
      });
    }, 1000 / fps);

    return () => clearInterval(interval);
  }, [name, frameCount, fps]);

  return { frame, playing };
}
