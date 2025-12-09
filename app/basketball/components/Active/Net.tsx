"use client";

import React, { useMemo } from "react";

export default function Net({ state }: { state: "idle" | "swish" | "hit" }) {
  const frame = useMemo(() => {
    switch (state) {
      case "swish":
        return "/net_swish.png";
      case "hit":
        return "/net_hit.png";
      default:
        return "/net_idle.png";
    }
  }, [state]);

  return (
    <img
      src={frame}
      alt="net"
      style={{
        position: "absolute",
        top: "calc(4% + 7vh + 0.4vh)",
        left: "50%",
        transform: "translateX(-50%)",
        width: "14%",
        zIndex: 150,
        pointerEvents: "none",
      }}
    />
  );
}
