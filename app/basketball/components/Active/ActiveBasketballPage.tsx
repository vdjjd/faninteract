"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import PlayerCard from "./PlayerCard";
import { Countdown } from "../Countdown";
import { usePlayers } from "@/app/basketball/hooks/usePlayers";
import { useCountdown } from "@/app/basketball/hooks/useCountdown";
import { useGameTimer } from "@/app/basketball/hooks/useGameTimer";

const CELL_COLORS = [
  "#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#5AC8FA",
  "#007AFF", "#5856D6", "#AF52DE", "#FF2D55", "#A2845E",
];

export default function ActiveBasketballPage({ gameId }: { gameId: string }) {

  console.log("ACTIVE WALL MOUNTED with gameId =", gameId);

  const countdownValue = useCountdown(gameId);
  const { duration, timeLeft, timerExpired } = useGameTimer(gameId);
  const players = usePlayers(gameId);

  const [hostLogo, setHostLogo] = useState<string | null>(null);
  const [animations, setAnimations] = useState<Record<number, string | null>>({});

  /* ------------------------------------------------------------
     LOAD HOST LOGO
  ------------------------------------------------------------ */
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
     REALTIME: RECEIVE shot_fired → PLAY animation
  ------------------------------------------------------------ */
  useEffect(() => {
    console.log("ACTIVE WALL: subscription effect running with gameId =", gameId);

    const ch = supabase
      .channel(`basketball-${gameId}`, {
        config: { broadcast: { ack: true } }
      })
      .on("broadcast", { event: "shot_fired" }, (event) => {

        console.log("🔥 ACTIVE WALL RECEIVED EVENT =", event);

        const p = event?.payload;
        if (!p) return;

        const lane = p.lane_index;
        const animName = p.animation;

        if (animName) {
          console.log(
            "🎬 PLAY ANIMATION:",
            animName,
            "→ LANE:", lane
          );

          // Trigger animation
          setAnimations((prev) => ({
            ...prev,
            [lane]: animName,
          }));

          // Reset so future clicks retrigger animation
          setTimeout(() => {
            setAnimations((prev) => ({
              ...prev,
              [lane]: null,
            }));
          }, 500); // clear slightly after animation finishes
        }
      })
      .subscribe((status) => {
        console.log("ACTIVE WALL CHANNEL STATUS =", status);
      });

    return () => {
      console.log("ACTIVE WALL: unsubscribing channel");
      try { supabase.removeChannel(ch); } catch {}
    };
  }, [gameId]);

  /* ------------------------------------------------------------
     OTHER UI LOGIC
  ------------------------------------------------------------ */
  const maxScore =
    players.length ? Math.max(...players.map((p) => p.score ?? 0)) : 0;

  const toggleFullscreen = () =>
    !document.fullscreenElement
      ? document.documentElement.requestFullscreen()
      : document.exitFullscreen();

  /* ------------------------------------------------------------
     RENDER WALL
  ------------------------------------------------------------ */
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
          const animationName = animations[i] ?? null;

          return (
            <PlayerCard
              key={i}
              index={i}
              player={player}
              timeLeft={timeLeft ?? duration}
              score={player?.score ?? 0}
              borderColor={CELL_COLORS[i]}
              timerExpired={timerExpired}
              maxScore={maxScore}
              hostLogo={hostLogo}
              animationName={animationName}
            />
          );
        })}
      </div>

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
