"use client";

import React, { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Countdown } from "../Countdown";
import { usePlayers } from "@/app/basketball/hooks/usePlayers";
import { useCountdown } from "@/app/basketball/hooks/useCountdown";
import { useGameTimer } from "@/app/basketball/hooks/useGameTimer";
import SingleLaneDemo, {
  ShotHandle,
} from "@/app/basketball/dev/SingleLaneDemo";

const CELL_COLORS = [
  "#FF3B30",
  "#FF9500",
  "#FFCC00",
  "#34C759",
  "#5AC8FA",
  "#007AFF",
  "#5856D6",
  "#AF52DE",
  "#FF2D55",
  "#A2845E",
];

export default function ActiveBasketballPage({
  gameId,
}: {
  gameId: string;
}) {
  const countdownValue = useCountdown(gameId);
  const { duration, timeLeft, timerExpired } = useGameTimer(gameId);
  const players = usePlayers(gameId);

  const laneRefs = useRef<Record<number, ShotHandle | null>>({});
  const [hostLogo, setHostLogo] = useState<string | null>(null);

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
     REALTIME: RECEIVE SHOT → FIRE LANE
  ------------------------------------------------------------ */
  useEffect(() => {
    const ch = supabase
      .channel(`basketball-${gameId}`, {
        config: { broadcast: { ack: true } },
      })
      .on("broadcast", { event: "shot_fired" }, (event) => {
        const lane = event?.payload?.lane_index;
        if (lane === undefined) return;

        laneRefs.current[lane]?.shoot();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [gameId]);

  const maxScore =
    players.length > 0
      ? Math.max(...players.map((p) => p.score ?? 0))
      : 0;

  const toggleFullscreen = () =>
    !document.fullscreenElement
      ? document.documentElement.requestFullscreen()
      : document.exitFullscreen();

  /* ------------------------------------------------------------
     RENDER
  ------------------------------------------------------------ */
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#050A18",
        padding: 20,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <Countdown preCountdown={countdownValue} />

      <div
        style={{
          width: "94vw",
          height: "90vh",
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gridTemplateRows: "repeat(2, 1fr)",
          gap: "1.5vh",
        }}
      >
        {Array.from({ length: 10 }).map((_, laneIndex) => {
          const player = players.find((p) => p.cell === laneIndex);

          return (
            <div
              key={laneIndex}
              style={{
                position: "relative",
                borderRadius: 20,
                border: `5px solid ${CELL_COLORS[laneIndex]}`,
                overflow: "hidden",
              }}
            >
              {/* 2.5D LANE */}
              <SingleLaneDemo
                ref={(el) => {
                  laneRefs.current[laneIndex] = el;
                }}
              />

              {/* PLAYER LABEL */}
              <div
                style={{
                  position: "absolute",
                  top: 6,
                  left: 10,
                  padding: "4px 10px",
                  borderRadius: 8,
                  background: CELL_COLORS[laneIndex],
                  color: "white",
                  fontWeight: 800,
                  zIndex: 20,
                }}
              >
                P{laneIndex + 1}
              </div>

              {/* SCORE */}
              <div
                style={{
                  position: "absolute",
                  bottom: 10,
                  right: 10,
                  fontSize: "2.6rem",
                  fontFamily: "Digital, monospace",
                  fontWeight: 900,
                  color: "#ff2d2d",
                  zIndex: 20,
                }}
              >
                {player?.score ?? 0}
              </div>
            </div>
          );
        })}
      </div>

      {/* FULLSCREEN */}
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
