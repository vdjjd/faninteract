"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import PlayerCard from "./PlayerCard";

const LANES = 10;

export default function ActiveBasketballPage({
  gameId,
}: {
  gameId: string;
}) {
  const [animationByLane, setAnimationByLane] = useState<
    Record<number, string | null>
  >({});

  /* ============================================================
     LISTEN FOR SHOTS
  ============================================================ */
  useEffect(() => {
    const channel = supabase
      .channel(`basketball-${gameId}`)
      .on(
        "broadcast",
        { event: "shot_fired" },
        ({ payload }) => {
          console.log("🏀 WALL RECEIVED SHOT:", payload);

          const lane = payload?.lane_index;
          const animation = payload?.animation ?? "swish";

          if (typeof lane !== "number") return;

          // trigger animation for this lane
          setAnimationByLane((prev) => ({
            ...prev,
            [lane]: animation,
          }));

          // clear animation after playback
          setTimeout(() => {
            setAnimationByLane((prev) => ({
              ...prev,
              [lane]: null,
            }));
          }, 900);
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
          balls={[]}               // ← physics comes later
          timeLeft={0}
          score={0}
          borderColor="#444"
          timerExpired={false}
          hostLogo={null}
          maxScore={0}
          animationName={animationByLane[index] ?? null}
        />
      ))}
    </div>
  );
}
