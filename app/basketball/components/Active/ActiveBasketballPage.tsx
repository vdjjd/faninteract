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

  useEffect(() => {
    const channel = supabase
      .channel(`basketball-${gameId}`)
      .on(
        "broadcast",
        { event: "shot_fired" },
        ({ payload }) => {
          if (typeof payload?.lane_index !== "number") return;

          setAnimationByLane((prev) => ({
            ...prev,
            [payload.lane_index]: {
              shotId: payload.shot_id ?? crypto.randomUUID(),
              animation: payload.animation ?? null,
            },
          }));

          setTimeout(() => {
            setAnimationByLane((prev) => ({
              ...prev,
              [payload.lane_index]: null,
            }));
          }, 1400);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        gridTemplateRows: "repeat(2, 1fr)",
        gap: 16,
        padding: 20,
        background: "#050A18",
      }}
    >
      {Array.from({ length: LANES }).map((_, index) => (
        <PlayerCard
          key={index}
          index={index}
          borderColor="#444"
          score={0}
          animationName={animationByLane[index]?.animation ?? null}
        />
      ))}
    </div>
  );
}
