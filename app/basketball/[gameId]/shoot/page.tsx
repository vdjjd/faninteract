"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const CELL_COLORS = [
  "#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#5AC8FA",
  "#007AFF", "#5856D6", "#AF52DE", "#FF2D55", "#A2845E",
];

export default function ShooterPage({ params }: { params: { gameId: string } }) {
  const { gameId } = params;

  /* ------------------------------------------------------------
     LOCAL COUNTDOWN — Shooter ONLY
  ------------------------------------------------------------ */
  const [countdown, setCountdown] = useState<number | null>(null);

  /* ------------------------------------------------------------
     PLAYER + LANE
  ------------------------------------------------------------ */
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [laneIndex, setLaneIndex] = useState<number | null>(null);
  const [laneColor, setLaneColor] = useState("#222");
  const [score, setScore] = useState(0);

  /* ------------------------------------------------------------
     GAME TIMER (top-right)
  ------------------------------------------------------------ */
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const startY = useRef(0);
  const streakRef = useRef(0);

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
    const t = setInterval(loadPlayer, 1000);
    return () => clearInterval(t);
  }, [playerId]);

  /* ------------------------------------------------------------
     GAME TIMER SYNC
  ------------------------------------------------------------ */
  async function syncGameStart(startTime: string | null) {
    if (!startTime) return;

    const startMS = new Date(startTime).getTime();
    const elapsed = Math.floor((Date.now() - startMS) / 1000);

    const { data } = await supabase
      .from("bb_games")
      .select("duration_seconds")
      .eq("id", gameId)
      .single();

    const duration = data?.duration_seconds ?? 90;

    setTimeLeft(Math.max(duration - elapsed, 0));
  }

  /* ------------------------------------------------------------
     SUBSCRIBE TO WALL SIGNALS (COUNTDOWN + GAME START)
  ------------------------------------------------------------ */
  useEffect(() => {
    const channel = supabase
      .channel(`basketball-${gameId}`)

      // WALL STARTS THE COUNTDOWN → SHOOTER SHOWS FULL SCREEN
      .on("broadcast", { event: "start_countdown" }, () => {
        setCountdown(10);
      })

      // WALL ENDS COUNTDOWN → SHOOTER STARTS TIMER
      .on("broadcast", { event: "start_game" }, (payload) => {
        const startTime = payload?.payload?.startTime;
        syncGameStart(startTime);
        setCountdown(null);
      })

      .subscribe();

    return () => {
      try { supabase.removeChannel(channel); } catch {}
    };
  }, [gameId]);

  /* ------------------------------------------------------------
     COUNTDOWN TICKER
  ------------------------------------------------------------ */
  useEffect(() => {
    if (countdown === null) return;

    if (countdown <= 0) {
      setCountdown(null);
      return;
    }

    const t = setTimeout(() => {
      setCountdown((c) => (c !== null ? c - 1 : null));
    }, 1000);

    return () => clearTimeout(t);
  }, [countdown]);

  /* ------------------------------------------------------------
     SYNC TIMER EVERY SECOND
  ------------------------------------------------------------ */
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
     SHOOT LOGIC — DISABLE DURING COUNTDOWN
  ------------------------------------------------------------ */
  async function handleShot(power: number) {
    if (countdown !== null) return;
    if (!playerId || laneIndex === null) return;

    supabase.channel(`basketball-${gameId}`).send({
      type: "broadcast",
      event: "shot_fired",
      payload: {
        lane_index: laneIndex,
        power,
        streak: streakRef.current,
      },
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
     RENDER
  ------------------------------------------------------------ */
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
      {/* FULLSCREEN COUNTDOWN */}
      {countdown !== null && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.88)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            fontSize: "clamp(4rem, 10vw, 12rem)",
            color: "white",
            fontWeight: 900,
            zIndex: 9999,
            textShadow: "0 0 40px rgba(255,0,0,0.9)",
          }}
        >
          {countdown > 0 ? countdown : "START!"}
        </div>
      )}

      {/* SCORE */}
      <div
        style={{
          position: "absolute",
          top: 20,
          left: 20,
          fontSize: "2.6rem",
          fontWeight: 700,
          color: "white",
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
          fontSize: "2.6rem",
          fontWeight: 700,
          color: "white",
        }}
      >
        {timeLeft !== null ? timeLeft : "--"}
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
          opacity: countdown !== null ? 0 : 1,
        }}
      >
        SWIPE UP TO SHOOT
      </div>
    </div>
  );
}
