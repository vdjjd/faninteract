"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

/* ============================================================
   GLOBAL ARCADE ANIMATIONS
============================================================ */
const GlobalAnimations = () => (
  <style>{`
    /* BALL SPIN SPEEDS */
    @keyframes ballSpinFast {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(720deg); }
    }
    @keyframes ballSpinMedium {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(540deg); }
    }
    @keyframes ballSpinSlow {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    /* RIM SHAKE INTENSITY */
    @keyframes rimShakeSoft {
      0% { transform: translateX(-50%) translateY(0); }
      50% { transform: translateX(-50%) translateY(2px); }
      100% { transform: translateX(-50%) translateY(0); }
    }
    @keyframes rimShakeMedium {
      0% { transform: translateX(-50%) translateY(0); }
      50% { transform: translateX(-50%) translateY(5px); }
      100% { transform: translateX(-50%) translateY(0); }
    }
    @keyframes rimShakeHard {
      0% { transform: translateX(-50%) translateY(0); }
      40% { transform: translateX(-50%) translateY(9px); }
      100% { transform: translateX(-50%) translateY(0); }
    }

    /* NET FLUTTER */
    @keyframes netFlutterSoft {
      0% { transform: translateX(-50%) scaleY(1); }
      50% { transform: translateX(-50%) scaleY(1.35); }
      100% { transform: translateX(-50%) scaleY(1); }
    }
    @keyframes netFlutterMedium {
      0% { transform: translateX(-50%) scaleY(1); }
      50% { transform: translateX(-50%) scaleY(1.55); }
      100% { transform: translateX(-50%) scaleY(1); }
    }
    @keyframes netFlutterHard {
      0% { transform: translateX(-50%) scaleY(1); }
      45% { transform: translateX(-50%) scaleY(1.8); }
      100% { transform: translateX(-50%) scaleY(1); }
    }
  `}</style>
);

/* ============================================================
   CONSTANTS
============================================================ */
const BACKBOARD_SCALE = 1;
const RIM_SCALE = 1;
const SCORE_FONT_SCALE = 1;
const SELFIE_SIZE = 42;

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
   TYPES
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

/* NEW BALL STATE FOR ARCADE ANIMATION */
interface BallState {
  active: boolean;
  progress: number; // 0 → 1
  power: number; // 0 → 1
  x: number;
  y: number;
  scale: number;
  spin: "slow" | "medium" | "fast";
  rimShake: "soft" | "medium" | "hard" | null;
  netStage: 0 | 1 | 2;
}

/* ============================================================
   COMPONENT
============================================================ */
export default function ActiveBasketballPage({ gameId }: { gameId: string }) {
  /* GAME STATE */
  const [players, setPlayers] = useState<Player[]>([]);
  const [hostLogo, setHostLogo] = useState<string | null>(null);

  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [duration, setDuration] = useState(0);
  const [timerStartedAt, setTimerStartedAt] = useState<string | null>(null);
  const [timerExpired, setTimerExpired] = useState(false);
  const [preCountdown, setPreCountdown] = useState<number | null>(null);

  /* BALL STATE */
  const [ballAnimations, setBallAnimations] = useState<BallState[]>(
    Array.from({ length: 10 }, () => ({
      active: false,
      progress: 0,
      power: 0,
      x: 0,
      y: 4,
      scale: 1,
      spin: "slow",
      rimShake: null,
      netStage: 0,
    }))
  );

  /* ============================================================
     DASHBOARD → WALL countdown
  ============================================================= */
  useEffect(() => {
    const handler = (e: any) => {
      if (e.data?.type === "start_game") setPreCountdown(10);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  /* Supabase broadcast countdown */
  useEffect(() => {
    const channel = supabase
      .channel(`basketball-${gameId}`)
      .on("broadcast", { event: "start_countdown" }, () => {
        setPreCountdown(10);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [gameId]);

  /* Countdown tick */
  useEffect(() => {
    if (preCountdown === null) return;

    if (preCountdown <= 0) {
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

  /* ============================================================
     GAME TIMER SYNC
  ============================================================= */
  async function loadTimer() {
    const { data } = await supabase
      .from("bb_games")
      .select("*")
      .eq("id", gameId)
      .single();

    if (!data) return;
    setDuration(data.duration_seconds);

    /* Lobby */
    if (!data.game_running && !data.game_timer_start) {
      if (preCountdown === null) {
        setTimerStartedAt(null);
        setTimeLeft(data.duration_seconds);
      }
      return;
    }

    /* During countdown */
    if (preCountdown !== null) {
      setTimerStartedAt(null);
      setTimeLeft(data.duration_seconds);
      return;
    }

    /* Running */
    if (data.game_running && data.game_timer_start) {
      const start = new Date(data.game_timer_start).getTime();
      const elapsed = Math.floor((Date.now() - start) / 1000);
      const remaining = data.duration_seconds - elapsed;
      setTimerStartedAt(data.game_timer_start);
      setTimeLeft(Math.max(remaining, 0));
      return;
    }

    /* Ended */
    if (!data.game_running && data.game_timer_start) {
      const start = new Date(data.game_timer_start).getTime();
      const elapsed = Math.floor((Date.now() - start) / 1000);
      const remaining = data.duration_seconds - elapsed;
      setTimerStartedAt(data.game_timer_start);
      setTimeLeft(Math.max(remaining, 0));
    }
  }

  useEffect(() => {
    loadTimer();
    const t = setInterval(loadTimer, 1500);
    return () => clearInterval(t);
  }, []);

  /* Local ticking */
  useEffect(() => {
    if (!timerStartedAt || preCountdown !== null) return;
    if (timeLeft === null || timeLeft <= 0) return setTimerExpired(true);

    const t = setTimeout(() => setTimeLeft((t) => (t !== null ? t - 1 : null)), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, timerStartedAt, preCountdown]);

  async function beginGameTimer() {
    const now = new Date().toISOString();
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

  /* ============================================================
     LOAD PLAYERS
  ============================================================= */
  function mapRow(row: DBPlayerRow): Player {
    return {
      id: row.id,
      nickname: row.display_name || "Player",
      selfie_url: row.selfie_url,
      score: row.score ?? 0,
      cell: row.lane_index ?? 0,
    };
  }

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("bb_game_players")
        .select("*")
        .eq("game_id", gameId)
        .order("lane_index", { ascending: true });

      const active = (data as DBPlayerRow[])?.filter((p) => !p.disconnected_at);
      setPlayers(active.map(mapRow));
    }
    load();
  }, [gameId]);

  /* Realtime player updates */
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
        (payload) => {
          const row = payload.new as DBPlayerRow;

          if (row.disconnected_at) {
            setPlayers((prev) => prev.filter((x) => x.id !== row.id));
            return;
          }

          const mapped = mapRow(row);

          setPlayers((prev) => {
            const idx = prev.findIndex((p) => p.id === mapped.id);
            if (idx === -1) return [...prev, mapped];
            const next = [...prev];
            next[idx] = mapped;
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [gameId]);

  /* ============================================================
     HOST LOGO
  ============================================================= */
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
     ARCADE SHOT PHYSICS
  ============================================================= */
  function animateShot(lane: number, power: number) {
    if (lane < 0 || lane > 9) return;

    const spin: "slow" | "medium" | "fast" =
      power < 0.33 ? "slow" : power < 0.66 ? "medium" : "fast";

    const rimShake: "soft" | "medium" | "hard" =
      power < 0.33 ? "soft" : power < 0.66 ? "medium" : "hard";

    const netStage: 1 | 2 = power < 0.66 ? 1 : 2;

    const totalSteps = 50;
    let step = 0;

    setBallAnimations((prev) => {
      const next = [...prev];
      next[lane] = {
        active: true,
        progress: 0,
        power,
        x: 0,
        y: 4,
        scale: 1,
        spin,
        rimShake: null,
        netStage: 0,
      };
      return next;
    });

    const interval = setInterval(() => {
      step++;
      const p = step / totalSteps;
      const arc = 4 * p * (1 - p);

      const height = 4 + arc * (28 + power * 22);
      const forward = p * 14;
      const x = (p - 0.5) * (10 + power * 8);
      const scale = 1 - p * 0.45;

      let rim: any = null;
      let net: any = 0;

      if (p > 0.78 && p < 0.92) {
        rim = rimShake;
        net = netStage;
      }

      if (p >= 1) {
        clearInterval(interval);
        setBallAnimations((prev) => {
          const next = [...prev];
          next[lane] = {
            active: false,
            progress: 0,
            power: 0,
            x: 0,
            y: 4,
            scale: 1,
            spin: "slow",
            rimShake: null,
            netStage: 0,
          };
          return next;
        });
        return;
      }

      setBallAnimations((prev) => {
        const next = [...prev];
        next[lane] = {
          active: true,
          progress: p,
          power,
          x,
          y: height + forward,
          scale,
          spin,
          rimShake: rim,
          netStage: net,
        };
        return next;
      });
    }, 16);
  }

  /* ============================================================
     LISTEN FOR SHOTS
  ============================================================= */
  useEffect(() => {
    const channel = supabase
      .channel(`basketball-${gameId}`)
      .on("broadcast", { event: "shot_fired" }, (payload) => {
        animateShot(payload.payload.lane_index, payload.payload.power);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [gameId]);

  /* ============================================================
     FORMAT TIMER
  ============================================================= */
  function fmt(sec: number | null) {
    if (sec === null) return "--:--";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  /* ============================================================
     RENDER UI
  ============================================================= */
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
      <GlobalAnimations />

      {/* COUNTDOWN OVERLAY */}
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

      {/* GRID OF 10 CELLS */}
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
          const ball = ballAnimations[i];
          const maxScore = Math.max(...players.map((p) => p.score), 0);
          const isWinner = timerExpired && player && player.score === maxScore;

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
                  : "none",
              }}
            >
              {/* Winner glow */}
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
                  top: `calc(4% + ${7 * BACKBOARD_SCALE}vh - 0.3vh)`,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: `${18 * RIM_SCALE}%`,
                  height: "4px",
                  background: "#ff5a00",
                  borderRadius: 4,
                  animation:
                    ball.rimShake === "soft"
                      ? "rimShakeSoft 0.28s ease"
                      : ball.rimShake === "medium"
                      ? "rimShakeMedium 0.30s ease"
                      : ball.rimShake === "hard"
                      ? "rimShakeHard 0.34s ease"
                      : "none",
                }}
              />

              {/* NET */}
              <div
                style={{
                  position: "absolute",
                  top: `calc(4% + ${7 * BACKBOARD_SCALE}vh + 0.4vh)`,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: `${15 * RIM_SCALE}%`,
                  height: "3vh",
                  background:
                    "repeating-linear-gradient(135deg, white 0, white 2px, transparent 3px 6px)",
                  opacity: 0.5,
                  borderRadius: "0 0 10px 10px",
                  animation:
                    ball.netStage === 1
                      ? "netFlutterMedium 0.28s ease"
                      : ball.netStage === 2
                      ? "netFlutterHard 0.35s ease"
                      : "none",
                }}
              />

              {/* BALL + SHADOW */}
              {ball.active ? (
                <>
                  <div
                    style={{
                      position: "absolute",
                      bottom: "2%",
                      left: "50%",
                      transform: "translateX(-50%)",
                      width: `${40 * ball.scale + 10}px`,
                      height: `${14 * ball.scale + 4}px`,
                      background: "rgba(0,0,0,0.4)",
                      borderRadius: "50%",
                      filter: "blur(4px)",
                      transition: "all 0.016s linear",
                    }}
                  />

                  <div
                    style={{
                      position: "absolute",
                      bottom: `${ball.y}%`,
                      left: `calc(50% + ${ball.x}px)`,
                      transform: "translateX(-50%)",
                      width: `${34 * ball.scale}px`,
                      height: `${34 * ball.scale}px`,
                      borderRadius: "50%",
                      background: "radial-gradient(circle, #ff9d00, #ff6100)",
                      animation:
                        ball.spin === "fast"
                          ? "ballSpinFast 0.28s linear infinite"
                          : ball.spin === "medium"
                          ? "ballSpinMedium 0.34s linear infinite"
                          : "ballSpinSlow 0.42s linear infinite",
                      zIndex: 20,
                    }}
                  />
                </>
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
                    background: "radial-gradient(circle, #ff9d00, #ff6100)",
                    opacity: 0.4,
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
        onClick={() => {
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
          } else {
            document.exitFullscreen();
          }
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
