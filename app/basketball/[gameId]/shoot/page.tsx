"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useCountdown } from "@/app/basketball/hooks/useCountdown";
import { Countdown } from "@/app/basketball/components/Countdown";

/* COLORS */
const CELL_COLORS = [
  "#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#5AC8FA",
  "#007AFF", "#5856D6", "#AF52DE", "#FF2D55", "#A2845E",
];

export default function ShooterPage({ params }: { params: { gameId: string } }) {
  const { gameId } = params;

  /* -------------------------------------------------------
     COUNTDOWN — number or null
  ------------------------------------------------------- */
  const countdownValue = useCountdown(gameId);

  /* PLAYER STATE */
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [laneIndex, setLaneIndex] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [laneColor, setLaneColor] = useState("#222");
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const startY = useRef(0);
  const streakRef = useRef(0);

  /* -------------------------------------------------------
     LISTEN FOR start_countdown FROM POSTMESSAGE
     → This was missing!
  ------------------------------------------------------- */
  useEffect(() => {
    function handleMsg(e: MessageEvent) {
      if (e.data?.type === "start_countdown") {
        window.dispatchEvent(new CustomEvent("force-start-countdown"));
      }
    }
    window.addEventListener("message", handleMsg);
    return () => window.removeEventListener("message", handleMsg);
  }, []);

  /* -------------------------------------------------------
     LISTEN FOR start_countdown FROM SUPABASE
     → Shooter MUST react to broadcast
  ------------------------------------------------------- */
  useEffect(() => {
    const channel = supabase
      .channel(`basketball-${gameId}`)
      .on("broadcast", { event: "start_countdown" }, () => {
        window.dispatchEvent(new CustomEvent("force-start-countdown"));
      })
      .subscribe();

    return () => {
      try { supabase.removeChannel(channel); } catch {}
    };
  }, [gameId]);

  /* -------------------------------------------------------
     FORCE START COUNTDOWN (connects to useCountdown)
  ------------------------------------------------------- */
  useEffect(() => {
    function begin() {
      // Tell hook that countdown must begin
      window.localStorage.setItem("bb_force_countdown", "1");
    }
    window.addEventListener("force-start-countdown", begin);
    return () =>
      window.removeEventListener("force-start-countdown", begin);
  }, []);

  /* -------------------------------------------------------
     LOAD PLAYER
  ------------------------------------------------------- */
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
    const int = setInterval(loadPlayer, 1200);
    return () => clearInterval(int);
  }, [playerId]);

  /* -------------------------------------------------------
     GAME TIMER SYNC
  ------------------------------------------------------- */
  async function syncGameStart() {
    const { data } = await supabase
      .from("bb_games")
      .select("*")
      .eq("id", gameId)
      .single();

    if (!data || !data.game_running || !data.game_timer_start) return;

    const start = new Date(data.game_timer_start).getTime();
    const now = Date.now();
    const elapsed = Math.floor((now - start) / 1000);
    setTimeLeft(Math.max(data.duration_seconds - elapsed, 0));
  }

  useEffect(() => {
    const channel = supabase
      .channel(`basketball-${gameId}`)
      .on("broadcast", { event: "start_game" }, syncGameStart)
      .subscribe();

    return () => { try { supabase.removeChannel(channel); } catch {} };
  }, [gameId]);

  /* POLLING */
  useEffect(() => {
    async function pull() {
      const { data } = await supabase
        .from("bb_games")
        .select("*")
        .eq("id", gameId)
        .single();

      if (!data || !data.game_running || !data.game_timer_start) return;

      const start = new Date(data.game_timer_start).getTime();
      const elapsed = Math.floor((Date.now() - start) / 1000);
      setTimeLeft(Math.max(data.duration_seconds - elapsed, 0));
    }

    pull();
    const int = setInterval(pull, 1000);
    return () => clearInterval(int);
  }, [gameId]);

  /* -------------------------------------------------------
     SHOOT
  ------------------------------------------------------- */
  async function handleShot(power: number) {
    if (!playerId || laneIndex === null) return;

    if (countdownValue !== null) return;

    supabase.channel(`basketball-${gameId}`).send({
      type: "broadcast",
      event: "shot_fired",
      payload: { lane_index: laneIndex, power, streak: streakRef.current },
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

  /* TOUCH */
  function onTouchStart(e: React.TouchEvent) {
    startY.current = e.touches[0].clientY;
  }

  function onTouchEnd(e: React.TouchEvent) {
    const dist = startY.current - e.changedTouches[0].clientY;
    if (dist < 25) return;

    const power = Math.min(1, Math.max(0, dist / 450));
    handleShot(power);
  }

  /* UI */
  return (
    <div
      id="lane-border"
      style={{
        width: "100vw",
        height: "100vh",
        background: "black",
        border: `8px solid ${laneColor}`,
        position: "relative",
        overflow: "hidden",
        touchAction: "none",
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <Countdown preCountdown={countdownValue} />

      <div style={{
        position: "absolute", top: 20, left: 20,
        color: "white", fontSize: "2.5rem", fontWeight: 900
      }}>
        {score}
      </div>

      <div style={{
        position: "absolute", top: 20, right: 20,
        color: "white", fontSize: "2.5rem", fontWeight: 900,
        fontFamily: "Digital, monospace"
      }}>
        {timeLeft ?? "--"}
      </div>

      <div style={{
        position: "absolute", bottom: "5%",
        width: "100%", textAlign: "center",
        color: "#ddd", fontSize: "2rem", opacity: 0.7
      }}>
        SWIPE UP TO SHOOT
      </div>
    </div>
  );
}
