"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import { usePlayers } from "@/app/basketball/hooks/usePlayers";
import { useCountdown } from "@/app/basketball/hooks/useCountdown";
import { useGameTimer } from "@/app/basketball/hooks/useGameTimer";
import { usePhysicsEngine } from "@/app/basketball/hooks/usePhysicsEngine";

import PlayerCard from "./PlayerCard";
import { Countdown } from "../Countdown";

const CELL_COLORS = [
  "#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#5AC8FA",
  "#007AFF", "#5856D6", "#AF52DE", "#FF2D55", "#A2845E",
];

export default function ActiveBasketballPage({ gameId }: { gameId: string }) {
  if (!gameId) {
    console.error("❌ Active wall mounted with NO gameId.");
    return null;
  }

  /* ----------------------------------------------
     COUNTDOWN + GAME TIMER
  ---------------------------------------------- */
  const countdownValue = useCountdown(gameId);
  const { duration, timeLeft, timerExpired, gameRunning } =
    useGameTimer(gameId);

  /* ----------------------------------------------
     PHYSICS — ENABLE ONLY AFTER COUNTDOWN
  ---------------------------------------------- */
  const physicsEnabled = gameRunning && countdownValue === null;
  const { balls, spawnBall } = usePhysicsEngine(physicsEnabled);

  /* ----------------------------------------------
     PLAYERS
  ---------------------------------------------- */
  const players = usePlayers(gameId);
  const maxScore =
    players.length ? Math.max(...players.map((p) => p.score ?? 0)) : 0;

  /* ----------------------------------------------
     HOST LOGO
  ---------------------------------------------- */
  const [hostLogo, setHostLogo] = useState<string | null>(null);

  useEffect(() => {
    async function loadHost() {
      const { data: gameRow } = await supabase
        .from("bb_games")
        .select("host_id")
        .eq("id", gameId)
        .single();

      if (!gameRow?.host_id) {
        setHostLogo("/faninteractlogo.png");
        return;
      }

      const { data: host } = await supabase
        .from("hosts")
        .select("logo_url, branding_logo_url")
        .eq("id", gameRow.host_id)
        .single();

      setHostLogo(
        host?.branding_logo_url?.trim() ||
        host?.logo_url?.trim() ||
        "/faninteractlogo.png"
      );
    }

    loadHost();
  }, [gameId]);

  /* ----------------------------------------------
     RECEIVE SHOT EVENTS
     (new physics: vx + vy + power)
  ---------------------------------------------- */
  useEffect(() => {
    const ch = supabase
      .channel(`basketball-${gameId}`)
      .on("broadcast", { event: "shot_fired" }, (payload) => {
        const p = payload?.payload;
        if (!p) return;

        if (countdownValue !== null) return;

        spawnBall(
          p.lane_index,      // lane
          p.power,           // power
          {
            rainbow: p.power > 0.82,
            fire: p.streak >= 2,
          },
          p.vx ?? 0,         // horizontal
          p.vy ?? -0.05      // vertical
        );
      })
      .subscribe();

    return () => {
      try { supabase.removeChannel(ch); } catch {}
    };
  }, [gameId, spawnBall, countdownValue]);

  /* ----------------------------------------------
     FULLSCREEN BUTTON
  ---------------------------------------------- */
  const toggleFullscreen = () =>
    !document.fullscreenElement
      ? document.documentElement.requestFullscreen()
      : document.exitFullscreen();

  /* ----------------------------------------------
     RENDER
  ---------------------------------------------- */
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#050A18",
        padding: 20,
        overflow: "hidden",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        position: "relative",
      }}
    >
      {/* COUNTDOWN OVERLAY */}
      <Countdown preCountdown={countdownValue} />

      {/* GRID OF 10 LANES */}
      <div
        style={{
          width: "94vw",
          height: "90vh",
          display: "grid",
          gap: "1.5vh",
          gridTemplateColumns: "repeat(5, 1fr)",
          gridTemplateRows: "repeat(2, 1fr)",
        }}
      >
        {Array.from({ length: 10 }).map((_, i) => {
          const player = players.find((p) => p.cell === i);

          return (
            <PlayerCard
              key={i}
              index={i}
              player={player}
              balls={balls[i] || []}
              timeLeft={timeLeft ?? duration}
              score={player?.score ?? 0}
              borderColor={CELL_COLORS[i]}
              timerExpired={timerExpired}
              maxScore={maxScore}
              hostLogo={hostLogo}
            />
          );
        })}
      </div>

      {/* FULLSCREEN BUTTON */}
      <div
        onClick={toggleFullscreen}
        style={{
          position: "absolute",
          bottom: "2vh",
          right: "2vw",
          width: 42,
          height: 42,
          borderRadius: 12,
          background: "rgba(255,255,255,0.1)",
          border: "1px solid rgba(255,255,255,0.25)",
          cursor: "pointer",
          color: "#fff",
          display: "flex",
          fontSize: 20,
          alignItems: "center",
          justifyContent: "center",
          zIndex: 500,
        }}
      >
        ⛶
      </div>
    </div>
  );
}
