"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import ActiveBasketballPage from "../components/basketballActive";
import InactiveBasketballPage from "../components/basketballinactive"; // ⭐ FIXED Casing

export default function Page({
  params,
}: {
  params: { gameId: string };
}) {
  const { gameId } = params;

  const [game, setGame] = useState<any>(null);

  /* ------------------------------------------------------------
     LOAD GAME RECORD
  ------------------------------------------------------------ */
  useEffect(() => {
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
     FIXED: USE CORRECT FIELD
     bb_games.status != game_running
     game_running is TRUE only when activated+started
  ------------------------------------------------------------ */
  const isGameRunning = game.game_running === true;

  /* ------------------------------------------------------------
     RENDER
  ------------------------------------------------------------ */
  return isGameRunning ? (
    <ActiveBasketballPage params={{ gameId }} />
  ) : (
    <InactiveBasketballPage game={game} />
  );
}
