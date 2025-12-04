"use client";

import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

/* ============================================================
   Adjustable Visual Tuning
============================================================ */
const BACKBOARD_SCALE = 1;
const RIM_SCALE = 1;
const SCORE_FONT_SCALE = 1.0;
const SELFIE_SIZE = 42;

/* ============================================================
   Unique Cell Border Colors
============================================================ */
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

/* ============================================================
   Types
============================================================ */
interface Player {
  id: string;
  nickname: string;
  selfie_url: string | null;
  score: number;
  cell: number;
}

/* ============================================================
   ACTIVE GAME PAGE
============================================================ */
export default function ActiveBasketballPage({
  gameId,
}: {
  gameId: string;
}) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [hostLogo, setHostLogo] = useState<string | null>(null);
  const channelRef = useRef<any>(null);

  /* ============================================================
     ⏱ COUNTDOWN OVERLAY
  ============================================================ */
  const [showCountdown, setShowCountdown] = useState(false);
  const [count, setCount] = useState(10);

  useEffect(() => {
    const url = new URL(window.location.href);
    const shouldCountdown = url.searchParams.get("countdown");

    if (!shouldCountdown) return;

    setShowCountdown(true);
    let c = 10;

    const timer = setInterval(() => {
      c -= 1;
      setCount(c);

      if (c <= 0) {
        clearInterval(timer);
        setTimeout(() => setShowCountdown(false), 600);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  /* ============================================================
     Load players
  ============================================================ */
  useEffect(() => {
    async function loadPlayers() {
      const { data } = await supabase
        .from("basketball_players")
        .select("*")
        .eq("game_id", gameId);

      setPlayers(data || []);
    }
    loadPlayers();
  }, [gameId]);

  /* ============================================================
     Load host branding logo
  ============================================================ */
  useEffect(() => {
    async function loadLogo() {
      const { data: game } = await supabase
        .from("basketball_games")
        .select("host_id")
        .eq("id", gameId)
        .single();

      if (!game?.host_id) {
        setHostLogo("/faninteractlogo.png");
        return;
      }

      const { data: host } = await supabase
        .from("hosts")
        .select("branding_logo_url, logo_url")
        .eq("id", game.host_id)
        .single();

      if (host?.branding_logo_url?.trim()) {
        setHostLogo(host.branding_logo_url);
      } else if (host?.logo_url?.trim()) {
        setHostLogo(host.logo_url);
      } else {
        setHostLogo("/faninteractlogo.png");
      }
    }

    loadLogo();
  }, [gameId]);

  /* ============================================================
     Realtime Score Sync
  ============================================================ */
  useEffect(() => {
    const channel = supabase
      .channel(`basketball-${gameId}`)
      .on("broadcast", { event: "update_player" }, (payload: any) => {
        const updated = payload?.payload;
        if (!updated?.id) return;

        setPlayers((prev) => {
          const idx = prev.findIndex((p) => p.id === updated.id);
          if (idx === -1) return prev;
          const next = [...prev];
          next[idx] = updated;
          return next;
        });
      })
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, [gameId]);

  /* ============================================================
     RENDER PAGE
  ============================================================ */
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#050A18",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: 20,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* COUNTDOWN OVERLAY */}
      {showCountdown && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.88)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 99999,
            color: "white",
            fontSize: "clamp(4rem, 10vw, 12rem)",
            fontWeight: 900,
            textShadow: "0 0 25px rgba(255,0,0,0.8)",
          }}
        >
          {count > 0 ? count : "START!"}
        </div>
      )}

      {/* FULLSCREEN BUTTON */}
      <button
        onClick={() =>
          !document.fullscreenElement
            ? document.documentElement.requestFullscreen()
            : document.exitFullscreen()
        }
        style={{
          position: "absolute",
          bottom: "2vh",
          right: "2vw",
          width: 48,
          height: 48,
          borderRadius: 10,
          background: "rgba(255,255,255,0.12)",
          border: "1px solid rgba(255,255,255,0.3)",
          color: "#fff",
          cursor: "pointer",
          fontSize: "1.4rem",
          zIndex: 99,
        }}
      >
        ⛶
      </button>

      {/* ======================= GRID ======================= */}
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
          const borderColor = CELL_COLORS[i];

          return (
            <div
              key={i}
              style={{
                position: "relative",
                overflow: "hidden",
                borderRadius: 20,
                border: `5px solid ${borderColor}`,
                backgroundImage: "url('/BBgamebackground.png')",
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
                boxShadow:
                  "inset 0 40px 50px -20px rgba(0,0,0,0.6), inset 0 -40px 50px -20px rgba(0,0,0,0.6)",
              }}
            >
              {/* PLAYER NUMBER TAG (P1–P10) */}
              <div
                style={{
                  position: "absolute",
                  top: 6,
                  left: 10,
                  padding: "4px 10px",
                  borderRadius: 8,
                  background: borderColor,
                  color: "white",
                  fontWeight: 800,
                  fontSize: "1rem",
                  boxShadow: "0 0 10px rgba(0,0,0,0.6)",
                }}
              >
                P{i + 1}
              </div>

              {/* BACKBOARD */}
              <div
                style={{
                  position: "absolute",
                  top: "4%",
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: `${35 * BACKBOARD_SCALE}%`,
                  height: `${7 * BACKBOARD_SCALE}vh`,
                  background: "rgba(255,255,255,0.08)",
                  backdropFilter: "blur(4px)",
                  border: "2px solid rgba(255,0,0,0.45)",
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: "25%",
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: "40%",
                    height: "55%",
                    border: "3px solid rgba(214,40,40,0.75)",
                  }}
                />

                {/* HOST LOGO */}
                {hostLogo && (
                  <img
                    src={hostLogo}
                    style={{
                      maxWidth: "72%",
                      maxHeight: "72%",
                      objectFit: "contain",
                      filter: "drop-shadow(0 0 10px rgba(255,0,0,0.45))",
                    }}
                  />
                )}
              </div>

              {/* RIM */}
              <div
                style={{
                  position: "absolute",
                  top: `calc(2% + ${7 * BACKBOARD_SCALE}vh - 0.3vh)`,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: `${18 * RIM_SCALE}%`,
                  height: "4px",
                  background: "#ff5a00",
                  borderRadius: 4,
                  boxShadow: "0 0 12px rgba(255,90,0,0.8)",
                }}
              />

              {/* NET */}
              <div
                style={{
                  position: "absolute",
                  top: `calc(2% + ${7 * BACKBOARD_SCALE}vh + 0.4vh)`,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: `${15 * RIM_SCALE}%`,
                  height: "3vh",
                  background:
                    "repeating-linear-gradient(135deg, white 0, white 2px, transparent 3px 6px)",
                  opacity: 0.4,
                  borderRadius: "0 0 10px 10px",
                }}
              />

              {/* BALL */}
              <div
                style={{
                  position: "absolute",
                  bottom: "4%",
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  background: "radial-gradient(circle,#ff9d00,#ff6100)",
                  boxShadow: "0 0 14px rgba(255,165,0,0.8)",
                }}
              />

              {/* SELFIE WITH MATCHING BORDER */}
              <div
                style={{
                  position: "absolute",
                  bottom: "8%",
                  left: "2%",
                  width: SELFIE_SIZE,
                  height: SELFIE_SIZE,
                  borderRadius: "50%",
                  border: `3px solid ${borderColor}`,
                  overflow: "hidden",
                  background: "#222",
                }}
              >
                {player?.selfie_url ? (
                  <img
                    src={player.selfie_url}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      background: "#444",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#bbb",
                    }}
                  >
                    ?
                  </div>
                )}
              </div>

              {/* SCORE */}
              <div
                style={{
                  position: "absolute",
                  bottom: "-1%",
                  right: "2%",
                  fontFamily: "Digital, monospace",
                  fontSize: `${2.5 * SCORE_FONT_SCALE}rem`,
                  color: "#ff2d2d",
                  textShadow: "0 0 12px rgba(255,0,0,0.9)",
                  letterSpacing: "3px",
                  fontWeight: 900,
                }}
              >
                {player?.score ?? 0}
              </div>

              {/* NAME */}
              <div
                style={{
                  position: "absolute",
                  bottom: "1.5%",
                  width: "100%",
                  left: "2%",
                  color: "white",
                  fontSize: "1rem",
                  fontWeight: 700,
                  textShadow: "0 0 10px rgba(0,0,0,0.8)",
                }}
              >
                {player?.nickname ?? "Open Slot"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
