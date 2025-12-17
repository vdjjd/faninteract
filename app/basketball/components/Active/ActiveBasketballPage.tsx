"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import PlayerCard from "./PlayerCard";

const LANES = 10;

type ShotEvent = {
  shotId: string;
  animation: string;
};

export default function ActiveBasketballPage({
  gameId,
}: {
  gameId: string;
}) {
  const [animationByLane, setAnimationByLane] = useState<
    Record<number, ShotEvent | null>
  >({});

  /* ============================================================
     LISTEN FOR SHOT ATTEMPTS
  ============================================================ */
  useEffect(() => {
    const channel = supabase
      .channel(`basketball-${gameId}`)
      .on(
        "broadcast",
        { event: "shot_fired" }, // we’ll rename later
        ({ payload }) => {
          console.log("🏀 WALL RECEIVED SHOT:", payload);

          const lane = payload?.lane_index;
          if (typeof lane !== "number") return;

          // 🔑 EVENT-BASED SHOT (unique every time)
          const shotEvent: ShotEvent = {
            shotId: payload?.shot_id ?? crypto.randomUUID(),
            animation: payload?.animation ?? "swish",
          };

          // Trigger animation for this lane
          setAnimationByLane((prev) => ({
            ...prev,
            [lane]: shotEvent,
          }));

          // Clear after animation duration
          setTimeout(() => {
            setAnimationByLane((prev) => ({
              ...prev,
              [lane]: null,
            }));
          }, 1400); // long enough for arc + depth
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  /* ============================================================
     RENDER PLAYER CARDS
  ============================================================ */
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#050A18",
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        gridTemplateRows: "repeat(2, 1fr)",
        gap: 16,
        padding: 20,
      }}
    >
      {Array.from({ length: LANES }).map((_, index) => (
        <PlayerCard
          key={index}
          index={index}
          player={null}
          balls={[]}               // physics later
          timeLeft={0}
          score={0}
          borderColor="#444"
          timerExpired={false}
          hostLogo={null}
          maxScore={0}
          animationName={
            animationByLane[index]?.animation ?? null
          }
        />
      ))}
    </div>
  );
}
