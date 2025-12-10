"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useCountdown } from "@/app/basketball/hooks/useCountdown";

const CELL_COLORS = [
  "#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#5AC8FA",
  "#007AFF", "#5856D6", "#AF52DE", "#FF2D55", "#A2845E",
];

const SHOW_ZONE_BORDERS = true;

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

  const swipeRef = useRef({ x: 0, y: 0, time: 0 });

  const [zoneSize, setZoneSize] = useState(120);

  useEffect(() => {
    const stored = localStorage.getItem("bb_player_id");
    if (stored) setPlayerId(stored);
  }, []);

  useEffect(() => {
    async function loadGame() {
      const { data } = await supabase
        .from("bb_games")
        .select("hitzone_size")
        .eq("id", gameId)
        .single();

      if (!data) return;

      let size = 120;
      if (data.hitzone_size === "small") size = 80;
      if (data.hitzone_size === "large") size = 180;

      setZoneSize(size);
    }
    loadGame();
  }, [gameId]);

  function getZones() {
    return {
      zone1: {
        x: window.innerWidth / 2,
        y: window.innerHeight * 0.18,
      },
      zone2: {
        x: window.innerWidth / 2,
        y: window.innerHeight * 0.48,
      },
    };
  }

  function isInsideZone(x: number, y: number) {
    const { zone1, zone2 } = getZones();
    const half = zoneSize / 2;

    const z1 =
      x > zone1.x - half &&
      x < zone1.x + half &&
      y > zone1.y - half &&
      y < zone1.y + half;

    const z2 =
      x > zone2.x - half &&
      x < zone2.x + half &&
      y > zone2.y - half &&
      y < zone2.y + half;

    return z1 || z2;
  }

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
    const interval = setInterval(loadPlayer, 1000);
    return () => clearInterval(interval);
  }, [playerId]);

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
      .on("broadcast", { event: "start_countdown" }, () =>
        setLocalCountdown(10)
      )
      .on("broadcast", { event: "start_game" }, () =>
        syncGameStart()
      )
      .on("broadcast", { event: "reset_game" }, () => {
        setLocalCountdown(null);
        setTimeLeft(null);
      })
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, [gameId]);

  /* --------------------------------------------------------
     FINAL FIX — PROPER ARC VALUES ARE SENT TO PHYSICS ENGINE
  -------------------------------------------------------- */
  async function handleShot({ vx, vy, power, touchX, touchY }) {
    if (!playerId || laneIndex === null) return;
    if (displayCountdown !== null) return;

    const zoneHit = isInsideZone(touchX, touchY);

    supabase.channel(`basketball-${gameId}`).send({
      type: "broadcast",
      event: "shot_fired",
      payload: {
        lane_index: laneIndex,
        vx,
        vy,
        power,
        zoneHit,
        madeExpected: zoneHit,
      },
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

        const vx = dx * 0.008;
        const vy = speed * 2.4;     // ⭐ FIXED — upward arc ALWAYS positive
        const power = Math.min(1, speed * 1.1);

        handleShot({
          vx,
          vy,
          power,
          touchX: t.clientX,
          touchY: t.clientY,
        });
      }}
    >
      {/* DEBUG ZONES */}
      {SHOW_ZONE_BORDERS && (() => {
        const { zone1, zone2 } = getZones();
        return (
          <>
            <div
              style={{
                position: "absolute",
                width: zoneSize,
                height: zoneSize,
                left: zone1.x - zoneSize / 2,
                top: zone1.y - zoneSize / 2,
                border: "4px solid red",
                borderRadius: 8,
                pointerEvents: "none",
                zIndex: 50,
              }}
            />
            <div
              style={{
                position: "absolute",
                width: zoneSize,
                height: zoneSize,
                left: zone2.x - zoneSize / 2,
                top: zone2.y - zoneSize / 2,
                border: "4px solid red",
                borderRadius: 8,
                pointerEvents: "none",
                zIndex: 50,
              }}
            />
          </>
        );
      })()}

      {/* COUNTDOWN */}
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
            textShadow: "0 0 40px red",
            zIndex: 1000,
          }}
        >
          {displayCountdown > 0 ? displayCountdown : "START!"}
        </div>
      )}

      {/* SCORE + TIMER */}
      <div style={{ position: "absolute", top: 20, left: 20, color: "white", fontSize: "2.5rem" }}>
        {score}
      </div>

      <div style={{ position: "absolute", top: 20, right: 20, color: "white", fontSize: "2.5rem" }}>
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
          opacity: displayCountdown !== null ? 0 : 1,
        }}
      >
        SWIPE UP TO SHOOT
      </div>
    </div>
  );
}
