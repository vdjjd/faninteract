"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import PlayerCard from "./PlayerCard";

const LANES = 10;

type PlayerRow = {
  id: string;
  game_id: string;
  guest_profile_id: string | null;
  lane_index: number | null;
  display_name: string | null;
  selfie_url: string | null;
  score: number | null;
  state: string | null;
  disconnected_at: string | null;
};

type LaneShot = { id: string; animation: string };

type Mode = "normal" | "three" | "dunk";

type EngineState = {
  mode: Mode;
  twoStreak: number;
  threeStreak: number;
  lastShotAt: number;
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function hitTolerance(hitzoneSize: string | null, hitzoneMultiplier: number | null, difficulty: string | null) {
  const base =
    hitzoneSize === "small" ? 0.06 : hitzoneSize === "large" ? 0.14 : 0.1; // default medium
  const mult = typeof hitzoneMultiplier === "number" ? hitzoneMultiplier : 1;
  const diff = (difficulty || "medium").toLowerCase();
  const diffMult = diff === "easy" ? 1.2 : diff === "hard" ? 0.8 : 1.0;
  return base * mult * diffMult;
}

export default function ActiveBasketballPage({ gameId }: { gameId: string }) {
  const [laneShots, setLaneShots] = useState<Record<number, LaneShot | null>>({});
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [gameSettings, setGameSettings] = useState<{
    difficulty: string | null;
    hitzone_size: string | null;
    hitzone_multiplier: number | null;
  }>({ difficulty: "medium", hitzone_size: "medium", hitzone_multiplier: 1 });

  const engineRef = useRef<Map<string, EngineState>>(new Map());
  const globalLockUntilRef = useRef<number>(0);

  // lanes map (0..9)
  const lanes = useMemo(() => {
    const arr: Array<PlayerRow | null> = Array.from({ length: LANES }).map(() => null);
    for (const p of players) {
      if (typeof p.lane_index === "number" && p.lane_index >= 0 && p.lane_index < LANES) {
        arr[p.lane_index] = p;
      }
    }
    return arr;
  }, [players]);

  // Load players + subscribe
  useEffect(() => {
    let mounted = true;

    async function loadPlayers() {
      const { data, error } = await supabase
        .from("bb_game_players")
        .select("id,game_id,guest_profile_id,lane_index,display_name,selfie_url,score,state,disconnected_at")
        .eq("game_id", gameId)
        .order("lane_index", { ascending: true });

      if (!mounted) return;

      if (error) {
        console.error("❌ load bb_game_players error:", error);
        return;
      }
      setPlayers((data || []) as PlayerRow[]);
    }

    loadPlayers();

    const channel = supabase
      .channel(`bb-players-${gameId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bb_game_players", filter: `game_id=eq.${gameId}` },
        () => loadPlayers()
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  // Load game settings once (difficulty / hitzone)
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase
        .from("bb_games")
        .select("difficulty,hitzone_size,hitzone_multiplier")
        .eq("id", gameId)
        .maybeSingle();

      if (!mounted) return;

      if (!error && data) {
        setGameSettings({
          difficulty: data.difficulty ?? "medium",
          hitzone_size: data.hitzone_size ?? "medium",
          hitzone_multiplier: data.hitzone_multiplier ?? 1,
        });
      }
    })();
    return () => {
      mounted = false;
    };
  }, [gameId]);

  function getEngine(playerId: string): EngineState {
    const m = engineRef.current;
    const existing = m.get(playerId);
    if (existing) return existing;
    const fresh: EngineState = { mode: "normal", twoStreak: 0, threeStreak: 0, lastShotAt: 0 };
    m.set(playerId, fresh);
    return fresh;
  }

  async function bumpScore(playerId: string, delta: number) {
    // Only the wall updates score (single authority) → safe enough to do select+update.
    const { data: row, error } = await supabase
      .from("bb_game_players")
      .select("id,score")
      .eq("id", playerId)
      .maybeSingle();

    if (error || !row) return;

    const next = (row.score ?? 0) + delta;
    await supabase.from("bb_game_players").update({ score: next }).eq("id", playerId);
  }

  function fireLaneAnimation(laneIndex: number, animation: string) {
    const shot: LaneShot = { id: crypto.randomUUID(), animation };
    setLaneShots((prev) => ({ ...prev, [laneIndex]: shot }));
    setTimeout(() => {
      setLaneShots((prev) => ({ ...prev, [laneIndex]: null }));
    }, 1600);
  }

  async function setPlayerMode(playerId: string, mode: Mode, extra?: any) {
    const channel = supabase.channel(`basketball-${gameId}`);
    await channel.send({
      type: "broadcast",
      event: "player_mode",
      payload: { player_id: playerId, mode, ...extra },
    });
    supabase.removeChannel(channel);
  }

  async function broadcastLock(payload: { locked: boolean; duration_ms?: number; dunker_name?: string }) {
    const channel = supabase.channel(`basketball-${gameId}`);
    await channel.send({ type: "broadcast", event: "lock", payload });
    supabase.removeChannel(channel);
  }

  async function broadcastDunked(payload: { dunker_name: string; duration_ms: number }) {
    const channel = supabase.channel(`basketball-${gameId}`);
    await channel.send({ type: "broadcast", event: "dunked", payload });
    supabase.removeChannel(channel);
  }

  // Listen for phone events: shot_attempt + dunk_attempt
  useEffect(() => {
    const tol = hitTolerance(gameSettings.hitzone_size, gameSettings.hitzone_multiplier, gameSettings.difficulty);

    const channel = supabase
      .channel(`basketball-${gameId}`)
      .on("broadcast", { event: "shot_attempt" }, async ({ payload }) => {
        const now = Date.now();

        // global lock active?
        if (now < globalLockUntilRef.current) return;

        const playerId = payload?.player_id as string | undefined;
        const laneIndex = payload?.lane_index as number | undefined;
        const power = typeof payload?.power === "number" ? payload.power : null;
        const angle = typeof payload?.angle === "number" ? payload.angle : 0;

        if (!playerId || typeof laneIndex !== "number" || power === null) return;

        // sanity: lane must match current player row
        const lanePlayer = lanes[laneIndex];
        if (!lanePlayer || lanePlayer.id !== playerId) return;

        const st = getEngine(playerId);

        // simple per-player cooldown
        if (now - st.lastShotAt < 350) return;
        st.lastShotAt = now;

        if (st.mode === "dunk") return; // dunk mode ignores normal shots

        const expected = st.mode === "three" ? 0.82 : 0.72;
        const anglePenalty = Math.abs(angle) * 0.03; // small miss bias
        const isHit = Math.abs(power - expected) <= (tol - anglePenalty);

        if (isHit) {
          const points = st.mode === "three" ? 3 : 2;
          fireLaneAnimation(laneIndex, st.mode === "three" ? "three_hit" : "hit");
          await bumpScore(playerId, points);

          if (st.mode === "normal") {
            st.twoStreak += 1;

            // 3 straight 2pt makes → switch to 3PT mode
            if (st.twoStreak >= 3) {
              st.mode = "three";
              st.threeStreak = 0;
              await setPlayerMode(playerId, "three", { shots_left: 3 });
            }
          } else if (st.mode === "three") {
            st.threeStreak += 1;

            // 3 straight 3PT makes → dunk meter
            if (st.threeStreak >= 3) {
              st.mode = "dunk";
              await setPlayerMode(playerId, "dunk");
            } else {
              await setPlayerMode(playerId, "three", { shots_left: Math.max(0, 3 - st.threeStreak) });
            }
          }
        } else {
          fireLaneAnimation(laneIndex, st.mode === "three" ? "three_miss" : "miss");

          // reset streaks/mode on miss
          st.twoStreak = 0;
          st.threeStreak = 0;

          if (st.mode !== "normal") {
            st.mode = "normal";
            await setPlayerMode(playerId, "normal");
          }
        }
      })
      .on("broadcast", { event: "dunk_attempt" }, async ({ payload }) => {
        const now = Date.now();
        if (now < globalLockUntilRef.current) return;

        const playerId = payload?.player_id as string | undefined;
        const laneIndex = payload?.lane_index as number | undefined;
        const accuracy = typeof payload?.accuracy === "number" ? payload.accuracy : null;

        if (!playerId || typeof laneIndex !== "number" || accuracy === null) return;

        const lanePlayer = lanes[laneIndex];
        if (!lanePlayer || lanePlayer.id !== playerId) return;

        const st = getEngine(playerId);
        if (st.mode !== "dunk") return;

        // success if they stopped “near center”
        const success = accuracy >= 0.82;

        // always exit dunk mode back to normal after attempt
        st.mode = "normal";
        st.twoStreak = 0;
        st.threeStreak = 0;

        if (success) {
          fireLaneAnimation(laneIndex, "dunk");
          await bumpScore(playerId, 2);

          const duration_ms = 2000;
          globalLockUntilRef.current = Date.now() + duration_ms;

          const dunkerName = lanePlayer.display_name || `Lane ${laneIndex + 1}`;

          await broadcastDunked({ dunker_name: dunkerName, duration_ms });
          await broadcastLock({ locked: true, duration_ms, dunker_name: dunkerName });

          setTimeout(async () => {
            await broadcastLock({ locked: false });
          }, duration_ms);
        }

        await setPlayerMode(playerId, "normal");
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // IMPORTANT: lanes + settings used by handler; acceptable to rebind
  }, [gameId, lanes, gameSettings]);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        backgroundImage: "url('/bbgame1920x1080.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* dark overlay */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)" }} />

      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gridTemplateRows: "repeat(2, 1fr)",
          gap: 16,
          padding: 20,
        }}
      >
        {Array.from({ length: LANES }).map((_, laneIndex) => {
          const p = lanes[laneIndex];
          return (
            <PlayerCard
              key={`${laneIndex}-${laneShots[laneIndex]?.id ?? "idle"}-${p?.id ?? "empty"}`}
              laneIndex={laneIndex}
              playerName={p?.display_name ?? null}
              selfieUrl={p?.selfie_url ?? null}
              score={p?.score ?? 0}
              animationName={laneShots[laneIndex]?.animation ?? null}
              empty={!p}
            />
          );
        })}
      </div>
    </div>
  );
}
