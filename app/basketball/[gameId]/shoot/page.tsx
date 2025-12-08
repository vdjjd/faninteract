"use client";

import { useCountdown } from "@/app/basketball/hooks/useCountdown";
import { Countdown } from "@/app/basketball/components/Countdown";

export default function ShooterPage({ params }: { params: { gameId: string } }) {
  const { gameId } = params;

  // ONLY this – countdown number or null
  const countdownValue = useCountdown(gameId);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "black",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        position: "relative",
      }}
    >
      {/* Fullscreen countdown overlay */}
      <Countdown preCountdown={countdownValue} />
    </div>
  );
}
