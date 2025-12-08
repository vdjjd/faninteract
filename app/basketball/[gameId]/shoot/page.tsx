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
     COUNTDOWN (number or null)
     ❗ FIXED LINE BELOW
  ----------------------------------------------------------- */
  const countdownValue = useCountdown(gameId);   // ← FIXED

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

  const [fx, setFx] = useState({
    fireFlash: false,
    rainbowFlash: false,
    hitFlash: false,
    missFlash: false,
  });

  function flash(type: keyof typeof fx) {
    setFx((prev) => ({ ...prev, [type]: true }));
    setTimeout(() => {
      setFx((prev) => ({ ...prev, [type]: false }));
    }, 380);
  }

  /* -----------------------------------------------------------
     LOAD PLAYER
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
        .single();

      if (!data) return;

      setLaneIndex(data.lane_index);
      setLaneColor(CELL_COLORS[data.lane_index]);
      setScore(data.score ?? 0);
    }

    loadPlayer();
    const int = setInterval(loadPlayer, 1200);
    return () => clearInterval(int);
  }, [playerId]);

  /* -----------------------------------------------------------
     GAME START → Sync timer
----------------------------------------------------------- */
  async function syncGameStart() {
    const { data } = await supabase
      .from("bb_games")
      .select("*")
      .eq("id", gameId)
      .single();

    if (!data) return;
    if (!data.game_running || !data.game_timer_start) return;

    const start = new Date(data.game_timer_start).getTime();
    const now = Date.now();
    const elapsed = Math.floor((now - start) / 1000);
    setTimeLeft(Math.max(data.duration_seconds - elapsed, 0));
  }

  /* SUPABASE LISTENER — FIXED */
  useEffect(() => {
    let channel: any = null;

    async function setup() {
      channel = supabase
        .channel(`basketball-${gameId}`)
        .on("broadcast", { event: "start_game" }, syncGameStart);

      await channel.subscribe();
    }

    setup();

    return () => {
      try {
        if (channel) supabase.removeChannel(channel);
      } catch {}
    };
  }, [gameId]);

  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.data?.type === "start_game") syncGameStart();
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  /* -----------------------------------------------------------
     GAME TIMER LOOP
----------------------------------------------------------- */
  useEffect(() => {
    async function pullTimer() {
      const { data } = await supabase
        .from("bb_games")
        .select("*")
        .eq("id", gameId)
        .single();

      if (!data) return;
      if (!data.game_running || !data.game_timer_start) return;

      const start = new Date(data.game_timer_start).getTime();
      const now = Date.now();
      const elapsed = Math.floor((now - start) / 1000);

      setTimeLeft(Math.max(data.duration_seconds - elapsed, 0));
    }

    pullTimer();
    const int = setInterval(pullTimer, 1000);
    return () => clearInterval(int);
  }, [gameId]);

  /* BORDER PULSE */
  function pulseBorder() {
    const el = document.getElementById("lane-border");
    if (!el) return;
    el.classList.remove("border-pulse");
    void el.offsetWidth;
    el.classList.add("border-pulse");
  }

  /* SHOOT LOGIC */
  async function handleShot(power: number) {
    if (!playerId || laneIndex === null) return;
    if (countdownValue !== null) return; // 🔥 STILL WORKS — countdownValue is now a number

    const isRainbow = power > 0.82;
    const isFire = streakRef.current >= 2;

    if (isRainbow) flash("rainbowFlash");
    if (isFire) flash("fireFlash");

    pulseBorder();

    supabase.channel(`basketball-${gameId}`).send({
      type: "broadcast",
      event: "shot_fired",
      payload: { lane_index: laneIndex, power, streak: streakRef.current },
    });

    const made = Math.random() < (0.45 + power * 0.35);

    if (made) {
      streakRef.current++;
      flash("hitFlash");
      await supabase.rpc("increment_player_score", { p_player_id: playerId });
    } else {
      streakRef.current = 0;
      flash("missFlash");
    }
  }

  /* TOUCH HANDLERS */
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

  /* UI */
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
      <Countdown preCountdown={countdownValue} />

      <div style={{
        position: "absolute",
        top: 20,
        left: 20,
        color: "white",
        fontSize: "2.5rem",
        fontWeight: 900,
        zIndex: 20
      }}>
        {score}
      </div>

      <div style={{
        position: "absolute",
        top: 20,
        right: 20,
        color: "white",
        fontSize: "2.5rem",
        fontWeight: 900,
        fontFamily: "Digital, monospace",
        zIndex: 20
      }}>
        {timeLeft ?? "--"}
      </div>

      <div style={{
        position: "absolute",
        bottom: "5%",
        width: "100%",
        textAlign: "center",
        color: "#ddd",
        fontSize: "2rem",
        opacity: 0.7,
        zIndex: 20
      }}>
        SWIPE UP TO SHOOT
      </div>

      <style>{`
        @keyframes fireFlashAnim { 
          0% {opacity:1;} 
          100% {opacity:0;} 
        }

        @keyframes borderPulse {
          0%   { border-width: 8px; }
          50%  { border-width: 12px; }
          100% { border-width: 8px; }
        }

        .border-pulse {
          animation: borderPulse 0.22s ease-out;
        }
      `}</style>
    </div>
  );
}
