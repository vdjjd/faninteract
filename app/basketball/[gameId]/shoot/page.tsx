"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useCountdown } from "@/app/basketball/hooks/useCountdown";

export default function ShooterPage() {
  const { gameId } = useParams() as { gameId: string };

  const countdownValue = useCountdown(gameId);
  const [localCountdown, setLocalCountdown] = useState<number | null>(null);
  const displayCountdown = localCountdown ?? countdownValue;

  const [playerId, setPlayerId] = useState<string | null>(null);
  const [laneIndex, setLaneIndex] = useState<number | null>(null);
  const [laneColor, setLaneColor] = useState("#222");
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const streakRef = useRef(0);
  const swipeRef = useRef({ x: 0, y: 0, time: 0 });

  /* Load player */
  useEffect(() => {
    setPlayerId(localStorage.getItem("bb_player_id"));
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
      setScore(data.score ?? 0);
    }

    loadPlayer();
    const t = setInterval(loadPlayer, 1000);
    return () => clearInterval(t);
  }, [playerId]);

  /* Timer sync */
  async function syncGameStart() {
    const { data } = await supabase
      .from("bb_games")
      .select("*")
      .eq("id", gameId)
      .single();

    if (!data?.game_running || !data.game_timer_start) return;

    const startMS = new Date(data.game_timer_start).getTime();
    const elapsed = Math.floor((Date.now() - startMS) / 1000);
    setTimeLeft(Math.max(data.duration_seconds - elapsed, 0));
  }

  useEffect(() => {
    if (!gameId) return;

    const channel = supabase
      .channel(`basketball-${gameId}`)
      .on("broadcast", { event: "start_countdown" }, () => {
        setLocalCountdown(10);
      })
      .on("broadcast", { event: "start_game" }, () => {
        syncGameStart(); // <-- FIX: do not return Promise
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel); // sync cleanup
    };
  }, [gameId]);

  /* SHOOT FUNCTION */
  async function handleShot({ vx, vy, power }) {
    if (!playerId || laneIndex === null) return;
    if (displayCountdown !== null) return;

    const streak = streakRef.current;

    supabase.channel(`basketball-${gameId}`).send({
      type: "broadcast",
      event: "shot_fired",
      payload: { lane_index: laneIndex, vx, vy, power, streak },
    });
  }

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "black",
        border: `8px solid ${laneColor}`,
        position: "relative",
        overflow: "hidden",
        touchAction: "none",
      }}
      onTouchStart={(e) => {
        const t = e.touches[0];
        swipeRef.current = { x: t.clientX, y: t.clientY, time: Date.now() };
      }}
      onTouchEnd={(e) => {
        const t = e.changedTouches[0];

        const dx = t.clientX - swipeRef.current.x;
        const dy = swipeRef.current.y - t.clientY;
        const dt = Date.now() - swipeRef.current.time;

        if (dy < 10) return;

        const speed = dy / dt;
        const vy = -Math.min(7, speed * 9);
        const vx = dx * 0.015;
        const power = Math.min(1, speed * 1.2);

        handleShot({ vx, vy, power });
      }}
    >
      {/* Countdown */}
      {displayCountdown !== null && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.88)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            color: "white",
            fontSize: "clamp(4rem, 10vw, 12rem)",
            fontWeight: 900,
            zIndex: 9999,
          }}
        >
          {displayCountdown > 0 ? displayCountdown : "START!"}
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
        }}
      >
        {timeLeft ?? "--"}
      </div>

      {/* SHOOT MESSAGE */}
      <div
        style={{
          position: "absolute",
          bottom: "5%",
          width: "100%",
          textAlign: "center",
          color: "#ccc",
          fontSize: "2rem",
        }}
      >
        SWIPE UP TO SHOOT
      </div>
    </div>
  );
}
