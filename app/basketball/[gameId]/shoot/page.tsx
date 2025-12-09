"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useCountdown } from "@/app/basketball/hooks/useCountdown";

const CELL_COLORS = [
  "#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#5AC8FA",
  "#007AFF", "#5856D6", "#AF52DE", "#FF2D55", "#A2845E",
];

export default function ShooterPage() {
  const params = useParams();

  /** --------------------------------------------
   *  SAFELY READ gameId (fixes eq.undefined bug)
   * -------------------------------------------- */
  const gameId =
    typeof params.gameId === "string"
      ? params.gameId
      : Array.isArray(params.gameId)
      ? params.gameId[0]
      : null;

  /** If gameId is not ready, render nothing (prevents 400 errors) */
  if (!gameId) {
    return (
      <div style={{ color: "white", padding: 40 }}>
        Loading game…
      </div>
    );
  }

  /** --------------------------------------------
   *  COUNTDOWN
   * -------------------------------------------- */
  const countdownValue = useCountdown(gameId);
  const [localCountdown, setLocalCountdown] = useState<number | null>(null);
  const displayCountdown = localCountdown ?? countdownValue;

  /** --------------------------------------------
   *  PLAYER STATE
   * -------------------------------------------- */
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [laneIndex, setLaneIndex] = useState<number | null>(null);
  const [laneColor, setLaneColor] = useState("#222");
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const streakRef = useRef(0);
  const startY = useRef(0);

  /** --------------------------------------------
   *  LOAD PLAYER FROM LOCAL STORAGE
   * -------------------------------------------- */
  useEffect(() => {
    const stored = localStorage.getItem("bb_player_id");
    if (stored) setPlayerId(stored);
  }, []);

  /** --------------------------------------------
   *  LOAD PLAYER FROM DB (lane + score)
   * -------------------------------------------- */
  useEffect(() => {
    if (!playerId || !gameId) return;

    async function loadPlayer() {
      const { data } = await supabase
        .from("bb_game_players")
        .select("*")
        .eq("id", playerId)
        .eq("game_id", gameId)
        .single();

      if (!data) return;

      setLaneIndex(data.lane_index);
      setLaneColor(CELL_COLORS[data.lane_index]);
      setScore(data.score ?? 0);
    }

    loadPlayer();
    const t = setInterval(loadPlayer, 1000);
    return () => clearInterval(t);
  }, [playerId, gameId]);

  /** --------------------------------------------
   *  SYNC GAME TIMER SAFELY (only when gameId valid)
   * -------------------------------------------- */
  async function syncGameStart() {
    if (!gameId) return;

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

  /** --------------------------------------------
   *  WALL BROADCAST LISTENER (safe gameId)
   * -------------------------------------------- */
  useEffect(() => {
    if (!gameId) return;

    const channel = supabase
      .channel(`basketball-${gameId}`)
      .on("broadcast", { event: "start_countdown" }, () =>
        setLocalCountdown(10)
      )
      .on("broadcast", { event: "start_game" }, syncGameStart)
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, [gameId]);

  /** --------------------------------------------
   *  COUNTDOWN LOGIC
   * -------------------------------------------- */
  useEffect(() => {
    if (localCountdown === null) return;

    if (localCountdown <= 0) {
      setLocalCountdown(null);
      syncGameStart();
      return;
    }

    const timer = setTimeout(
      () => setLocalCountdown((c) => (c !== null ? c - 1 : null)),
      1000
    );

    return () => clearTimeout(timer);
  }, [localCountdown]);

  /** --------------------------------------------
   *  SHOOT LOGIC
   * -------------------------------------------- */
  async function handleShot(power: number) {
    if (!playerId || laneIndex === null) return;
    if (displayCountdown !== null) return;

    const streak = streakRef.current;

    supabase.channel(`basketball-${gameId}`).send({
      type: "broadcast",
      event: "shot_fired",
      payload: { lane_index: laneIndex, power, streak },
    });

    const made = Math.random() < (0.45 + power * 0.35);
    if (made) {
      streakRef.current++;
      await supabase.rpc("increment_player_score", {
        p_player_id: playerId,
      });
    } else {
      streakRef.current = 0;
    }
  }

  /** --------------------------------------------
   *  UI
   * -------------------------------------------- */
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
        startY.current = e.touches[0].clientY;
      }}
      onTouchEnd={(e) => {
        const dist = startY.current - e.changedTouches[0].clientY;
        if (dist > 25) {
          const power = Math.min(1, Math.max(0, dist / 450));
          handleShot(power);
        }
      }}
    >
      {/* COUNTDOWN OVERLAY */}
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
            textShadow: "0 0 60px rgba(255,0,0,0.9)",
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

      {/* SWIPE MESSAGE */}
      <div
        style={{
          position: "absolute",
          bottom: "5%",
          width: "100%",
          textAlign: "center",
          color: "#ccc",
          fontSize: "2rem",
          opacity: displayCountdown !== null ? 0 : 1,
        }}
      >
        SWIPE UP TO SHOOT
      </div>
    </div>
  );
}
