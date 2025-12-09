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
  /* ------------------------------------------------------------
     COUNTDOWN + GAME TIMER
  ------------------------------------------------------------ */
  const countdownValue = useCountdown(gameId);
  const { duration, timeLeft, timerExpired, gameRunning } =
    useGameTimer(gameId);

  /* ------------------------------------------------------------
     GAME START LISTENER (INSTANT START)
     This fixes the bug where gameRunning doesn't flip until DB update.
  ------------------------------------------------------------ */
  useEffect(() => {
    const channel = supabase
      .channel(`basketball-${gameId}`)
      .on("broadcast", { event: "start_game" }, (payload) => {
        console.log("⏱ START GAME RECEIVED (Active Wall)", payload);
        // We do NOT need additional logic here because useGameTimer
        // now handles event-driven timer start instantly.
      })
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, [gameId]);

  /* ------------------------------------------------------------
     BALL PHYSICS ENABLED AFTER COUNTDOWN + GAME START
  ------------------------------------------------------------ */
  const physicsEnabled = gameRunning && countdownValue === null;
  const { balls, spawnBall } = usePhysicsEngine(physicsEnabled);

  /* ------------------------------------------------------------
     PLAYERS
  ------------------------------------------------------------ */
  const players = usePlayers(gameId);
  const maxScore =
    players.length > 0 ? Math.max(...players.map((p) => p.score ?? 0)) : 0;

  /* ------------------------------------------------------------
     HOST LOGO (same logic as InactiveWall)
  ------------------------------------------------------------ */
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

  /* ------------------------------------------------------------
     LISTEN FOR SHOT EVENTS
  ------------------------------------------------------------ */
  useEffect(() => {
    const channel = supabase
      .channel(`basketball-${gameId}`)
      .on("broadcast", { event: "shot_fired" }, (payload) => {
        const p = payload?.payload;
        if (!p) return;
        if (p.gameId && p.gameId !== gameId) return;

        // no balls during countdown
        if (countdownValue !== null) return;

        spawnBall(p.lane_index, p.power, {
          rainbow: p.power > 0.82,
          fire: p.streak >= 2,
        });
      })
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, [gameId, spawnBall, countdownValue]);

  /* ------------------------------------------------------------
     FULLSCREEN BUTTON
  ------------------------------------------------------------ */
  const toggleFullscreen = () =>
    !document.fullscreenElement
      ? document.documentElement.requestFullscreen()
      : document.exitFullscreen();

  /* ------------------------------------------------------------
     RENDER UI
  ------------------------------------------------------------ */
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#050A18",
        padding: 20,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* COUNTDOWN ALWAYS ON TOP */}
      <Countdown preCountdown={countdownValue} />

      {/* PLAYER GRID */}
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
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontSize: 20,
        }}
      >
        ⛶
      </div>
    </div>
  );
}
