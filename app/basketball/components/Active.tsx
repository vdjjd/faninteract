// app/basketball/components/Active.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Mode = "normal" | "three" | "dunk";

type PlayerRow = {
  id: string;
  game_id: string;
  guest_profile_id: string | null;
  device_token: string | null;
  lane_index: number; // 1–10
  display_name: string | null;
  selfie_url: string | null;
  score: number | null;
  disconnected_at: string | null;
};

type ModeState = {
  mode: Mode;
  twoStreak: number;
  threeStreak: number;
  shotsLeft: number | null;
};

type ShotAnim = {
  id: string;
  lane: number; // 1–10
  made: boolean;
  points: 2 | 3;
  at: number;
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function difficultyNoise(difficulty: string | null) {
  const d = (difficulty || "medium").toLowerCase();
  if (d === "easy") return 0.06;
  if (d === "hard") return 0.16;
  return 0.11;
}

function baseThreshold(hitzoneSize: string | null) {
  const s = (hitzoneSize || "medium").toLowerCase();
  if (s === "large") return 0.45;
  if (s === "small") return 0.62;
  return 0.54;
}

function computeMade({
  power,
  angle,
  mode,
  difficulty,
  hitzoneSize,
  hitzoneMultiplier,
}: {
  power: number;
  angle: number;
  mode: Mode;
  difficulty: string | null;
  hitzoneSize: string | null;
  hitzoneMultiplier: number | null;
}) {
  const p = clamp(power, 0, 1);
  const a = clamp(angle, -1, 1);

  let accuracy = 1 - Math.abs(a) * 0.65 - (1 - p) * 0.35;

  if (mode === "three") accuracy -= 0.1;
  if (mode === "dunk") accuracy -= 0.05;

  const noise = difficultyNoise(difficulty);
  accuracy += (Math.random() * 2 - 1) * noise;

  let thr = baseThreshold(hitzoneSize);

  const mult = typeof hitzoneMultiplier === "number" ? hitzoneMultiplier : 1;
  if (mult > 1) thr -= 0.04 * (mult - 1);

  return accuracy >= thr;
}

const DEFAULT_MODE_STATE: ModeState = {
  mode: "normal",
  twoStreak: 0,
  threeStreak: 0,
  shotsLeft: null,
};

const LANE_BG = "/newbackground.png";

// Debug visuals
const HOOP_OVERLAY_VISIBLE = true;
const HOOP_DEBUG_STYLE = true;
const LANE_SCRIM = true;

// Ball tuning + debug
const BALL_DEBUG_VISIBLE_DEFAULT = true;
const STORAGE_KEY_TUNING = "bb_shot_tuning_v1";

type ShotTuning = {
  spawnX: number; // %
  spawnY: number; // %
  rimX: number; // %
  rimY: number; // %
  ballPx: number; // px
  arcPx: number; // px
};

const DEFAULT_TUNING: ShotTuning = {
  spawnX: 50,
  spawnY: 84,
  rimX: 50,
  rimY: 28,
  ballPx: 26,
  arcPx: 150,
};

function loadTuning(): ShotTuning {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY_TUNING) : null;
    if (!raw) return DEFAULT_TUNING;
    const p = JSON.parse(raw);
    return {
      spawnX: typeof p.spawnX === "number" ? p.spawnX : DEFAULT_TUNING.spawnX,
      spawnY: typeof p.spawnY === "number" ? p.spawnY : DEFAULT_TUNING.spawnY,
      rimX: typeof p.rimX === "number" ? p.rimX : DEFAULT_TUNING.rimX,
      rimY: typeof p.rimY === "number" ? p.rimY : DEFAULT_TUNING.rimY,
      ballPx: typeof p.ballPx === "number" ? p.ballPx : DEFAULT_TUNING.ballPx,
      arcPx: typeof p.arcPx === "number" ? p.arcPx : DEFAULT_TUNING.arcPx,
    };
  } catch {
    return DEFAULT_TUNING;
  }
}

function saveTuning(t: ShotTuning) {
  try {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY_TUNING, JSON.stringify(t));
  } catch {}
}

export default function ActiveBasketball({ gameId }: { gameId: string }) {
  const [game, setGame] = useState<any>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [now, setNow] = useState<number>(() => Date.now());
  const [anims, setAnims] = useState<ShotAnim[]>([]);

  const modeRef = useRef<Record<string, ModeState>>({});
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const [debugBall, setDebugBall] = useState<boolean>(BALL_DEBUG_VISIBLE_DEFAULT);
  const [tuning, setTuning] = useState<ShotTuning>(() => {
    if (typeof window === "undefined") return DEFAULT_TUNING;
    return loadTuning();
  });

  useEffect(() => {
    saveTuning(tuning);
  }, [tuning]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const { data, error } = await supabase
        .from("bb_games")
        .select("*")
        .eq("id", gameId)
        .maybeSingle();

      if (!mounted) return;
      if (error) return;
      setGame(data || null);
    }

    load();

    const ch = supabase
      .channel(`bb-game-active-${gameId}`)
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

  useEffect(() => {
    let mounted = true;

    async function loadPlayers() {
      const { data, error } = await supabase
        .from("bb_game_players")
        .select(
          "id,game_id,guest_profile_id,device_token,lane_index,display_name,selfie_url,score,disconnected_at"
        )
        .eq("game_id", gameId)
        .is("disconnected_at", null)
        .order("lane_index", { ascending: true });

      if (!mounted) return;
      if (error) return;

      const list = (data || []) as PlayerRow[];
      setPlayers(list);

      for (const p of list) {
        if (!modeRef.current[p.id]) {
          modeRef.current[p.id] = { ...DEFAULT_MODE_STATE };
        }
      }
    }

    loadPlayers();

    const ch = supabase
      .channel(`bb-players-active-${gameId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bb_game_players", filter: `game_id=eq.${gameId}` },
        () => loadPlayers()
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

  async function sendPlayerMode(playerId: string, mode: Mode, shotsLeft?: number | null) {
    if (!channelRef.current) return;
    await channelRef.current.send({
      type: "broadcast",
      event: "player_mode",
      payload: {
        player_id: playerId,
        mode,
        shots_left: typeof shotsLeft === "number" ? shotsLeft : null,
      },
    });
  }

  async function broadcastDunked({
    dunkerName,
    targetPlayerIds,
    durationMs = 2000,
  }: {
    dunkerName: string;
    targetPlayerIds: string[];
    durationMs?: number;
  }) {
    if (!channelRef.current) return;
    await channelRef.current.send({
      type: "broadcast",
      event: "dunked",
      payload: {
        dunker_name: dunkerName,
        target_player_ids: targetPlayerIds,
        duration_ms: durationMs,
      },
    });
  }

  async function bumpScore(playerId: string, delta: number) {
    const current = players.find((p) => p.id === playerId)?.score ?? 0;
    const next = current + delta;

    setPlayers((prev) => prev.map((p) => (p.id === playerId ? { ...p, score: next } : p)));

    await supabase.from("bb_game_players").update({ score: next }).eq("id", playerId);
  }

  function pushAnim(lane: number, made: boolean, points: 2 | 3) {
    const id = `${lane}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const item: ShotAnim = { id, lane, made, points, at: Date.now() };
    setAnims((prev) => [item, ...prev].slice(0, 60));
    setTimeout(() => setAnims((prev) => prev.filter((x) => x.id !== id)), 1300);
  }

  useEffect(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const ch = supabase
      .channel(`basketball-${gameId}`)
      .on("broadcast", { event: "shot_attempt" }, async ({ payload }) => {
        if (!acceptingShots) return;

        const playerId = payload?.player_id as string;
        const lane = payload?.lane_index as number;
        const power = Number(payload?.power ?? 0);
        const angle = Number(payload?.angle ?? 0);

        if (!playerId || !lane) return;

        const p = players.find((x) => x.id === playerId);
        if (!p) return;

        const st: ModeState = modeRef.current[playerId]
          ? { ...modeRef.current[playerId] }
          : { ...DEFAULT_MODE_STATE };

        const made = computeMade({
          power,
          angle,
          mode: st.mode,
          difficulty: game?.difficulty ?? "medium",
          hitzoneSize: game?.hitzone_size ?? "medium",
          hitzoneMultiplier: game?.hitzone_multiplier ?? 1,
        });

        if (st.mode === "normal") {
          pushAnim(lane, made, 2);
          if (made) {
            await bumpScore(playerId, 2);
            st.twoStreak += 1;

            if (st.twoStreak >= 3) {
              st.mode = "three";
              st.threeStreak = 0;
              st.shotsLeft = 3;
              st.twoStreak = 0;
              await sendPlayerMode(playerId, "three", st.shotsLeft);
            }
          } else {
            st.twoStreak = 0;
          }
        } else if (st.mode === "three") {
          pushAnim(lane, made, 3);
          if (made) {
            await bumpScore(playerId, 3);
            st.threeStreak += 1;
            st.shotsLeft = Math.max(0, 3 - st.threeStreak);

            if (st.threeStreak >= 3) {
              st.mode = "dunk";
              st.shotsLeft = null;
              await sendPlayerMode(playerId, "dunk", null);
            } else {
              await sendPlayerMode(playerId, "three", st.shotsLeft);
            }
          } else {
            st.mode = "normal";
            st.twoStreak = 0;
            st.threeStreak = 0;
            st.shotsLeft = null;
            await sendPlayerMode(playerId, "normal", null);
          }
        } else {
          // dunk mode is handled in dunk_attempt
          return;
        }

        modeRef.current[playerId] = st;
      })
      .on("broadcast", { event: "dunk_attempt" }, async ({ payload }) => {
        if (!acceptingShots) return;

        const playerId = payload?.player_id as string;
        const lane = payload?.lane_index as number;
        const accuracy = Number(payload?.accuracy ?? 0);

        if (!playerId || !lane) return;

        const p = players.find((x) => x.id === playerId);
        if (!p) return;

        const st = modeRef.current[playerId];
        if (!st || st.mode !== "dunk") return;

        const dunkerName = (p.display_name || "Player").trim();
        const success = accuracy >= 0.72;

        modeRef.current[playerId] = { ...DEFAULT_MODE_STATE };
        await sendPlayerMode(playerId, "normal", null);

        if (!success) {
          pushAnim(lane, false, 2);
          return;
        }

        pushAnim(lane, true, 2);
        await bumpScore(playerId, 2);

        const targets = players
          .filter((x) => x.id !== playerId && x.disconnected_at === null)
          .map((x) => x.id);

        if (targets.length) {
          await broadcastDunked({ dunkerName, targetPlayerIds: targets, durationMs: 2000 });
        }
      })
      .subscribe();

    channelRef.current = ch;

    return () => {
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [gameId, acceptingShots, players, game]);

  const laneCells = useMemo(() => {
    const map = new Map<number, PlayerRow>();
    for (const p of players) map.set(p.lane_index, p);

    const arr: Array<{ lane: number; player: PlayerRow | null; mode: ModeState }> = [];
    for (let lane = 1; lane <= 10; lane++) {
      const pl = map.get(lane) || null;
      const st: ModeState =
        pl?.id && modeRef.current[pl.id] ? modeRef.current[pl.id] : { ...DEFAULT_MODE_STATE };
      arr.push({ lane, player: pl, mode: st });
    }
    return arr;
  }, [players]); // ← removed "now" so animation isn't fighting re-renders

  async function goFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch {}
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "black",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {/* 16:9 STAGE */}
      <div
        style={{
          position: "relative",
          width: "min(100vw, calc(100vh * 16 / 9))",
          height: "min(100vh, calc(100vw * 9 / 16))",
          aspectRatio: "16 / 9",
          backgroundImage: "url('/bbgame1920x1080.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)" }} />

        <button
          onClick={goFullscreen}
          style={{
            position: "absolute",
            right: 18,
            bottom: 18,
            zIndex: 20,
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.25)",
            background: "rgba(255,255,255,0.10)",
            color: "#fff",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          Fullscreen
        </button>

        {/* Debug panel (top-left) */}
        <div
          style={{
            position: "absolute",
            left: 14,
            top: 14,
            zIndex: 30,
            width: 320,
            padding: 12,
            borderRadius: 14,
            background: "rgba(0,0,0,0.55)",
            border: "1px solid rgba(255,255,255,0.18)",
            color: "#fff",
            fontWeight: 900,
            backdropFilter: "blur(8px)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ fontSize: 14, letterSpacing: 0.4 }}>SHOT TUNING</div>
            <button
              onClick={() => setDebugBall((v) => !v)}
              style={{
                padding: "6px 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.25)",
                background: debugBall ? "rgba(34,197,94,0.35)" : "rgba(255,255,255,0.10)",
                color: "#fff",
                fontWeight: 1000,
                cursor: "pointer",
              }}
            >
              {debugBall ? "DEBUG ON" : "DEBUG OFF"}
            </button>
          </div>

          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.9 }}>
            Spawn ({tuning.spawnX.toFixed(0)}%, {tuning.spawnY.toFixed(0)}%) • Rim (
            {tuning.rimX.toFixed(0)}%, {tuning.rimY.toFixed(0)}%)
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
            <label style={{ fontSize: 12, opacity: 0.9 }}>
              Spawn X
              <input
                type="range"
                min={0}
                max={100}
                value={tuning.spawnX}
                onChange={(e) => setTuning((t) => ({ ...t, spawnX: Number(e.target.value) }))}
                style={{ width: "100%" }}
              />
            </label>
            <label style={{ fontSize: 12, opacity: 0.9 }}>
              Spawn Y
              <input
                type="range"
                min={0}
                max={100}
                value={tuning.spawnY}
                onChange={(e) => setTuning((t) => ({ ...t, spawnY: Number(e.target.value) }))}
                style={{ width: "100%" }}
              />
            </label>

            <label style={{ fontSize: 12, opacity: 0.9 }}>
              Rim X
              <input
                type="range"
                min={0}
                max={100}
                value={tuning.rimX}
                onChange={(e) => setTuning((t) => ({ ...t, rimX: Number(e.target.value) }))}
                style={{ width: "100%" }}
              />
            </label>
            <label style={{ fontSize: 12, opacity: 0.9 }}>
              Rim Y
              <input
                type="range"
                min={0}
                max={100}
                value={tuning.rimY}
                onChange={(e) => setTuning((t) => ({ ...t, rimY: Number(e.target.value) }))}
                style={{ width: "100%" }}
              />
            </label>

            <label style={{ fontSize: 12, opacity: 0.9 }}>
              Ball px
              <input
                type="range"
                min={12}
                max={80}
                value={tuning.ballPx}
                onChange={(e) => setTuning((t) => ({ ...t, ballPx: Number(e.target.value) }))}
                style={{ width: "100%" }}
              />
            </label>
            <label style={{ fontSize: 12, opacity: 0.9 }}>
              Arc px
              <input
                type="range"
                min={0}
                max={320}
                value={tuning.arcPx}
                onChange={(e) => setTuning((t) => ({ ...t, arcPx: Number(e.target.value) }))}
                style={{ width: "100%" }}
              />
            </label>
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
            <button
              onClick={() => setTuning(DEFAULT_TUNING)}
              style={{
                flex: 1,
                padding: "8px 10px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.25)",
                background: "rgba(255,255,255,0.10)",
                color: "#fff",
                fontWeight: 1000,
                cursor: "pointer",
              }}
            >
              Reset
            </button>
          </div>
        </div>

        {/* GRID */}
        <div style={{ position: "relative", zIndex: 10, height: "100%", padding: 14 }}>
          <div
            style={{
              height: "100%",
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gridTemplateRows: "repeat(2, 1fr)",
              gap: 12,
            }}
          >
            {laneCells.map(({ lane, player, mode }) => {
              const laneAnims = anims.filter((a) => a.lane === lane);
              const name = player?.display_name || `Lane {lane}`;
              const selfie = player?.selfie_url || "";

              const modeLabel =
                player?.id && mode.mode === "three"
                  ? `3PT • ${mode.shotsLeft ?? ""}`
                  : player?.id && mode.mode === "dunk"
                  ? "DUNK"
                  : "";

              return (
                <div
                  key={lane}
                  style={{
                    height: "100%",
                    minHeight: 280,
                    borderRadius: 18,
                    overflow: "hidden",
                    position: "relative",
                    border: "1px solid rgba(255,255,255,0.18)",
                    backgroundImage: `url('${LANE_BG}')`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                >
                  {LANE_SCRIM && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        background: "linear-gradient(to bottom, rgba(0,0,0,0.08), rgba(0,0,0,0.35))",
                        zIndex: 1,
                        pointerEvents: "none",
                      }}
                    />
                  )}

                  {/* Lane label */}
                  <div
                    style={{
                      position: "absolute",
                      top: 10,
                      left: 10,
                      zIndex: 10,
                      padding: "6px 10px",
                      borderRadius: 999,
                      background: "rgba(0,0,0,0.35)",
                      border: "1px solid rgba(255,255,255,0.18)",
                      color: "#fff",
                      fontWeight: 1000,
                      fontSize: 12,
                      backdropFilter: "blur(6px)",
                    }}
                  >
                    LANE {lane}
                  </div>

                  {/* HOOP OVERLAY */}
                  <div
                    style={{
                      position: "absolute",
                      top: 52,
                      left: 0,
                      right: 0,
                      display: "flex",
                      justifyContent: "center",
                      pointerEvents: "none",
                      zIndex: 8,
                      opacity: HOOP_OVERLAY_VISIBLE ? 1 : 0,
                    }}
                  >
                    <div
                      style={{
                        position: "relative",
                        width: "46%",
                        height: 83,
                        outline: HOOP_DEBUG_STYLE ? "2px dashed rgba(0,255,180,0.95)" : "none",
                        outlineOffset: 2,
                      }}
                      data-lane={lane}
                      data-hoop="true"
                    >
                      {/* Backboard */}
                      <div
                        style={{
                          position: "absolute",
                          top: 0,
                          left: "50%",
                          transform: "translateX(-50%)",
                          width: "100%",
                          height: 80,
                          borderRadius: 10,
                          background: "rgba(0,255,180,0.18)",
                          border: "2px solid rgba(0,255,180,0.95)",
                          boxShadow: "0 0 0 2px rgba(0,0,0,0.35) inset",
                        }}
                        data-part="backboard"
                      />

                      {/* Rim */}
                      <div
                        style={{
                          position: "absolute",
                          top: 65,
                          left: "50%",
                          transform: "translateX(-50%)",
                          width: "38%",
                          height: 5,
                          borderRadius: 999,
                          background: "rgba(255,106,0,0.45)",
                          border: "2px solid rgba(255,106,0,0.95)",
                          boxShadow: "0 0 14px rgba(255,106,0,0.6)",
                        }}
                        data-part="rim"
                      />

                      {/* Net debug */}
                      <div
                        style={{
                          position: "absolute",
                          top: 64,
                          left: "50%",
                          transform: "translateX(-50%)",
                          width: "34%",
                          height: 70,
                          borderLeft: "2px solid rgba(255,255,255,0.75)",
                          borderRight: "2px solid rgba(255,255,255,0.75)",
                          borderBottom: "2px solid rgba(255,255,255,0.75)",
                          borderRadius: "0 0 18px 18px",
                          background: "rgba(255,255,255,0.06)",
                        }}
                        data-part="net"
                      />

                      {/* Center marker */}
                      {HOOP_DEBUG_STYLE && (
                        <div
                          style={{
                            position: "absolute",
                            top: 0,
                            bottom: 0,
                            left: "50%",
                            width: 2,
                            transform: "translateX(-1px)",
                            background: "rgba(255,0,120,0.9)",
                          }}
                        />
                      )}
                    </div>
                  </div>

                  {/* Spawn + Rim markers */}
                  {debugBall && (
                    <>
                      {/* spawn marker */}
                      <div
                        style={{
                          position: "absolute",
                          left: `${tuning.spawnX}%`,
                          top: `${tuning.spawnY}%`,
                          transform: "translate(-50%,-50%)",
                          width: tuning.ballPx + 10,
                          height: tuning.ballPx + 10,
                          borderRadius: 999,
                          border: "2px dashed rgba(255,255,255,0.95)",
                          background: "rgba(255,255,255,0.10)",
                          zIndex: 11,
                          pointerEvents: "none",
                        }}
                      />
                      <div
                        style={{
                          position: "absolute",
                          left: `${tuning.spawnX}%`,
                          top: `${tuning.spawnY}%`,
                          transform: "translate(-50%,-50%)",
                          width: 6,
                          height: 6,
                          borderRadius: 999,
                          background: "rgba(255,255,255,0.95)",
                          zIndex: 12,
                          pointerEvents: "none",
                        }}
                      />

                      {/* rim marker */}
                      <div
                        style={{
                          position: "absolute",
                          left: `${tuning.rimX}%`,
                          top: `${tuning.rimY}%`,
                          transform: "translate(-50%,-50%)",
                          width: 18,
                          height: 18,
                          borderRadius: 999,
                          border: "2px solid rgba(255,106,0,0.95)",
                          background: "rgba(255,106,0,0.20)",
                          zIndex: 11,
                          pointerEvents: "none",
                        }}
                      />
                      <div
                        style={{
                          position: "absolute",
                          left: `${tuning.rimX}%`,
                          top: `${tuning.rimY}%`,
                          transform: "translate(-50%,-50%)",
                          width: 4,
                          height: 4,
                          borderRadius: 999,
                          background: "rgba(255,106,0,0.95)",
                          zIndex: 12,
                          pointerEvents: "none",
                        }}
                      />
                    </>
                  )}

                  {/* Player footer */}
                  <div style={{ position: "absolute", left: 12, right: 12, bottom: 14, zIndex: 10 }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <div
                        style={{
                          width: 54,
                          height: 54,
                          borderRadius: 999,
                          background: "rgba(255,255,255,0.08)",
                          border: "2px solid rgba(255,255,255,0.20)",
                          overflow: "hidden",
                          flexShrink: 0,
                        }}
                      >
                        {selfie ? (
                          <img
                            src={selfie}
                            alt="selfie"
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : null}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            color: "#fff",
                            fontWeight: 1000,
                            fontSize: 16,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {name}
                        </div>

                        <div
                          style={{
                            color: "rgba(255,255,255,0.95)",
                            fontWeight: 900,
                            fontSize: 13,
                          }}
                        >
                          Score: {player?.score ?? 0}
                          {modeLabel ? (
                            <span style={{ marginLeft: 10, color: "#ffd166" }}>{modeLabel}</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Shot anims */}
                  {laneAnims.map((a) => {
                    const peak = Math.max(0, tuning.arcPx); // px
                    const drop = 50; // % below rim

                    const styleVars: any = {
                      ["--sx" as any]: tuning.spawnX,
                      ["--sy" as any]: tuning.spawnY,
                      ["--rx" as any]: tuning.rimX,
                      ["--ry" as any]: tuning.rimY,
                      ["--peak" as any]: peak,
                      ["--drop" as any]: drop,
                      ["--ball" as any]: `${tuning.ballPx}px`,
                      ["--dur" as any]: a.made ? "1100ms" : "1050ms",
                    };

                    return (
                      <div
                        key={a.id}
                        className={`bbShot ${a.made ? "isMade" : "isMiss"}`}
                        style={styleVars}
                      >
                        <div className="bbBall" />
                        <div className="bbLabel">{a.made ? `+${a.points}` : "MISS"}</div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Countdown overlay */}
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
              fontSize: 140,
              fontWeight: 1000,
              color: "#fff",
            }}
          >
            {countdownLeft}
          </div>
        )}

        <style>{`
          .bbShot{
            position:absolute;
            left: calc(var(--sx) * 1%);
            top:  calc(var(--sy) * 1%);
            width: var(--ball);
            height: var(--ball);
            transform: translate(-50%,-50%);
            z-index: 12;
            pointer-events:none;
            animation-duration: var(--dur);
            animation-fill-mode: forwards;
            will-change: transform, left, top;
          }

          .bbBall{
            position: relative;
            width:100%;
            height:100%;
            border-radius:999px;
            background:
              radial-gradient(circle at 28% 22%, #ffe1b0 0, #ffbb66 30%, transparent 60%),
              radial-gradient(circle at 80% 80%, #7f2b03 0, #4a1400 55%, transparent 85%),
              radial-gradient(circle at 50% 50%, #ff8420 0, #f66510 45%, #d44705 80%);
            box-shadow:
              0 4px 10px rgba(0, 0, 0, 0.55),
              0 0 18px rgba(255, 140, 40, 0.55);
            animation: bbSpin 900ms linear infinite;
            overflow: hidden;
            will-change: transform;
          }

          .bbBall::before,
          .bbBall::after {
            content: "";
            position: absolute;
            inset: 0;
            border-radius: inherit;
            pointer-events: none;
          }

          .bbBall::before {
            background:
              linear-gradient(
                to right,
                transparent 48%,
                rgba(40, 12, 0, 0.9) 49%,
                rgba(40, 12, 0, 0.9) 51%,
                transparent 52%
              ),
              linear-gradient(
                to bottom,
                transparent 48%,
                rgba(40, 12, 0, 0.9) 49%,
                rgba(40, 12, 0, 0.9) 51%,
                transparent 52%
              );
            opacity: 0.9;
          }

          .bbBall::after {
            border: 2px solid rgba(40, 12, 0, 0.75);
            border-left-color: transparent;
            border-right-color: transparent;
            transform: scale(1.06);
            opacity: 0.9;
            box-shadow: 0 0 16px rgba(255, 160, 70, 0.55);
          }

          .bbLabel{
            position:absolute;
            top:-30px;
            left:-60px;
            right:-60px;
            text-align:center;
            font-weight:1000;
            font-size:16px;
          }
          .bbShot.isMade .bbLabel{ color:#00ff99; }
          .bbShot.isMiss .bbLabel{ color:#ff5c5c; }

          /* Smooth, parabolic-ish arc: only start and end positions,
             the "arc" is in translateY, so no more step/hang look. */
          @keyframes bbMade {
            0%{
              left: calc(var(--sx) * 1%);
              top:  calc(var(--sy) * 1%);
              transform: translate(-50%, -50%) scale(1.8);
              opacity: 1;
            }
            50%{
              /* browser interpolates left/top halfway between start & end;
                 we just push the ball upward for the arc and shrink a bit */
              transform: translate(-50%, calc(-50% - 1px * var(--peak))) scale(1.15);
              opacity: 1;
            }
            100%{
              left: calc(var(--rx) * 1%);
              top:  calc((var(--ry) + var(--drop)) * 1%);
              transform: translate(-50%, -50%) scale(0.4);
              opacity: 0.2;
            }
          }

          @keyframes bbMiss {
            0%{
              left: calc(var(--sx) * 1%);
              top:  calc(var(--sy) * 1%);
              transform: translate(-50%, -50%) scale(1.8);
              opacity: 1;
            }
            50%{
              transform: translate(-50%, calc(-50% - 1px * (var(--peak) * 0.9))) scale(1.25);
              opacity: 1;
            }
            100%{
              left: calc((var(--rx) + 14) * 1%);
              top:  calc((var(--ry) + var(--drop) + 4) * 1%);
              transform: translate(-50%, -50%) scale(0.5);
              opacity: 0.15;
            }
          }

          @keyframes bbSpin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }

          .bbShot.isMade {
            animation-name: bbMade;
            animation-timing-function: cubic-bezier(0.25, 0.8, 0.4, 1);
          }
          .bbShot.isMiss {
            animation-name: bbMiss;
            animation-timing-function: cubic-bezier(0.25, 0.8, 0.4, 1);
          }
        `}</style>
      </div>
    </div>
  );
}
