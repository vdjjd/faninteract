"use client";

import React, { useState, useEffect } from "react";
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

interface DBPlayerRow {
  id: string;
  game_id: string;
  guest_profile_id: string;
  lane_index: number | null;
  display_name: string | null;
  selfie_url: string | null;
  score: number | null;
  disconnected_at: string | null;
}

/* ============================================================
   ACTIVE GAME PAGE
============================================================ */
export default function ActiveBasketballPage({ gameId }: { gameId: string }) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [hostLogo, setHostLogo] = useState<string | null>(null);

  /* ============================================
     GLOBAL GAME TIMER
  ============================================ */
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [timerStartedAt, setTimerStartedAt] = useState<string | null>(null);
  const [timerExpired, setTimerExpired] = useState(false);

  /* ============================================
     FULLSCREEN COUNTDOWN (10 sec)
  ============================================ */
  const [preCountdown, setPreCountdown] = useState<number | null>(null);

  // Listen for "start_game" message
  useEffect(() => {
    function onMessage(e: any) {
      if (e.data?.type === "start_game") {
        setPreCountdown(10);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Run the fullscreen 10-second countdown
  useEffect(() => {
    if (preCountdown === null) return;

    if (preCountdown <= 0) {
      setPreCountdown(null);
      beginGameTimer();
      return;
    }

    const t = setTimeout(() => setPreCountdown(preCountdown - 1), 1000);
    return () => clearTimeout(t);
  }, [preCountdown]);

  /* ============================================================
     LOAD GAME TIMER INFO (POLLING)
  ============================================================ */
  async function loadTimer() {
    const { data } = await supabase
      .from("bb_games")
      .select("*")
      .eq("id", gameId)
      .single();

    if (!data) return;

    setDuration(data.duration_seconds);
    setTimerStartedAt(data.game_timer_start);

    // ❗ FREEZE TIMER UNTIL 10-SECOND COUNTDOWN ENDS
    if (preCountdown !== null) {
      setTimeLeft(data.duration_seconds);
      return;
    }

    if (!data.game_timer_start) return;

    const startDate = new Date(data.game_timer_start).getTime();
    const now = Date.now();
    const elapsed = Math.floor((now - startDate) / 1000);
    const remaining = data.duration_seconds - elapsed;

    setTimeLeft(Math.max(remaining, 0));
  }

  useEffect(() => {
    loadTimer();
    const t = setInterval(loadTimer, 1500);
    return () => clearInterval(t);
  }, []);

  /* ============================================================
     LOCAL TICK DOWN
  ============================================================ */
  useEffect(() => {
    // ❗ DO NOT TICK WHILE FULLSCREEN COUNTDOWN IS ACTIVE
    if (preCountdown !== null) return;

    if (timerStartedAt === null || timeLeft === null) return;

    if (timeLeft <= 0) {
      setTimerExpired(true);
      return;
    }

    const t = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, timerStartedAt, preCountdown]);

  /* ============================================================
     BEGIN GAME TIMER (DB writes start time)
  ============================================================ */
  async function beginGameTimer() {
    const start = new Date().toISOString();

    await supabase
      .from("bb_games")
      .update({
        game_timer_start: start,
        status: "running",
      })
      .eq("id", gameId);

    setTimerStartedAt(start);
    setTimeLeft(duration);
  }

  /* ============================================================
     LOAD PLAYERS
  ============================================================ */
  function mapRowToPlayer(row: DBPlayerRow): Player {
    return {
      id: row.id,
      nickname: row.display_name || "Player",
      selfie_url: row.selfie_url,
      score: row.score ?? 0,
      cell: row.lane_index ?? 0,
    };
  }

  useEffect(() => {
    async function loadPlayers() {
      const { data } = await supabase
        .from("bb_game_players")
        .select("*")
        .eq("game_id", gameId)
        .order("lane_index", { ascending: true });

      const active = (data as DBPlayerRow[])?.filter(
        (r) => !r.disconnected_at
      );
      setPlayers(active.map(mapRowToPlayer));
    }
    loadPlayers();
  }, [gameId]);

  /* ============================================================
     REALTIME SCORE UPDATES
  ============================================================ */
  useEffect(() => {
    const channel = supabase
      .channel(`bb_game_players_${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bb_game_players",
          filter: `game_id=eq.${gameId}`,
        },
        (payload: any) => {
          const row = payload.new as DBPlayerRow;

          if (row.disconnected_at) {
            setPlayers((prev) => prev.filter((x) => x.id !== row.id));
            return;
          }

          const mapped = mapRowToPlayer(row);

          setPlayers((prev) => {
            const i = prev.findIndex((p) => p.id === mapped.id);
            if (i === -1) return [...prev, mapped];
            const c = [...prev];
            c[i] = mapped;
            return c;
          });
        }
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, [gameId]);

  /* ============================================================
     LOAD HOST LOGO
  ============================================================ */
  useEffect(() => {
    async function loadLogo() {
      const { data: game } = await supabase
        .from("bb_games")
        .select("host_id")
        .eq("id", gameId)
        .single();

      if (!game?.host_id) return setHostLogo("/faninteractlogo.png");

      const { data: host } = await supabase
        .from("hosts")
        .select("branding_logo_url, logo_url")
        .eq("id", game.host_id)
        .single();

      setHostLogo(
        host?.branding_logo_url?.trim()
          ? host.branding_logo_url
          : host?.logo_url?.trim()
          ? host.logo_url
          : "/faninteractlogo.png"
      );
    }
    loadLogo();
  }, [gameId]);

  /* ============================================================
     WINNER BLINK EFFECT
  ============================================================ */
  let winningCells: number[] = [];
  if (timerExpired) {
    const max = Math.max(...players.map((p) => p.score), 0);
    winningCells = players.filter((p) => p.score === max).map((p) => p.cell);
  }

  /* ============================================================
     FORMAT TIMER (MM:SS)
  ============================================================ */
  function fmt(sec: number | null) {
    if (sec === null) return "--:--";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  /* ============================================================
     FULLSCREEN HANDLER
  ============================================================ */
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  }

  /* ============================================================
     RENDER
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
      {/* FULLSCREEN PRE-GAME COUNTDOWN */}
      {preCountdown !== null && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.88)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            color: "white",
            fontSize: "clamp(4rem, 10vw, 12rem)",
            fontWeight: 900,
            textShadow: "0 0 60px rgba(255,0,0,0.9)",
          }}
        >
          {preCountdown > 0 ? preCountdown : "START!"}
        </div>
      )}

      {/* ================= GRID ================= */}
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
          const isWinner = winningCells.includes(i);

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
                animation: isWinner
                  ? "winnerBlink 0.18s infinite alternate"
                  : undefined,
              }}
            >
              {/* WINNER ANIMATION */}
              <style>{`
                @keyframes winnerBlink {
                  from { box-shadow: 0 0 6px ${borderColor}; }
                  to { box-shadow: 0 0 28px ${borderColor}; }
                }
              `}</style>

              {/* TOP RIGHT TIMER */}
              <div
                style={{
                  position: "absolute",
                  top: 6,
                  right: 10,
                  padding: "4px 8px",
                  borderRadius: 6,
                  background: "rgba(0,0,0,0.55)",
                  color: "white",
                  fontSize: "1rem",
                  fontFamily: "Digital, monospace",
                  fontWeight: 700,
                }}
              >
                {fmt(timeLeft)}
              </div>

              {/* PLAYER # TAG */}
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
                  border: "2px solid rgba(255,0,0,0.45)",
                  borderRadius: 6,
                  backdropFilter: "blur(4px)",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                {hostLogo && (
                  <img
                    src={hostLogo}
                    style={{
                      maxWidth: "72%",
                      maxHeight: "72%",
                      objectFit: "contain",
                      opacity: 0.3,
                      transform: "translateY(-9%)",
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
                }}
              />

              {/* SELFIE */}
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
                }}
              >
                {player?.selfie_url ? (
                  <img
                    src={player.selfie_url}
                    style={{ width: "100%", height: "100%" }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      background: "#444",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
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
                  left: "2%",
                  color: "white",
                  fontSize: "1rem",
                  fontWeight: 700,
                }}
              >
                {player
                  ? `${player.nickname?.split(" ")[0] || ""} ${
                      player.nickname?.split(" ")[1]
                        ? player.nickname.split(" ")[1][0] + "."
                        : ""
                    }`
                  : "Open Slot"}
              </div>
            </div>
          );
        })}
      </div>

      {/* ================= FULLSCREEN BUTTON ================= */}
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
          fontSize: "1.4rem",
          zIndex: 50,
        }}
      >
        ⛶
      </div>
    </div>
  );
}
