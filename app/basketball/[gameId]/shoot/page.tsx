"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Mode = "normal" | "three" | "dunk";

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export default function ShootPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = use(params);

  const [game, setGame] = useState<any>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  const [playerId, setPlayerId] = useState<string | null>(null);

  // lane_index is 1–10
  const [laneIndex, setLaneIndex] = useState<number | null>(null);

  const [displayName, setDisplayName] = useState<string>("Player");
  const [score, setScore] = useState<number>(0);

  const [mode, setMode] = useState<Mode>("normal");
  const [shotsLeft, setShotsLeft] = useState<number | null>(null);

  const [locked, setLocked] = useState<boolean>(false);
  const [lockText, setLockText] = useState<string>("");

  const [toast, setToast] = useState<string | null>(null);

  // swipe tracking
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);

  // dunk meter
  const [dunkProgress, setDunkProgress] = useState<number>(0.5);
  const dunkRAF = useRef<number | null>(null);
  const dunkStart = useRef<number>(0);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // load game state + realtime
  useEffect(() => {
    let mounted = true;

    async function load() {
      const { data } = await supabase
        .from("bb_games")
        .select("id,status,game_running,game_timer_start,duration_seconds")
        .eq("id", gameId)
        .maybeSingle();

      if (!mounted) return;
      setGame(data || null);
    }

    load();

    const ch = supabase
      .channel(`bb-game-shoot-${gameId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "bb_games", filter: `id=eq.${gameId}` },
        (payload) => setGame(payload.new)
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(ch);
    };
  }, [gameId]);

  const durationSeconds = game?.duration_seconds ?? 90;
  const timerStartMs = game?.game_timer_start ? new Date(game.game_timer_start).getTime() : null;
  const countdownMs = 10_000;

  const countdownLeft = useMemo(() => {
    if (!timerStartMs) return null;
    const elapsed = now - timerStartMs;
    if (elapsed < 0) return 10;
    if (elapsed >= countdownMs) return 0;
    return Math.max(0, Math.ceil((countdownMs - elapsed) / 1000));
  }, [timerStartMs, now]);

  const gameSecondsLeft = useMemo(() => {
    if (!timerStartMs) return durationSeconds;
    const elapsedAfterCountdown = Math.max(0, (now - timerStartMs - countdownMs) / 1000);
    return Math.max(0, Math.ceil(durationSeconds - elapsedAfterCountdown));
  }, [timerStartMs, now, durationSeconds]);

  const acceptingShots =
    game?.status === "running" &&
    game?.game_running === true &&
    !!timerStartMs &&
    countdownLeft === 0 &&
    gameSecondsLeft > 0;

  const instruction = useMemo(() => {
    if (!game?.game_running) return "Waiting for host…";
    if (countdownLeft && countdownLeft > 0) return "Get ready…";
    if (locked) return "Locked…";
    if (mode === "dunk") return "STOP the bar in the center to DUNK!";
    if (mode === "three")
      return `3PT MODE${shotsLeft != null ? ` • ${shotsLeft} to dunk` : ""}`;
    return "Swipe up to shoot";
  }, [game?.game_running, countdownLeft, locked, mode, shotsLeft]);

  // load player from localStorage
  useEffect(() => {
    const id = localStorage.getItem("bb_player_id");
    if (!id) {
      window.location.href = `/basketball/${gameId}/submit`;
      return;
    }
    setPlayerId(id);
  }, [gameId]);

  // load player from db + realtime updates
  useEffect(() => {
    if (!playerId) return;

    let mounted = true;

    async function load() {
      const { data, error } = await supabase
        .from("bb_game_players")
        .select("id,lane_index,display_name,score")
        .eq("id", playerId)
        .maybeSingle();

      if (!mounted) return;
      if (error || !data) return;

      setLaneIndex(typeof data.lane_index === "number" ? data.lane_index : null);
      setDisplayName(data.display_name || "Player");
      setScore(data.score ?? 0);
    }

    load();

    const channel = supabase
      .channel(`bb-player-${playerId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "bb_game_players", filter: `id=eq.${playerId}` },
        (payload) => {
          const next: any = payload.new;
          setScore(next.score ?? 0);
          setLaneIndex(typeof next.lane_index === "number" ? next.lane_index : null);
          setDisplayName(next.display_name || "Player");
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [playerId]);

  // listen for wall broadcast: mode + lock + dunked
  useEffect(() => {
    if (!playerId) return;

    const channel = supabase
      .channel(`basketball-${gameId}`)
      .on("broadcast", { event: "player_mode" }, ({ payload }) => {
        if (payload?.player_id !== playerId) return;
        const nextMode = payload?.mode as Mode;
        if (!nextMode) return;

        setMode(nextMode);

        if (nextMode === "three") {
          setShotsLeft(typeof payload?.shots_left === "number" ? payload.shots_left : null);
          setToast("3PT MODE!");
          setTimeout(() => setToast(null), 900);
        } else if (nextMode === "dunk") {
          setShotsLeft(null);
          setToast("DUNK TIME!");
          setTimeout(() => setToast(null), 900);
        } else {
          setShotsLeft(null);
        }
      })
      .on("broadcast", { event: "dunked" }, ({ payload }) => {
        const name = payload?.dunker_name ? String(payload.dunker_name) : "Someone";
        setLocked(true);
        setLockText(`${name} dunked on you`);
        const ms = typeof payload?.duration_ms === "number" ? payload.duration_ms : 2000;
        setTimeout(() => {
          setLocked(false);
          setLockText("");
        }, ms);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId, playerId]);

  // dunk meter animation
  useEffect(() => {
    if (mode !== "dunk" || locked) {
      if (dunkRAF.current) cancelAnimationFrame(dunkRAF.current);
      dunkRAF.current = null;
      return;
    }

    dunkStart.current = performance.now();

    const tick = (tNow: number) => {
      const t = (tNow - dunkStart.current) / 650;
      const p = (Math.sin(t * Math.PI * 2) + 1) / 2;
      setDunkProgress(p);
      dunkRAF.current = requestAnimationFrame(tick);
    };

    dunkRAF.current = requestAnimationFrame(tick);

    return () => {
      if (dunkRAF.current) cancelAnimationFrame(dunkRAF.current);
      dunkRAF.current = null;
    };
  }, [mode, locked]);

  async function sendShot(power: number, angle: number) {
    if (!acceptingShots) return;
    if (!playerId || laneIndex == null) return;

    const channel = supabase.channel(`basketball-${gameId}`);
    await channel.send({
      type: "broadcast",
      event: "shot_attempt",
      payload: {
        player_id: playerId,
        lane_index: laneIndex, // 1–10
        power,
        angle,
        ts: Date.now(),
      },
    });
    supabase.removeChannel(channel);
  }

  async function sendDunk(accuracy: number) {
    if (!acceptingShots) return;
    if (!playerId || laneIndex == null) return;

    const channel = supabase.channel(`basketball-${gameId}`);
    await channel.send({
      type: "broadcast",
      event: "dunk_attempt",
      payload: {
        player_id: playerId,
        lane_index: laneIndex, // 1–10
        accuracy,
        ts: Date.now(),
      },
    });
    supabase.removeChannel(channel);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!acceptingShots) return;
    if (locked) return;
    if (mode === "dunk") return;
    startRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!acceptingShots) return;
    if (locked) return;
    if (mode === "dunk") return;

    const s = startRef.current;
    startRef.current = null;
    if (!s) return;

    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;

    if (dy > -30) return;

    const power = clamp((-dy) / 520, 0, 1);
    const angle = clamp(dx / 260, -1, 1);

    sendShot(power, angle);
  }

  const laneLabel = laneIndex != null ? `Lane ${laneIndex}` : "Lane —";

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundImage: "url('/bbgame1920x1080.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        position: "relative",
        overflow: "hidden",
        touchAction: "none",
      }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.70)" }} />

      {/* Header */}
      <div style={{ position: "relative", zIndex: 5, padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div>
            <div style={{ color: "rgba(255,255,255,0.8)", fontWeight: 800 }}>{laneLabel}</div>
            <div style={{ color: "#fff", fontWeight: 900, fontSize: 22 }}>{displayName}</div>
          </div>
          <div style={{ color: "#fff", fontWeight: 900, fontSize: 36 }}>{score}</div>
        </div>

        <div
          style={{
            marginTop: 12,
            padding: "12px 14px",
            borderRadius: 14,
            background: "rgba(255,255,255,0.10)",
            border: "1px solid rgba(255,255,255,0.18)",
            color: "#fff",
            fontWeight: 900,
            textAlign: "center",
          }}
        >
          {instruction}
        </div>

        {mode === "three" && (
          <div
            style={{
              marginTop: 10,
              textAlign: "center",
              fontWeight: 900,
              color: "#ffd166",
              letterSpacing: 0.5,
            }}
          >
            CAMERA BACK • 3 POINTERS
          </div>
        )}
      </div>

      {/* Main */}
      <div
        style={{
          position: "relative",
          zIndex: 5,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 18,
          height: "calc(100vh - 150px)",
        }}
      >
        {mode !== "dunk" ? (
          <div
            style={{
              width: "100%",
              maxWidth: 520,
              borderRadius: 22,
              padding: "26px 18px",
              background: "rgba(0,0,0,0.55)",
              border: "1px solid rgba(255,255,255,0.18)",
              textAlign: "center",
              color: "rgba(255,255,255,0.9)",
              fontWeight: 800,
              lineHeight: 1.35,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 900, color: "#fff", marginBottom: 8 }}>
              Shoot by swiping up
            </div>
            <div style={{ opacity: 0.9 }}>
              {acceptingShots ? "Swipe stronger for more power." : "Wait for the countdown…"}
            </div>
            <div style={{ marginTop: 10, opacity: 0.85 }}>
              Make <b>3 in a row</b> to unlock <b>3PT mode</b>. <br />
              Hit <b>3 straight 3s</b> to unlock <b>DUNK</b>.
            </div>
          </div>
        ) : (
          <div
            style={{
              width: "100%",
              maxWidth: 520,
              borderRadius: 22,
              padding: 18,
              background: "rgba(0,0,0,0.65)",
              border: "1px solid rgba(255,255,255,0.18)",
              opacity: acceptingShots ? 1 : 0.5,
            }}
          >
            <div style={{ textAlign: "center", fontWeight: 1000, fontSize: 22, color: "#fff" }}>
              DUNK METER
            </div>

            <div
              style={{
                marginTop: 16,
                height: 22,
                borderRadius: 999,
                background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.22)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: "45%",
                  width: "10%",
                  top: 0,
                  bottom: 0,
                  background: "rgba(255,209,102,0.35)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: -6,
                  left: `calc(${(dunkProgress * 100).toFixed(2)}% - 8px)`,
                  width: 16,
                  height: 34,
                  borderRadius: 8,
                  background: "#fff",
                  boxShadow: "0 0 18px rgba(255,255,255,0.65)",
                }}
              />
            </div>

            <button
              disabled={!acceptingShots}
              onClick={() => {
                const accuracy = 1 - Math.abs(dunkProgress - 0.5) / 0.5;
                sendDunk(clamp(accuracy, 0, 1));
              }}
              style={{
                marginTop: 16,
                width: "100%",
                padding: "16px 14px",
                borderRadius: 16,
                border: "none",
                fontWeight: 1000,
                fontSize: 18,
                background: acceptingShots ? "#ffd166" : "rgba(255,209,102,0.35)",
                color: "#111827",
              }}
            >
              STOP & DUNK
            </button>

            <div style={{ marginTop: 10, textAlign: "center", color: "rgba(255,255,255,0.85)", fontWeight: 800 }}>
              Stop it dead center to dunk everyone.
            </div>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "absolute",
            left: 18,
            right: 18,
            bottom: 22,
            zIndex: 20,
            padding: "14px 14px",
            borderRadius: 16,
            background: "rgba(255,255,255,0.12)",
            border: "1px solid rgba(255,255,255,0.22)",
            color: "#fff",
            fontWeight: 1000,
            textAlign: "center",
          }}
        >
          {toast}
        </div>
      )}

      {/* Countdown overlay (PHONE) */}
      {game?.game_running === true && timerStartMs && countdownLeft && countdownLeft > 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 50,
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 120,
            fontWeight: 1000,
            color: "#fff",
          }}
        >
          {countdownLeft}
        </div>
      )}

      {/* Lock overlay */}
      {locked && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 60,
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            textAlign: "center",
          }}
        >
          <div style={{ color: "#fff", fontWeight: 1000, fontSize: 26, lineHeight: 1.2 }}>
            {lockText || "Locked"}
          </div>
        </div>
      )}
    </div>
  );
}
