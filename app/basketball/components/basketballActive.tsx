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

  /* GAME TIMER */
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [timerStartedAt, setTimerStartedAt] = useState<string | null>(null);
  const [timerExpired, setTimerExpired] = useState(false);

  /* COUNTDOWN */
  const [preCountdown, setPreCountdown] = useState<number | null>(null);

  /* ========================================================================
     Listen for popup "start_game" (dashboard → wall)
  ======================================================================== */
  useEffect(() => {
    function onMessage(e: any) {
      if (e.data?.type === "start_game") {
        console.log("🔥 WALL RECEIVED postMessage start_game");
        setPreCountdown(10);
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  /* ========================================================================
     Realtime broadcast start_countdown (dashboard → shooters + wall)
  ======================================================================== */
  useEffect(() => {
    const channel = supabase
      .channel(`basketball-${gameId}`)
      .on("broadcast", { event: "start_countdown" }, () => {
        console.log("🔥 WALL RECEIVED realtime start_countdown");
        setPreCountdown(10);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [gameId]);

  /* ========================================================================
     Countdown tick
  ======================================================================== */
  useEffect(() => {
    if (preCountdown === null) return;

    if (preCountdown <= 0) {
      console.log("⏱ Countdown finished → START GAME");
      setPreCountdown(null);
      beginGameTimer();
      return;
    }

    const t = setTimeout(
      () => setPreCountdown((n) => (n !== null ? n - 1 : null)),
      1000
    );
    return () => clearTimeout(t);
  }, [preCountdown]);

  /* ========================================================================
     PATCHED: loadTimer — handles 4 states: lobby, countdown, running, ended
  ======================================================================== */
  async function loadTimer() {
    const { data } = await supabase
      .from("bb_games")
      .select("*")
      .eq("id", gameId)
      .single();

    if (!data) return;

    setDuration(data.duration_seconds);

    /* -------------------------------
       STATE 1 → LOBBY (not running)
    ------------------------------- */
    if (!data.game_running && preCountdown === null && !data.game_timer_start) {
      setTimerStartedAt(null);
      setTimeLeft(data.duration_seconds);
      return;
    }

    /* -------------------------------
       STATE 2 → COUNTDOWN
    ------------------------------- */
    if (preCountdown !== null) {
      setTimerStartedAt(null);
      setTimeLeft(data.duration_seconds);
      return;
    }

    /* -------------------------------
       STATE 3 → RUNNING GAME
    ------------------------------- */
    if (data.game_running && data.game_timer_start) {
      setTimerStartedAt(data.game_timer_start);

      const now = Date.now();
      const start = new Date(data.game_timer_start).getTime();
      const elapsed = Math.floor((now - start) / 1000);
      const remaining = data.duration_seconds - elapsed;

      setTimeLeft(Math.max(remaining, 0));
      return;
    }

    /* -------------------------------
       STATE 4 → GAME ENDED
       (winner must show)
    ------------------------------- */
    if (!data.game_running && data.game_timer_start) {
      const now = Date.now();
      const start = new Date(data.game_timer_start).getTime();
      const elapsed = Math.floor((now - start) / 1000);
      const remaining = data.duration_seconds - elapsed;

      setTimerStartedAt(data.game_timer_start);
      setTimeLeft(Math.max(remaining, 0)); // will be 0
      return;
    }
  }

  useEffect(() => {
    loadTimer();
    const t = setInterval(loadTimer, 1500);
    return () => clearInterval(t);
  }, []);

  /* ========================================================================
     Local tick
  ======================================================================== */
  useEffect(() => {
    if (preCountdown !== null) return;
    if (!timerStartedAt || timeLeft === null) return;

    if (timeLeft <= 0) {
      setTimerExpired(true);
      return;
    }

    const t = setTimeout(
      () => setTimeLeft((t) => (t !== null ? t - 1 : null)),
      1000
    );
    return () => clearTimeout(t);
  }, [timeLeft, timerStartedAt, preCountdown]);

  /* ========================================================================
     Start the actual game timer (only after countdown)
  ======================================================================== */
  async function beginGameTimer() {
    const now = new Date().toISOString();

    console.log("⏱ beginGameTimer → game_running TRUE");

    await supabase
      .from("bb_games")
      .update({
        game_running: true,
        game_timer_start: now,
        status: "running",
      })
      .eq("id", gameId);

    setTimerStartedAt(now);
    setTimeLeft(duration);
  }

  /* ========================================================================
     LOAD PLAYERS
  ======================================================================== */
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

      const active = (data as DBPlayerRow[])?.filter((p) => !p.disconnected_at);
      setPlayers(active.map(mapRowToPlayer));
    }

    loadPlayers();
  }, [gameId]);

  /* ========================================================================
     REALTIME PLAYER UPDATES (patched cleanup)
  ======================================================================== */
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
            const idx = prev.findIndex((p) => p.id === mapped.id);
            if (idx === -1) return [...prev, mapped];
            const copy = [...prev];
            copy[idx] = mapped;
            return copy;
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

  /* ========================================================================
     HOST LOGO
  ======================================================================== */
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

  /* ========================================================================
     WINNER CALCULATION
  ======================================================================== */
  let winningCells: number[] = [];
  if (timerExpired) {
    const max = Math.max(...players.map((p) => p.score), 0);
    winningCells = players.filter((p) => p.score === max).map((p) => p.cell);
  }

  function fmt(sec: number | null) {
    if (sec === null) return "--:--";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  /* ========================================================================
     BALL ANIMATION
  ======================================================================== */
  const [ballAnimations, setBallAnimations] = useState(
    Array(10).fill({ active: false, y: 0, power: 0 })
  );

  function animateShot(lane: number, power: number) {
    setBallAnimations((prev) => {
      const next = [...prev];
      next[lane] = { active: true, y: 0, power };
      return next;
    });

    let y = 0;
    const interval = setInterval(() => {
      y += power * 4;

      setBallAnimations((prev) => {
        const next = [...prev];
        next[lane].y = y;
        return next;
      });

      if (y >= 100) {
        clearInterval(interval);
        setBallAnimations((prev) => {
          const next = [...prev];
          next[lane] = { active: false, y: 0, power: 0 };
          return next;
        });
      }
    }, 16);
  }

  /* ========================================================================
     Listen for shot_fired (patched cleanup)
  ======================================================================== */
  useEffect(() => {
    const channel = supabase
      .channel(`basketball-${gameId}`)
      .on("broadcast", { event: "shot_fired" }, (payload) => {
        animateShot(payload.payload.lane_index, payload.payload.power);
      })
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, [gameId]);

  /* ========================================================================
     FULLSCREEN
  ======================================================================== */
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  }

  /* ========================================================================
     RENDER UI
  ======================================================================== */
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
      {/* COUNTDOWN */}
      {preCountdown !== null && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.88)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
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

      {/* GRID */}
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
              <style>{`
                @keyframes winnerBlink {
                  from { box-shadow: 0 0 6px ${borderColor}; }
                  to { box-shadow: 0 0 28px ${borderColor}; }
                }
              `}</style>

              {/* TIMER */}
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

              {/* SLOT LABEL */}
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
                  width: `${15 * RIM_SCALE}%`,
                  height: "3vh",
                  transform: "translateX(-50%)",
                  background:
                    "repeating-linear-gradient(135deg, white 0, white 2px, transparent 3px 6px)",
                  opacity: 0.4,
                  borderRadius: "0 0 10px 10px",
                }}
              />

              {/* BALL */}
              {ballAnimations[i].active ? (
                <div
                  style={{
                    position: "absolute",
                    bottom: `${ballAnimations[i].y}%`,
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    background:
                      "radial-gradient(circle,#ff9d00,#ff6100)",
                    transition: "bottom 0.016s linear",
                    zIndex: 20,
                  }}
                />
              ) : (
                <div
                  style={{
                    position: "absolute",
                    bottom: "4%",
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    background:
                      "radial-gradient(circle,#ff9d00,#ff6100)",
                    opacity: 0.5,
                  }}
                />
              )}

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
          fontSize: "1.4rem",
          zIndex: 50,
        }}
      >
        ⛶
      </div>
    </div>
  );
}
