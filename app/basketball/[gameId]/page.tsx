"use client";

import { use, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import ActiveBasketball from "@/app/basketball/components/Active";
import InactiveBasketball from "@/app/basketball/components/Inactive";

export default function Page({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = use(params);

  const [game, setGame] = useState<any>(null);
  const [countdownTrigger, setCountdownTrigger] = useState(false);

  /* ------------------------------------------------------------
     LOAD GAME
  ------------------------------------------------------------ */
  useEffect(() => {
    if (!gameId) return;

    async function loadGame() {
      const { data } = await supabase
        .from("bb_games")
        .select("*")
        .eq("id", gameId)
        .single();

      setGame(data);
    }

    loadGame();
    const interval = setInterval(loadGame, 1200);

    return () => clearInterval(interval);
  }, [gameId]);

  /* ------------------------------------------------------------
     LISTEN FOR ADMIN "start_countdown"
  ------------------------------------------------------------ */
  useEffect(() => {
    if (!gameId) return;

    const channel = supabase
      .channel(`basketball-${gameId}`)
      .on("broadcast", { event: "start_countdown" }, () => {
        console.log("🔥 Countdown event received on wall");
        setCountdownTrigger(true);
      })
      .subscribe();

    // ❌ DO NOT RETURN AN ASYNC FUNCTION
    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, [gameId]);

  /* Clear countdownTrigger after ActiveBasketball consumes it */
  useEffect(() => {
    if (countdownTrigger) {
      const t = setTimeout(() => setCountdownTrigger(false), 100);
      return () => clearTimeout(t);
    }
  }, [countdownTrigger]);

  /* ------------------------------------------------------------
     LOADING
  ------------------------------------------------------------ */
  if (!game) {
    return (
      <div style={{ color: "#fff", fontSize: 40, padding: 40 }}>
        Loading…
      </div>
    );
  }

  /* ------------------------------------------------------------
     RENDER WALL
  ------------------------------------------------------------ */
  return game.game_running ? (
    <ActiveBasketball gameId={gameId} countdownTrigger={countdownTrigger} />
  ) : (
    <InactiveBasketball game={game} />
  );
}
