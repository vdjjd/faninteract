"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { usePhysicsEngine } from "@/app/basketball/hooks/usePhysicsEngine";

/* -----------------------------------------------------------
   LANE COLORS
----------------------------------------------------------- */
const CELL_COLORS = [
  "#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#5AC8FA",
  "#007AFF", "#5856D6", "#AF52DE", "#FF2D55", "#A2845E",
];

export default function ShooterPage({ params }: { params: { gameId: string } }) {
  const { gameId } = params;

  // Player info
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [laneIndex, setLaneIndex] = useState<number | null>(null);

  // Local physics
  const { balls, spawnBall } = usePhysicsEngine(true);

  // Score + UI
  const [score, setScore] = useState(0);
  const [laneColor, setLaneColor] = useState("#222");
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  // Swipe tracking
  const startY = useRef(0);

  // FIRE streak
  const streakRef = useRef(0);

  /* -----------------------------------------------------------
     SHOOTER FLASH EFFECT STATES
----------------------------------------------------------- */
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
    const int = setInterval(loadPlayer, 1000);
    return () => clearInterval(int);
  }, [playerId]);

  /* -----------------------------------------------------------
     GAME TIMER SYNC
----------------------------------------------------------- */
  useEffect(() => {
    async function loadGame() {
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
        const remaining = data.duration_seconds - elapsed;

        setTimeLeft(Math.max(remaining, 0));
      }
    }

    loadGame();
    const int = setInterval(loadGame, 1000);
    return () => clearInterval(int);
  }, [gameId]);

  /* -----------------------------------------------------------
     LOCAL BORDER-PULSE VIBRATION
----------------------------------------------------------- */
  function pulseBorder() {
    const el = document.getElementById("lane-border");
    if (!el) return;

    el.classList.remove("border-pulse");
    void el.offsetWidth;         // force reflow → re-trigger animation
    el.classList.add("border-pulse");
  }

  /* -----------------------------------------------------------
     SHOOT HANDLER
----------------------------------------------------------- */
  async function handleShot(power: number) {
    if (laneIndex === null || !playerId) return;

    const isRainbow = power > 0.82;
    const isFire = streakRef.current >= 2;

    // FX
    if (isRainbow) flash("rainbowFlash");
    if (isFire) flash("fireFlash");

    // BORDER VIBRATION ON ANY SHOT
    pulseBorder();

    // LOCAL BALL
    spawnBall(laneIndex, power, { rainbow: isRainbow, fire: isFire });

    // BROADCAST
    supabase.channel(`basketball-${gameId}`).send({
      type: "broadcast",
      event: "shot_fired",
      payload: { lane_index: laneIndex, power, streak: streakRef.current },
    });

    // SCORING
    const made = Math.random() < (0.45 + power * 0.35);

    if (made) {
      streakRef.current += 1;
      flash("hitFlash");

      await supabase.rpc("increment_player_score", {
        p_player_id: playerId,
      });
    } else {
      streakRef.current = 0;
      flash("missFlash");
    }
  }

  /* -----------------------------------------------------------
     SWIPE DETECTION
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
     RENDER
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
      {/* FLASH EFFECTS */}
      {fx.fireFlash && (
        <div style={{
          position: "absolute",
          inset: 0,
          background: "rgba(255,80,0,0.28)",
          boxShadow: "inset 0 0 90px rgba(255,120,0,1)",
          pointerEvents: "none",
          animation: "fireFlashAnim 0.38s ease-out",
          zIndex: 10,
        }}/>
      )}

      {fx.rainbowFlash && (
        <div style={{
          position: "absolute",
          inset: 0,
          background: "rgba(255,255,255,0.18)",
          backdropFilter: "hue-rotate(180deg) saturate(2)",
          pointerEvents: "none",
          animation: "rainbowFlashAnim 0.38s ease-out",
          zIndex: 10,
        }}/>
      )}

      {fx.hitFlash && (
        <div style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,255,120,0.22)",
          pointerEvents: "none",
          animation: "hitFlashAnim 0.38s ease-out",
          zIndex: 10,
        }}/>
      )}

      {fx.missFlash && (
        <div style={{
          position: "absolute",
          inset: 0,
          background: "rgba(255,0,0,0.22)",
          pointerEvents: "none",
          animation: "missFlashAnim 0.32s ease-out",
          zIndex: 10,
        }}/>
      )}

      {/* BALLS */}
      {balls.flat().map((ball) => (
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

      {/* SCORE */}
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

      {/* TIMER */}
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

      {/* INSTRUCTIONS */}
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

      {/* ---- KEYFRAMES: FX + BORDER-PULSE ---- */}
      <style>{`
        @keyframes fireFlashAnim { 0% {opacity:1;} 100% {opacity:0;} }
        @keyframes rainbowFlashAnim { 0% {opacity:1;} 100% {opacity:0;} }
        @keyframes hitFlashAnim { 0% {opacity:1;} 100% {opacity:0;} }
        @keyframes missFlashAnim { 0% {opacity:1;} 100% {opacity:0;} }

        @keyframes borderPulse {
          0%   { border-width: 8px; transform: translate(0,0); box-shadow: 0 0 0px rgba(255,255,255,0); }
          25%  { border-width: 10px; transform: translate(1px, -1px); box-shadow: 0 0 10px rgba(255,255,255,0.4); }
          50%  { border-width: 8px; transform: translate(-1px, 1px); box-shadow: 0 0 6px rgba(255,255,255,0.25); }
          75%  { border-width: 9px; transform: translate(0px,0px); box-shadow: 0 0 12px rgba(255,255,255,0.4); }
          100% { border-width: 8px; transform: translate(0,0); box-shadow: 0 0 0px rgba(255,255,255,0); }
        }

        .border-pulse {
          animation: borderPulse 0.22s ease-out;
        }
      `}</style>
    </div>
  );
}
