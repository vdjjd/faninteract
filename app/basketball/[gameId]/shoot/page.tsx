"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useCountdown } from "@/app/basketball/hooks/useCountdown";
import { Countdown } from "@/app/basketball/components/Countdown";

const CELL_COLORS = [
  "#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#5AC8FA",
  "#007AFF", "#5856D6", "#AF52DE", "#FF2D55", "#A2845E",
];

export default function ShooterPage({ params }: { params: { gameId: string } }) {
  const { gameId } = params;
  const countdownValue = useCountdown(gameId);

  const [playerId, setPlayerId] = useState<string | null>(null);
  const [laneIndex, setLaneIndex] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [laneColor, setLaneColor] = useState("#222");
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const startY = useRef(0);
  const streakRef = useRef(0);

  // Load player
  useEffect(() => {
    const stored = localStorage.getItem("bb_player_id");
    if (stored) setPlayerId(stored);
  }, []);

  useEffect(() => {
    if (!playerId) return;

    async function loadPlayer() {
      const { data } = await supabase
        .from("bb_game_players")
        .select("*")
        .eq("id", playerId)
        .single();

      if (!data) return;

      setLaneIndex(data.lane_index);
      setLaneColor(CELL_COLORS[data.lane_index]);
      setScore(data.score ?? 0);
    }

    loadPlayer();
    const int = setInterval(loadPlayer, 1100);
    return () => clearInterval(int);
  }, [playerId]);

  // Sync timer
  async function syncGameStart() {
    const { data } = await supabase
      .from("bb_games")
      .select("*")
      .eq("id", gameId)
      .single();

    if (!data?.game_running || !data.game_timer_start) return;

    const start = new Date(data.game_timer_start).getTime();
    const elapsed = Math.floor((Date.now() - start) / 1000);

    setTimeLeft(Math.max(data.duration_seconds - elapsed, 0));
  }

  // Listen for start_game
  useEffect(() => {
    const channel = supabase
      .channel(`basketball-${gameId}`)
      .on("broadcast", { event: "start_game" }, syncGameStart)
      .subscribe();

    return () => { try { supabase.removeChannel(channel); } catch {} };
  }, [gameId]);

  // Poll timer
  useEffect(() => {
    async function poll() {
      const { data } = await supabase
        .from("bb_games")
        .select("*")
        .eq("id", gameId)
        .single();

      if (!data?.game_running || !data.game_timer_start) return;

      const start = new Date(data.game_timer_start).getTime();
      const elapsed = Math.floor((Date.now() - start) / 1000);
      setTimeLeft(Math.max(data.duration_seconds - elapsed, 0));
    }

    poll();
    const int = setInterval(poll, 1000);
    return () => clearInterval(int);
  }, [gameId]);

  // Shooting logic
  async function handleShot(power: number) {
    if (!playerId || laneIndex === null) return;
    if (countdownValue !== null) return; // BLOCK during countdown

    const streak = streakRef.current;

    supabase.channel(`basketball-${gameId}`).send({
      type: "broadcast",
      event: "shot_fired",
      payload: { lane_index: laneIndex, power, streak },
    });

    const made = Math.random() < (0.45 + power * 0.35);

    if (made) {
      streakRef.current++;
      await supabase.rpc("increment_player_score", {
        p_player_id: playerId,
      });
    } else {
      streakRef.current = 0;
    }
  }

  return (
    <div
      id="lane-border"
      style={{
        width: "100vw",
        height: "100vh",
        background: "black",
        border: `8px solid ${laneColor}`,
        overflow: "hidden",
        position: "relative",
        touchAction: "none",
      }}
      onTouchStart={(e) => { startY.current = e.touches[0].clientY; }}
      onTouchEnd={(e) => {
        const dist = startY.current - e.changedTouches[0].clientY;
        if (dist > 25) handleShot(Math.min(1, Math.max(0, dist / 450)));
      }}
    >
      <Countdown preCountdown={countdownValue} />

      <div style={{ position: "absolute", top: 20, left: 20, color: "white", fontSize: "2.5rem" }}>
        {score}
      </div>

      <div style={{ position: "absolute", top: 20, right: 20, color: "white", fontSize: "2.5rem" }}>
        {timeLeft ?? "--"}
      </div>

      <div style={{
        position: "absolute",
        bottom: "5%",
        width: "100%",
        textAlign: "center",
        color: "#ddd",
        fontSize: "2rem",
        opacity: 0.7,
      }}>
        SWIPE UP TO SHOOT
      </div>
    </div>
  );
}
