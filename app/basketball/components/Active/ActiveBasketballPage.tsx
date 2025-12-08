"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import { usePlayers } from "@/app/basketball/hooks/usePlayers";
import { useCountdown } from "@/app/basketball/hooks/useCountdown";
import { useGameTimer } from "@/app/basketball/hooks/useGameTimer";
import { usePhysicsEngine } from "@/app/basketball/hooks/usePhysicsEngine";

import PlayerCard from "@/app/basketball/components/Active/PlayerCard";
import { Countdown } from "@/app/basketball/components/Countdown";

const CELL_COLORS = [
  "#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#5AC8FA",
  "#007AFF", "#5856D6", "#AF52DE", "#FF2D55", "#A2845E",
];

export default function ActiveBasketballPage({
  gameId,
}: {
  gameId: string;
}) {

  const [hostLogo, setHostLogo] = useState<string | null>(null);

  useEffect(() => {
    async function loadHostLogo() {
      const { data: gameRow } = await supabase
        .from("bb_games")
        .select("host_id")
        .eq("id", gameId)
        .single();

      if (!gameRow?.host_id) return;

      const { data: hostRow } = await supabase
        .from("hosts")
        .select("branding_logo_url, logo_url")
        .eq("id", gameRow.host_id)
        .single();

      if (hostRow?.branding_logo_url?.trim()) setHostLogo(hostRow.branding_logo_url);
      else if (hostRow?.logo_url?.trim()) setHostLogo(hostRow.logo_url);
      else setHostLogo("/faninteractlogo.png");
    }

    loadHostLogo();
  }, [gameId]);


  const countdownValue = useCountdown(gameId);

  const {
    duration,
    timeLeft,
    timerExpired,
    gameRunning,
  } = useGameTimer(gameId);

  const { balls, spawnBall } = usePhysicsEngine(gameRunning);


  useEffect(() => {
    const channel = supabase
      .channel(`basketball-${gameId}`)
      .on("broadcast", { event: "shot_fired" }, (payload) => {
        const { lane_index, power, streak } = payload.payload;
        const rainbow = power > 0.82;
        const fire = streak >= 2;
        spawnBall(lane_index, power, { rainbow, fire });
      })
      .subscribe();

    return () => {
      try { supabase.removeChannel(channel); } catch {}
    };
  }, [gameId, spawnBall]);


  const players = usePlayers(gameId);
  const maxScore = players.length ? Math.max(...players.map((p) => p.score), 0) : 0;


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
      <Countdown preCountdown={countdownValue} />

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
          const laneBalls = balls[i] || [];
          const score = player?.score ?? 0;

          return (
            <PlayerCard
              key={i}
              index={i}
              player={player}
              balls={laneBalls}
              timeLeft={timeLeft ?? duration}
              score={score}
              borderColor={CELL_COLORS[i]}
              timerExpired={timerExpired}
              hostLogo={hostLogo}
              maxScore={maxScore}
            />
          );
        })}
      </div>

      <div
        onClick={() => {
          if (!document.fullscreenElement)
            document.documentElement.requestFullscreen().catch(() => {});
          else document.exitFullscreen();
        }}
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
          justifyContent: "center",
          alignItems: "center",
          fontSize: "1.4rem",
          color: "#fff",
          zIndex: 50,
        }}
      >
        ⛶
      </div>
    </div>
  );
}
