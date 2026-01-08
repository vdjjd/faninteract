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
  dx: number; // px drift for arc animation
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function noiseByDifficulty(difficulty: string | null) {
  const d = (difficulty || "medium").toLowerCase();
  if (d === "easy") return 0.03;
  if (d === "hard") return 0.10;
  return 0.06;
}

function hoopRadiusBySettings({
  hitzoneSize,
  hitzoneMultiplier,
}: {
  hitzoneSize: string | null;
  hitzoneMultiplier: number | null;
}) {
  const s = (hitzoneSize || "medium").toLowerCase();
  let r = 0.090; // normalized hoop aperture radius (0..1 space)

  if (s === "large") r += 0.020;
  if (s === "small") r -= 0.020;

  const mult = typeof hitzoneMultiplier === "number" ? hitzoneMultiplier : 1;
  if (mult > 1) r += 0.010 * (mult - 1);

  return clamp(r, 0.050, 0.140);
}

/**
 * Simple 2D “ballistic” sim:
 * - We simulate a parabolic arc in normalized lane-space (0..1 for x/y)
 * - Shot is MADE if the ball crosses the rim Y level downward while its center is within the rim aperture.
 * - Difficulty scales with noise applied to input.
 */
function computeMadePhysics({
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
  let p = clamp(power, 0, 1);
  let a = clamp(angle, -1, 1);

  // apply difficulty noise
  const n = noiseByDifficulty(difficulty);
  p = clamp(p + (Math.random() * 2 - 1) * n * 0.8, 0, 1);
  a = clamp(a + (Math.random() * 2 - 1) * n * 1.2, -1, 1);

  // lane-space coordinates
  const rimX = 0.5;
  const rimY = 0.78;

  const hoopR = hoopRadiusBySettings({ hitzoneSize, hitzoneMultiplier });

  // ball radius in lane-space
  const ballR = 0.030;

  // start positions: straight-on arcade feel
  const startX = 0.5;
  const startY = mode === "three" ? 0.12 : 0.18;

  // velocities (tuned to feel “real”)
  // vx controlled by angle; vy controlled by power
  const baseVy = mode === "three" ? 1.70 : 1.55;
  const vy0 = baseVy + p * (mode === "three" ? 1.25 : 1.10);
  const vx0 = a * (0.85 + 0.75 * p);

  const g = 2.90; // gravity
  const dt = 1 / 60;
  const maxT = 1.55;

  let x = startX;
  let y = startY;
  let vx = vx0;
  let vy = vy0;

  let prevY = y;

  for (let t = 0; t < maxT; t += dt) {
    x += vx * dt;
    y += vy * dt;
    vy -= g * dt;

    // out of bounds / landed
    if (y < 0) break;

    // check "through rim" crossing: must cross rimY downward
    const crossedDown = prevY > rimY && y <= rimY && vy < 0;

    if (crossedDown) {
      const withinAperture = Math.abs(x - rimX) <= hoopR - ballR * 0.85;
      if (withinAperture) return true;
      // if it crossed rimY but outside aperture, it's a miss
      return false;
    }

    prevY = y;

    // clip bounds (miss if wildly off)
    if (x < -0.2 || x > 1.2 || y > 1.4) break;
  }

  return false;
}

const DEFAULT_MODE_STATE: ModeState = {
  mode: "normal",
  twoStreak: 0,
  threeStreak: 0,
  shotsLeft: null,
};

export default function ActiveBasketball({ gameId }: { gameId: string }) {
  const [game, setGame] = useState<any>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [now, setNow] = useState<number>(() => Date.now());
  const [anims, setAnims] = useState<ShotAnim[]>([]);

  const modeRef = useRef<Record<string, ModeState>>({});
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

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
        {
          event: "UPDATE",
          schema: "public",
          table: "bb_games",
          filter: `id=eq.${gameId}`,
        },
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
        {
          event: "*",
          schema: "public",
          table: "bb_game_players",
          filter: `game_id=eq.${gameId}`,
        },
        () => loadPlayers()
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(ch);
    };
  }, [gameId]);

  const durationSeconds = game?.duration_seconds ?? 90;
  const timerStartMs = game?.game_timer_start
    ? new Date(game.game_timer_start).getTime()
    : null;

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
    const elapsedAfterCountdown = Math.max(
      0,
      (now - timerStartMs - countdownMs) / 1000
    );
    return Math.max(0, Math.ceil(durationSeconds - elapsedAfterCountdown));
  }, [timerStartMs, now, durationSeconds]);

  const acceptingShots =
    game?.status === "running" &&
    game?.game_running === true &&
    !!timerStartMs &&
    countdownLeft === 0 &&
    gameSecondsLeft > 0;

  async function sendPlayerMode(
    playerId: string,
    mode: Mode,
    shotsLeft?: number | null
  ) {
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

    setPlayers((prev) =>
      prev.map((p) => (p.id === playerId ? { ...p, score: next } : p))
    );

    await supabase.from("bb_game_players").update({ score: next }).eq("id", playerId);
  }

  function pushAnim(lane: number, made: boolean, points: 2 | 3, dx: number) {
    const id = `${lane}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const item: ShotAnim = { id, lane, made, points, at: Date.now(), dx };
    setAnims((prev) => [item, ...prev].slice(0, 60));
    setTimeout(() => setAnims((prev) => prev.filter((x) => x.id !== id)), 950);
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
        const lane = Number(payload?.lane_index ?? 0);
        const power = Number(payload?.power ?? 0);
        const angle = Number(payload?.angle ?? 0);

        if (!playerId || !lane) return;

        const p = players.find((x) => x.id === playerId);
        if (!p) return;

        const st: ModeState = modeRef.current[playerId]
          ? { ...modeRef.current[playerId] }
          : { ...DEFAULT_MODE_STATE };

        const made = computeMadePhysics({
          power,
          angle,
          mode: st.mode,
          difficulty: game?.difficulty ?? "medium",
          hitzoneSize: game?.hitzone_size ?? "medium",
          hitzoneMultiplier: game?.hitzone_multiplier ?? 1,
        });

        const dxPx = clamp(angle, -1, 1) * 70;

        if (st.mode === "normal") {
          pushAnim(lane, made, 2, dxPx);
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
          pushAnim(lane, made, 3, dxPx);
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
          return;
        }

        modeRef.current[playerId] = st;
      })
      .on("broadcast", { event: "dunk_attempt" }, async ({ payload }) => {
        if (!acceptingShots) return;

        const playerId = payload?.player_id as string;
        const lane = Number(payload?.lane_index ?? 0);
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
          pushAnim(lane, false, 2, 0);
          return;
        }

        pushAnim(lane, true, 2, 0);
        await bumpScore(playerId, 2);

        const targets = players
          .filter((x) => x.id !== playerId && x.disconnected_at === null)
          .map((x) => x.id);

        if (targets.length) {
          await broadcastDunked({
            dunkerName,
            targetPlayerIds: targets,
            durationMs: 2000,
          });
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

    const arr: Array<{ lane: number; player: PlayerRow | null; mode: ModeState }> =
      [];
    for (let lane = 1; lane <= 10; lane++) {
      const pl = map.get(lane) || null;

      const st: ModeState =
        pl?.id && modeRef.current[pl.id]
          ? modeRef.current[pl.id]
          : { ...DEFAULT_MODE_STATE };

      arr.push({ lane, player: pl, mode: st });
    }
    return arr;
  }, [players, now]);

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
        backgroundImage: "url('/bbgame1920x1080.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        position: "relative",
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

      <div style={{ position: "relative", zIndex: 10, padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ color: "#fff", fontWeight: 1000, fontSize: 28 }}>Basketball Battle</div>
          <div style={{ color: "#fff", fontWeight: 1000, fontSize: 34 }}>{gameSecondsLeft}s</div>
        </div>

        <div style={{ color: "rgba(255,255,255,0.82)", fontWeight: 900, marginTop: 6 }}>
          {acceptingShots ? "LIVE • SWIPE TO SHOOT" : "WAITING / COUNTDOWN / GAME OVER"}
        </div>
      </div>

      <div style={{ position: "relative", zIndex: 10, padding: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14 }}>
          {laneCells.map(({ lane, player, mode }) => {
            const laneAnims = anims.filter((a) => a.lane === lane);

            const name = player?.display_name || `Lane ${lane}`;
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
                  height: 280,
                  borderRadius: 18,
                  background: "rgba(0,0,0,0.45)",
                  border: "1px solid rgba(255,255,255,0.18)",
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                {/* Lane label */}
                <div
                  style={{
                    position: "absolute",
                    top: 10,
                    left: 10,
                    zIndex: 7,
                    padding: "6px 10px",
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.10)",
                    border: "1px solid rgba(255,255,255,0.18)",
                    color: "#fff",
                    fontWeight: 1000,
                    fontSize: 12,
                  }}
                >
                  LANE {lane}
                </div>

                {/* Hoop + board (simple shapes, per lane) */}
                <div style={{ position: "absolute", top: 20, left: 0, right: 0, height: 150, zIndex: 3 }}>
                  {/* backboard */}
                  <div
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: 8,
                      transform: "translateX(-50%)",
                      width: 86,
                      height: 70,
                      borderRadius: 8,
                      background: "rgba(255,255,255,0.10)",
                      border: "2px solid rgba(255,255,255,0.22)",
                      boxShadow: "0 0 18px rgba(255,255,255,0.12)",
                    }}
                  />
                  {/* rim */}
                  <div
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: 68,
                      transform: "translateX(-50%)",
                      width: 76,
                      height: 10,
                      borderRadius: 999,
                      background: "#ff7a00",
                      boxShadow: "0 0 18px rgba(255,122,0,0.55)",
                    }}
                  />
                  {/* net */}
                  <div
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: 78,
                      transform: "translateX(-50%)",
                      width: 64,
                      height: 52,
                      borderRadius: "0 0 18px 18px",
                      borderLeft: "2px solid rgba(255,255,255,0.25)",
                      borderRight: "2px solid rgba(255,255,255,0.25)",
                      borderBottom: "2px solid rgba(255,255,255,0.22)",
                      opacity: 0.75,
                    }}
                  />
                </div>

                {/* Player pill (mode indicator) */}
                <div
                  style={{
                    position: "absolute",
                    top: 18,
                    right: 12,
                    width: 44,
                    height: 44,
                    borderRadius: 999,
                    border: mode.mode === "three" ? "3px solid #ffd166" : "3px solid rgba(255,255,255,0.75)",
                    boxShadow: mode.mode === "three" ? "0 0 16px rgba(255,209,102,0.45)" : "0 0 10px rgba(255,255,255,0.20)",
                    zIndex: 7,
                  }}
                />

                {/* Footer */}
                <div style={{ position: "absolute", left: 12, right: 12, bottom: 14, zIndex: 7 }}>
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

                      <div style={{ color: "rgba(255,255,255,0.75)", fontWeight: 900, fontSize: 13 }}>
                        Score: {player?.score ?? 0}
                        {modeLabel ? (
                          <span style={{ marginLeft: 10, color: "#ffd166" }}>{modeLabel}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Shot anims */}
                {laneAnims.map((a) => (
                  <div
                    key={a.id}
                    style={{
                      position: "absolute",
                      left: "50%",
                      bottom: 70,
                      transform: "translateX(-50%)",
                      width: 18,
                      height: 18,
                      borderRadius: 999,
                      background: "#ff7a00",
                      boxShadow: "0 0 18px rgba(255,122,0,0.65)",
                      animation: `bbArc 820ms ease-out forwards`,
                      zIndex: 6,
                      ["--dx" as any]: `${a.dx}px`,
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: -30,
                        left: -34,
                        right: -34,
                        textAlign: "center",
                        color: a.made ? "#00ff99" : "#ff5c5c",
                        fontWeight: 1000,
                        fontSize: 16,
                      }}
                    >
                      {a.made ? `+${a.points}` : "MISS"}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Countdown overlay on wall */}
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
        @keyframes bbArc {
          0%   { transform: translate(-50%, 0) scale(1); opacity: 1; }
          55%  { transform: translate(calc(-50% + var(--dx)), -210px) scale(0.90); opacity: 1; }
          100% { transform: translate(calc(-50% + var(--dx)), -165px) scale(0.82); opacity: 0.25; }
        }
      `}</style>
    </div>
  );
}
