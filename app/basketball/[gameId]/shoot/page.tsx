"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";
import { useCountdown } from "@/app/basketball/hooks/useCountdown";

const CELL_COLORS = [
  "#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#5AC8FA",
  "#007AFF", "#5856D6", "#AF52DE", "#FF2D55", "#A2845E",
];

export default function ShooterPage({ params }: { params: { gameId: string } }) {
  const { gameId } = params;

  const countdownValue = useCountdown(gameId);

  const [playerId, setPlayerId] = useState<string | null>(null);
  const [laneIndex, setLaneIndex] = useState<number | null>(null);
  const [laneColor, setLaneColor] = useState("#222");
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const streakRef = useRef(0);
  const startY = useRef(0);

  /* ------------------------------------------------------------
     LOAD PLAYER → This updates laneIndex, selfie, score, etc.
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
    const t = setInterval(loadPlayer, 1100);
    return () => clearInterval(t);
  }, [playerId]);

  /* ------------------------------------------------------------
     GAME TIMER SYNC — uses REAL start_time from DB
  ------------------------------------------------------------ */
  async function syncGameStart() {
    const { data } = await supabase
      .from("bb_games")
      .select("*")
      .eq("id", gameId)
      .single();

    if (!data?.game_running || !data.game_timer_start) return;

    const startMS = new Date(data.game_timer_start).getTime();
    const elapsed = Math.floor((Date.now() - startMS) / 1000);
    const remaining = Math.max(data.duration_seconds - elapsed, 0);

    setTimeLeft(remaining);
  }

  /* ------------------------------------------------------------
     LISTEN FOR start_game BROADCAST → ensures perfect sync
  ------------------------------------------------------------ */
  useEffect(() => {
    const channel = supabase
      .channel(`basketball-${gameId}`)
      .on("broadcast", { event: "start_game" }, syncGameStart)
      .subscribe();

    return () => {
      try { supabase.removeChannel(channel); } catch {}
    };
  }, [gameId]);

  // POLL DB EVERY 1 SEC TO KEEP TIME IN SYNC
  useEffect(() => {
    async function poll() {
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

    poll();
    const id = setInterval(poll, 1000);
    return () => clearInterval(id);
  }, [gameId]);

  /* ------------------------------------------------------------
     SHOOT LOGIC → LOCKED while countdown is active
  ------------------------------------------------------------ */
  async function handleShot(power: number) {
    if (!playerId || laneIndex === null) return;

    // ❗ Do NOT shoot while countdown overlay is showing
    if (countdownValue !== null) return;

    const streak = streakRef.current;

    supabase.channel(`basketball-${gameId}`).send({
      type: "broadcast",
      event: "shot_fired",
      payload: { lane_index: laneIndex, power, streak },
    });

    const made = Math.random() < (0.45 + power * 0.35);

    if (made) {
      streakRef.current++;
      await supabase.rpc("increment_player_score", { p_player_id: playerId });
    } else {
      streakRef.current = 0;
    }
  }

  /* ------------------------------------------------------------
     RENDER UI
  ------------------------------------------------------------ */
  return (
    <div
      id="lane-border"
      style={{
        width: "100vw",
        height: "100vh",
        background: "black",
        border: `8px solid ${laneColor}`,
        position: "relative",
        overflow: "hidden",
        touchAction: "none",
      }}
      onTouchStart={(e) => { startY.current = e.touches[0].clientY; }}
      onTouchEnd={(e) => {
        const dist = startY.current - e.changedTouches[0].clientY;
        if (dist > 25) {
          const power = Math.min(1, Math.max(0, dist / 450));
          handleShot(power);
        }
      }}
    >
      {/* COUNTDOWN OVERLAY */}
      {countdownValue !== null && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            color: "white",
            fontSize: "clamp(4rem, 10vw, 12rem)",
            fontWeight: 900,
            zIndex: 9999,
          }}
        >
          {countdownValue > 0 ? countdownValue : "START!"}
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

      {/* SWIPE INFO */}
      <div
        style={{
          position: "absolute",
          bottom: "5%",
          width: "100%",
          textAlign: "center",
          color: "#ccc",
          fontSize: "2rem",
          opacity: countdownValue !== null ? 0 : 1, // hide while countdown
        }}
      >
        SWIPE UP TO SHOOT
      </div>
    </div>
  );
}
