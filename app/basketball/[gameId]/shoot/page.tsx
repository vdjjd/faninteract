"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { usePhysicsEngine } from "@/app/basketball/hooks/usePhysicsEngine";
import { useCountdown } from "@/app/basketball/hooks/useCountdown";
import { Countdown } from "@/app/basketball/components/Countdown";

/* -----------------------------------------------------------
   LANE COLORS
----------------------------------------------------------- */
const CELL_COLORS = [
  "#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#5AC8FA",
  "#007AFF", "#5856D6", "#AF52DE", "#FF2D55", "#A2845E",
];

export default function ShooterPage({ params }: { params: { gameId: string } }) {
  const { gameId } = params;

  const countdownValue = useCountdown(gameId);

  const [playerId, setPlayerId] = useState<string | null>(null);
  const [laneIndex, setLaneIndex] = useState<number | null>(null);

  const { balls, spawnBall } = usePhysicsEngine(true);

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
    setFx(prev => ({ ...prev, [type]: true }));
    setTimeout(() => setFx(prev => ({ ...prev, [type]: false })), 380);
  }

  /* LOAD PLAYER */
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

  /* LISTEN FOR START GAME */
  useEffect(() => {
    const channel = supabase
      .channel(`basketball-${gameId}`)
      .on("broadcast", { event: "start_game" }, () => {
        syncGameStart();
      })
      .subscribe();

    return () => { try { supabase.removeChannel(channel); } catch {} };
  }, [gameId]);

  useEffect(() => {
    function handleMsg(e: MessageEvent) {
      if (e.data?.type === "start_game") syncGameStart();
    }

    window.addEventListener("message", handleMsg);
    return () => window.removeEventListener("message", handleMsg);
  }, []);

  /* SYNC TIMER */
  async function syncGameStart() {
    const { data } = await supabase
      .from("bb_games")
      .select("*")
      .eq("id", gameId)
      .single();

    if (!data) return;

    if (data.game_running && data.game_timer_start) {
      const start = new Date(data.game_timer_start).getTime();
      const now = Date.now();
      const elapsed = Math.floor((now - start) / 1000);
      setTimeLeft(Math.max(data.duration_seconds - elapsed, 0));
    }
  }

  /* TIMER LOOP */
  useEffect(() => {
    async function pullTimer() {
      const { data } = await supabase
        .from("bb_games")
        .select("*")
        .eq("id", gameId)
        .single();

      if (!data) return;

      if (data.game_running && data.game_timer_start) {
        const start = new Date(data.game_timer_start).getTime();
        const now = Date.now();
        const elapsed = Math.floor((now - start) / 1000);
        setTimeLeft(Math.max(data.duration_seconds - elapsed, 0));
      }
    }

    pullTimer();
    const int = setInterval(pullTimer, 1000);
    return () => clearInterval(int);
  }, [gameId]);

  /* BORDER EFFECT */
  function pulseBorder() {
    const el = document.getElementById("lane-border");
    if (!el) return;
    el.classList.remove("border-pulse");
    void el.offsetWidth;
    el.classList.add("border-pulse");
  }

  /* SHOOT */
  async function handleShot(power: number) {
    if (laneIndex === null || !playerId) return;
    if (countdownValue !== null) return;

    const isRainbow = power > 0.82;
    const isFire = streakRef.current >= 2;

    if (isRainbow) flash("rainbowFlash");
    if (isFire) flash("fireFlash");

    pulseBorder();

    spawnBall(laneIndex, power, { rainbow: isRainbow, fire: isFire });

    supabase.channel(`basketball-${gameId}`).send({
      type: "broadcast",
      event: "shot_fired",
      payload: { lane_index: laneIndex, power, streak: streakRef.current },
    });

    const made = Math.random() < (0.45 + power * 0.35);

    if (made) {
      streakRef.current += 1;
      flash("hitFlash");
      await supabase.rpc("increment_player_score", { p_player_id: playerId });
    } else {
      streakRef.current = 0;
      flash("missFlash");
    }
  }

  /* TOUCH CONTROLS */
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

  /* RENDER UI */
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

      {fx.fireFlash && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(255,80,0,0.28)",
            boxShadow: "inset 0 0 90px rgba(255,120,0,1)",
            animation: "fireFlashAnim 0.38s ease-out",
            pointerEvents: "none",
            zIndex: 10,
          }}
        />
      )}

      {/* FIXED BALL LOOP */}
      {balls.flat().map(ball => (
        <div
          key={ball.id}
          style={{
            position: "absolute",
            left: `${ball.x}%`,
            top: `${ball.y}%`,
            width: `${ball.size}%`,
            height: `${ball.size}%`,
            borderRadius: "50%",
            background: "radial-gradient(circle, #ff7b00, #ff4500)",
            transform: "translate(-50%, -50%)",
            zIndex: 5,
          }}
        />
      ))}

      <div style={{
        position: "absolute",
        top: 20,
        left: 20,
        color: "white",
        fontSize: "2.5rem",
        fontWeight: 900,
        zIndex: 20,
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
        zIndex: 20,
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
        zIndex: 20,
      }}>
        SWIPE UP TO SHOOT
      </div>

      <style>{`
        @keyframes fireFlashAnim { 0% {opacity:1;} 100% {opacity:0;} }

        @keyframes borderPulse {
          0%   { border-width: 8px; transform: translate(0,0); }
          25%  { border-width: 10px; transform: translate(1px, -1px); }
          50%  { border-width: 8px; transform: translate(-1px, 1px); }
          75%  { border-width: 9px; transform: translate(0px,0px); }
          100% { border-width: 8px; transform: translate(0,0); }
        }

        .border-pulse {
          animation: borderPulse 0.22s ease-out;
        }
      `}</style>
    </div>
  );
}
