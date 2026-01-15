"use client";

import { useEffect, useState } from "react";
import BasketballWorld from "@/app/basketball/components/BasketballWorld";

export default function BasketballTestPage() {
  const [isFs, setIsFs] = useState(false);

  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {}
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "black",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <BasketballWorld
        cols={5}
        rows={2}
        laneSpacingX={9.5}
        laneSpacingY={7.5}
        showTuningUI
        autoFrameCamera={false}
      />

      {/* Simple overlay controls */}
      <div
        style={{
          position: "absolute",
          right: 18,
          bottom: 18,
          zIndex: 50,
          display: "flex",
          gap: 10,
          alignItems: "center",
        }}
      >
        <button
          onClick={toggleFullscreen}
          style={{
            width: 52,
            height: 52,
            borderRadius: 12,
            background: "rgba(255,255,255,0.10)",
            border: "1px solid rgba(255,255,255,0.20)",
            color: "white",
            cursor: "pointer",
            fontSize: 18,
          }}
          title={isFs ? "Exit Fullscreen" : "Fullscreen"}
        >
          ⛶
        </button>
      </div>
    </div>
  );
}
