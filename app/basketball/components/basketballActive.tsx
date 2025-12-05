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

  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [timerStartedAt, setTimerStartedAt] = useState<string | null>(null);
  const [timerExpired, setTimerExpired] = useState(false);

  const [preCountdown, setPreCountdown] = useState<number | null>(null);

  useEffect(() => {
    function onMessage(e: any) {
      if (e.data?.type === "start_game") {
        setPreCountdown(10);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel(`basketball-${gameId}`)
      .on("broadcast", { event: "start_countdown" }, () =>
        setPreCountdown(10)
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, [gameId]);

  useEffect(() => {
    if (preCountdown === null) return;

    if (preCountdown <= 0) {
      setPreCountdown(null);
      beginGameTimer();
      return;
    }

    const t = setTimeout(() => setPreCountdown((n) => n! - 1), 1000);
    return () => clearTimeout(t);
  }, [preCountdown]);

  async function loadTimer() {
    const { data } = await supabase
      .from("bb_games")
      .select("*")
      .eq("id", gameId)
      .single();

    if (!data) return;

    setDuration(data.duration_seconds);

    if (!data.game_running && preCountdown === null && !data.game_timer_start) {
      setTimerStartedAt(null);
      setTimeLeft(data.duration_seconds);
      return;
    }

    if (preCountdown !== null) {
      setTimerStartedAt(null);
      setTimeLeft(data.duration_seconds);
      return;
    }

    if (data.game_running && data.game_timer_start) {
      setTimerStartedAt(data.game_timer_start);
      const now = Date.now();
      const start = new Date(data.game_timer_start).getTime();
      const remaining =
        data.duration_seconds - Math.floor((now - start) / 1000);
      setTimeLeft(Math.max(remaining, 0));
      return;
    }

    if (!data.game_running && data.game_timer_start) {
      const now = Date.now();
      const start = new Date(data.game_timer_start).getTime();
      const remaining =
        data.duration_seconds - Math.floor((now - start) / 1000);
      setTimerStartedAt(data.game_timer_start);
      setTimeLeft(Math.max(remaining, 0));
      return;
    }
  }

  useEffect(() => {
    loadTimer();
    const t = setInterval(loadTimer, 1500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (preCountdown !== null) return;
    if (!timerStartedAt || timeLeft === null) return;

    if (timeLeft <= 0) {
      setTimerExpired(true);
      return;
    }

    const t = setTimeout(() => setTimeLeft((t) => t! - 1), 1000);
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
            const idx = prev.findIndex((x) => x.id === mapped.id);
            if (idx === -1) return [...prev, mapped];
            const cp = [...prev];
            cp[idx] = mapped;
            return cp;
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

  /* ============================================================
     BALL ARC ANIMATION (NEW)
============================================================ */
  const [ballAnimations, setBallAnimations] = useState(
    Array(10).fill({
      active: false,
      x: 0,
      y: 0,
      startTime: 0,
      duration: 0,
    })
  );

  function animateShot(lane: number, power: number) {
    const duration = 600 + power * 500;
    const startTime = performance.now();
    const peak = 0.5;

    setBallAnimations((prev) => {
      const n = [...prev];
      n[lane] = { active: true, x: 0, y: 0, startTime, duration };
      return n;
    });

    function step() {
      setBallAnimations((prev) => {
        const n = [...prev];
        const b = n[lane];
        if (!b.active) return n;

        const now = performance.now();
        const progress = (now - b.startTime) / b.duration;

        if (progress >= 1) {
          n[lane] = { active: false, x: 0, y: 0, startTime: 0, duration: 0 };
          return n;
        }

        const y = progress * 90 + 4;

        const arcAmount = 1 - Math.abs(progress - peak) / peak;
        const x = arcAmount * 22;

        n[lane] = { ...b, x, y };
        return n;
      });

      requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }

  useEffect(() => {
    const channel = supabase
      .channel(`basketball-${gameId}`)
      .on("broadcast", { event: "shot_fired" }, (payload) =>
        animateShot(payload.payload.lane_index, payload.payload.power)
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, [gameId]);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else document.exitFullscreen();
  }

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
      {preCountdown !== null && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.90)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            fontSize: "clamp(4rem, 10vw, 12rem)",
            color: "white",
            fontWeight: 900,
            zIndex: 9999,
          }}
        >
          {preCountdown > 0 ? preCountdown : "START!"}
        </div>
      )}

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
          const p = players.find((x) => x.cell === i);
          const borderColor = CELL_COLORS[i];
          const b = ballAnimations[i];

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
              }}
            >
              {/* TIMER */}
              <div
                style={{
                  position: "absolute",
                  right: 10,
                  top: 6,
                  padding: "4px 8px",
                  background: "rgba(0,0,0,0.55)",
                  borderRadius: 6,
                  color: "white",
                  fontFamily: "Digital, monospace",
                }}
              >
                {fmt(timeLeft)}
              </div>

              {/* SLOT LABEL */}
              <div
                style={{
                  position: "absolute",
                  left: 10,
                  top: 6,
                  padding: "4px 10px",
                  background: borderColor,
                  borderRadius: 8,
                  color: "white",
                }}
              >
                P{i + 1}
              </div>

              {/* BALL ARC */}
              {b.active ? (
                <div
                  style={{
                    position: "absolute",
                    bottom: `${b.y}%`,
                    left: `calc(50% - ${b.x}px)`,
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    background: "radial-gradient(circle,#ff9d00,#ff6100)",
                    transform: "translateX(-50%)",
                    zIndex: 20,
                  }}
                />
              ) : (
                <div
                  style={{
                    position: "absolute",
                    bottom: "4%",
                    left: "50%",
                    width: 30,
                    height: 30,
                    transform: "translateX(-50%)",
                    borderRadius: "50%",
                    background: "radial-gradient(circle,#ff9d00,#ff6100)",
                    opacity: 0.6,
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
                  overflow: "hidden",
                  border: `3px solid ${borderColor}`,
                }}
              >
                {p?.selfie_url ? (
                  <img
                    src={p.selfie_url}
                    style={{ width: "100%", height: "100%" }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      background: "#444",
                      color: "#bbb",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
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
                  right: "2%",
                  bottom: "-1%",
                  color: "#ff2d2d",
                  fontFamily: "Digital, monospace",
                  fontSize: `${2.5 * SCORE_FONT_SCALE}rem`,
                }}
              >
                {p?.score ?? 0}
              </div>

              {/* NAME */}
              <div
                style={{
                  position: "absolute",
                  bottom: "1.5%",
                  left: "2%",
                  color: "white",
                  fontWeight: 700,
                }}
              >
                {p
                  ? `${p.nickname.split(" ")[0] || ""} ${
                      p.nickname.split(" ")[1]
                        ? p.nickname.split(" ")[1][0] + "."
                        : ""
                    }`
                  : "Open Slot"}
              </div>
            </div>
          );
        })}
      </div>

      <div
        onClick={toggleFullscreen}
        style={{
          position: "absolute",
          right: "2vw",
          bottom: "2vh",
          width: 42,
          height: 42,
          borderRadius: 12,
          background: "rgba(255,255,255,0.1)",
          border: "1px solid rgba(255,255,255,0.3)",
          color: "white",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          cursor: "pointer",
          zIndex: 50,
        }}
      >
        ⛶
      </div>
    </div>
  );
}
