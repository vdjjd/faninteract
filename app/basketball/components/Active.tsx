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

  if (mode === "three") accuracy -= 0.10;
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
        .select("id,game_id,guest_profile_id,device_token,lane_index,display_name,selfie_url,score,disconnected_at")
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
    setAnims((prev) => [item, ...prev].slice(0, 40));
    setTimeout(() => setAnims((prev) => prev.filter((x) => x.id !== id)), 900);
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

        const st: ModeState = modeRef.current[playerId] ? { ...modeRef.current[playerId] } : { ...DEFAULT_MODE_STATE };

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
                <div
                  style={{
                    position: "absolute",
                    top: 10,
                    left: 10,
                    zIndex: 5,
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
                  }}
                />

                <div style={{ position: "absolute", left: 12, right: 12, bottom: 14 }}>
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
                        <img src={selfie} alt="selfie" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
                        {modeLabel ? <span style={{ marginLeft: 10, color: "#ffd166" }}>{modeLabel}</span> : null}
                      </div>
                    </div>
                  </div>
                </div>

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
                      animation: `bbBallUp 700ms ease-out forwards`,
                      zIndex: 6,
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: -30,
                        left: -30,
                        right: -30,
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
        @keyframes bbBallUp {
          0%   { transform: translate(-50%, 0) scale(1); opacity: 1; }
          100% { transform: translate(-50%, -160px) scale(0.8); opacity: 0.2; }
        }
      `}</style>
    </div>
  );
}
