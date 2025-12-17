"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import PlayerCard from "./PlayerCard";

const LANES = 10;

type LaneShot = {
  id: string;
  animation: string;
};

export default function ActiveBasketballPage({
  gameId,
}: {
  gameId: string;
}) {
  const [laneShots, setLaneShots] = useState<Record<number, LaneShot | null>>(
    {}
  );

  /* ============================================================
     LISTEN FOR SHOTS (EVENT-DRIVEN)
  ============================================================ */
  useEffect(() => {
    const channel = supabase
      .channel(`basketball-${gameId}`)
      .on("broadcast", { event: "shot_fired" }, ({ payload }) => {
        console.log("🏀 WALL RECEIVED SHOT:", payload);

        const lane = payload?.lane_index;
        const animation = payload?.animation;

        if (typeof lane !== "number" || !animation) return;

        const shot: LaneShot = {
          id: payload.shot_id ?? crypto.randomUUID(),
          animation,
        };

        // 🔥 force React to see a NEW object every shot
        setLaneShots((prev) => ({
          ...prev,
          [lane]: shot,
        }));

        // clear AFTER animation window
        setTimeout(() => {
          setLaneShots((prev) => ({
            ...prev,
            [lane]: null,
          }));
        }, 1600);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  /* ============================================================
     RENDER
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
          key={`${index}-${laneShots[index]?.id ?? "idle"}`}
          index={index}
          borderColor="#444"
          score={0}
          animationName={laneShots[index]?.animation ?? null}
        />
      ))}
    </div>
  );
}
