"use client";

import { use, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import ActiveBasketballPage from "../components/basketballActive";
import InactiveBasketballPage from "../components/basketballinactive";

// Next.js 15+ — params is a Promise
export default function Page({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  // Unwrap params Promise
  const { gameId } = use(params);

  const [game, setGame] = useState<any>(null);

  /* ------------------------------------------------------------
     LOAD GAME RECORD
  ------------------------------------------------------------ */
  useEffect(() => {
    if (!gameId) return;

    async function loadGame() {
      const { data, error } = await supabase
        .from("bb_games")
        .select("*")
        .eq("id", gameId)
        .maybeSingle();

      if (error) console.error("GAME LOAD ERROR:", error);

      setGame(data);
    }

    loadGame();

    const interval = setInterval(loadGame, 1200);
    return () => clearInterval(interval);
  }, [gameId]);

  /* ------------------------------------------------------------
     LOADING SCREEN
  ------------------------------------------------------------ */
  if (!game) {
    return (
      <div
        style={{
          color: "#fff",
          width: "100vw",
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "3rem",
        }}
      >
        Loading…
      </div>
    );
  }

  /* ------------------------------------------------------------
     WALL MODES
     game_running = true → Active Game UI
     game_running = false → Inactive Wall
  ------------------------------------------------------------ */
  const isGameRunning = game.game_running === true;

  return isGameRunning ? (
    <ActiveBasketballPage params={{ gameId }} />
  ) : (
    <InactiveBasketballPage game={game} />
  );
}
