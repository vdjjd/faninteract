"use client";

import { use, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import ActiveBasketballPage from "../components/basketballActive";
import InactiveBasketballPage from "../components/basketballinactive";

// ⚠️ Next.js 15+ makes `params` a Promise — MUST use `use(params)`
export default function Page({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  // 🔥 Required fix — unwrap the params Promise
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
        .single();

      if (error) console.error("GAME LOAD ERROR:", error);
      setGame(data);
    }

    loadGame();

    const interval = setInterval(loadGame, 1500);
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
     CHECK IF GAME IS RUNNING
  ------------------------------------------------------------ */
  const isGameRunning = game.game_running === true;

  /* ------------------------------------------------------------
     RENDER WALL MODE
  ------------------------------------------------------------ */
  return isGameRunning ? (
    <ActiveBasketballPage params={{ gameId }} />
  ) : (
    <InactiveBasketballPage game={game} />
  );
}
