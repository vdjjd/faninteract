"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useCountdown } from "@/app/basketball/hooks/useCountdown";
import { Countdown } from "@/app/basketball/components/Countdown";

/* -----------------------------------------------------------
   CELL COLORS
----------------------------------------------------------- */
const CELL_COLORS = [
  "#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#5AC8FA",
  "#007AFF", "#5856D6", "#AF52DE", "#FF2D55", "#A2845E",
];

export default function ShooterPage({ params }: { params: { gameId: string } }) {
  const { gameId } = params;

  /* -----------------------------------------------------------
     COUNTDOWN (NUMBER | NULL)
----------------------------------------------------------- */
  const countdownValue = useCountdown(gameId);

  /* -----------------------------------------------------------
     PLAYER INFO
----------------------------------------------------------- */
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [laneIndex, setLaneIndex] = useState<number | null>(null);

  /* -----------------------------------------------------------
     SCORE + TIMER
----------------------------------------------------------- */
  const [score, setScore] = useState(0);
  const [laneColor, setLaneColor] = useState("#222");
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const startY = useRef(0);
  const streakRef = useRef(0);

  /* -----------------------------------------------------------
     LOAD PLAYER FROM DB
----------------------------------------------------------- */
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
        .maybeSingle();

      if (!data) return;

      setLaneIndex(data.lane_index);
      setLaneColor(CELL_COLORS[data.lane_index]);
      setScore(data.score ?? 0);
    }

    loadPlayer();
    const int = setInterval(loadPlayer, 1100);
    return () => clearInterval(int);
  }, [playerId]);

  /* -----------------------------------------------------------
     GAME START SYNC
----------------------------------------------------------- */
  async function syncGameStart() {
    const { data } = await supabase
      .from("bb_games")
      .select("*")
      .eq("id", gameId)
      .maybeSingle();

    if (!data?.game_running || !data.game_timer_start) return;

    const start = new Date(data.game_timer_start).getTime();
    const now = Date.now();

    const elapsed = Math.floor((now - start) / 1000);
    setTimeLeft(Math.max(data.duration_seconds - elapsed, 0));
  }

  /* RECEIVE Supabase → start_game broadcast */
  useEffect(() => {
    const channel = supabase
      .channel(`basketball-${gameId}`)
      .on("broadcast", { event: "start_game" }, syncGameStart)
      .subscribe();

    return () => {
      try { supabase.removeChannel(channel); } catch {}
    };
  }, [gameId]);

  /* RECEIVE "start_countdown" → ensure phone reacts instantly */
  useEffect(() => {
    const channel = supabase
      .channel(`basketball-${gameId}-shooter`)
      .on("broadcast", { event: "start_countdown" }, () => {
        // Shooter uses useCountdown, so we simply forward
        window.postMessage({ type: "start_countdown" }, "*");
      })
      .subscribe();

    return () => {
      try { supabase.removeChannel(channel); } catch {}
    };
  }, [gameId]);

  /* postMessage listener — needed for cross-window sync */
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.data?.type === "start_game") syncGameStart();
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  /* -----------------------------------------------------------
     TIMER POLLING (every 1s after start)
----------------------------------------------------------- */
  useEffect(() => {
    async function pullTimer() {
      const { data } = await supabase
        .from("bb_games")
        .select("*")
        .eq("id", gameId)
        .maybeSingle();

      if (!data?.game_running || !data.game_timer_start) return;

      const start = new Date(data.game_timer_start).getTime();
      const now = Date.now();
      const elapsed = Math.floor((now - start) / 1000);
      setTimeLeft(Math.max(data.duration_seconds - elapsed, 0));
    }

    pullTimer();
    const int = setInterval(pullTimer, 1000);
    return () => clearInterval(int);
  }, [gameId]);

  /* -----------------------------------------------------------
     SHOOT LOGIC
----------------------------------------------------------- */
  async function handleShot(power: number) {
    if (!playerId || laneIndex === null) return;

    // BLOCK DURING COUNTDOWN
    if (countdownValue !== null) return;

    const isRainbow = power > 0.82;
    const streak = streakRef.current;

    // Send shot to wall for animation
    supabase.channel(`basketball-${gameId}`).send({
      type: "broadcast",
      event: "shot_fired",
      payload: {
        lane_index: laneIndex,
        power,
        streak,
      },
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

  /* -----------------------------------------------------------
     TOUCH HANDLERS
----------------------------------------------------------- */
  function onTouchStart(e: React.TouchEvent) {
    startY.current = e.touches[0].clientY;
  }

  function onTouchEnd(e: React.TouchEvent) {
    const endY = e.changedTouches[0].clientY;
    const distance = startY.current - endY;

    if (distance < 25) return;

    const power = Math.min(1, Math.max(0, distance / 450));
    handleShot(power);
  }

  /* -----------------------------------------------------------
     RENDER UI
----------------------------------------------------------- */
  return (
    <div
      id="lane-border"
      style={{
        width: "100vw",
        height: "100vh",
        background: "black",
        border: `8px solid ${laneColor}`,
        overflow: "hidden",
        position: "relative",
        touchAction: "none",
        userSelect: "none",
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* FULLSCREEN COUNTDOWN */}
      <Countdown preCountdown={countdownValue} />

      {/* SCORE */}
      <div
        style={{
          position: "absolute",
          top: 20,
          left: 20,
          color: "white",
          fontSize: "2.5rem",
          fontWeight: 900,
          zIndex: 20,
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
          fontWeight: 900,
          fontFamily: "Digital, monospace",
          zIndex: 20,
        }}
      >
        {timeLeft ?? "--"}
      </div>

      {/* INSTRUCTIONS */}
      <div
        style={{
          position: "absolute",
          bottom: "5%",
          width: "100%",
          textAlign: "center",
          color: "#ddd",
          fontSize: "2rem",
          opacity: 0.7,
          zIndex: 20,
        }}
      >
        SWIPE UP TO SHOOT
      </div>
    </div>
  );
}
