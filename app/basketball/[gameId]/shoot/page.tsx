"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useCountdown } from "@/app/basketball/hooks/useCountdown";

/* ------------------------------------------------------------
   CONSTANTS
------------------------------------------------------------ */

const CELL_COLORS = [
  "#FF3B30",
  "#FF9500",
  "#FFCC00",
  "#34C759",
  "#5AC8FA",
  "#007AFF",
  "#5856D6",
  "#AF52DE",
  "#FF2D55",
  "#A2845E",
];

/* ------------------------------------------------------------
   SHOOTER PAGE
------------------------------------------------------------ */

export default function ShooterPage() {
  const { gameId } = useParams() as { gameId: string };

  const countdownValue = useCountdown(gameId);

  const [playerId, setPlayerId] = useState<string | null>(null);
  const [laneIndex, setLaneIndex] = useState<number>(0);
  const [laneColor, setLaneColor] = useState("#222");
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const touchStartY = useRef<number | null>(null);

  /* ------------------------------------------------------------
     LOAD PLAYER
  ------------------------------------------------------------ */
  useEffect(() => {
    const stored = localStorage.getItem("bb_player_id");
    if (stored) setPlayerId(stored);
  }, []);

  useEffect(() => {
    if (!playerId) return;

    async function loadPlayer() {
      const { data } = await supabase
        .from("bb_game_players")
        .select("*")
        .eq("id", playerId)
        .single();

      if (!data) return;

      setLaneIndex(data.lane_index);
      setLaneColor(CELL_COLORS[data.lane_index]);
      setScore(data.score ?? 0);
    }

    loadPlayer();
    const i = setInterval(loadPlayer, 1000);
    return () => clearInterval(i);
  }, [playerId]);

  /* ------------------------------------------------------------
     TOUCH HANDLERS (SWIPE UP)
  ------------------------------------------------------------ */

  function onTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0].clientY;
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (countdownValue !== null) return;
    if (touchStartY.current === null) return;

    const endY = e.changedTouches[0].clientY;
    const deltaY = touchStartY.current - endY;

    touchStartY.current = null;

    // Require a real swipe
    if (deltaY < 40) return;

    fireShot();
  }

  /* ------------------------------------------------------------
     SEND SHOT EVENT
  ------------------------------------------------------------ */
  function fireShot() {
    if (!playerId) return;

    console.log("🏀 SWIPE → SHOT (lane)", laneIndex);

    supabase
      .channel(`basketball-${gameId}`, {
        config: { broadcast: { ack: true } },
      })
      .send({
        type: "broadcast",
        event: "shot_fired",
        payload: {
          lane_index: laneIndex,
          animation: "make",
        },
      });
  }

  /* ------------------------------------------------------------
     RENDER
  ------------------------------------------------------------ */

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{
        width: "100vw",
        height: "100vh",
        background: "#000",
        border: `10px solid ${laneColor}`,
        position: "relative",
        overflow: "hidden",
        touchAction: "none",
        userSelect: "none",
      }}
    >
      {/* COUNTDOWN OVERLAY */}
      {countdownValue !== null && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.9)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            color: "white",
            fontSize: "clamp(4rem,10vw,12rem)",
            fontWeight: 900,
            zIndex: 100,
          }}
        >
          {countdownValue > 0 ? countdownValue : "SHOOT!"}
        </div>
      )}

      {/* SCORE */}
      <div
        style={{
          position: "absolute",
          top: 20,
          left: 20,
          color: "white",
          fontSize: "2.5rem",
          fontWeight: 800,
        }}
      >
        {score}
      </div>

      {/* TIMER */}
      <div
        style={{
          position: "absolute",
          top: 20,
          right: 20,
          color: "white",
          fontSize: "2.5rem",
          fontWeight: 800,
        }}
      >
        {timeLeft ?? "--"}
      </div>

      {/* SWIPE TARGET */}
      <div
        style={{
          position: "absolute",
          bottom: "12%",
          left: "50%",
          transform: "translateX(-50%)",
          width: 180,
          height: 180,
          borderRadius: "50%",
          background: laneColor,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          color: "white",
          fontWeight: 900,
          letterSpacing: 2,
          boxShadow: `0 0 25px ${laneColor}`,
        }}
      >
        SWIPE ↑
      </div>
    </div>
  );
}
