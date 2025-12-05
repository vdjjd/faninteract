"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import ActiveBasketballPage from "../components/basketballActive";
import InactiveBasketballPage from "../components/basketballinactive";

export default function Page({
  params,
}: {
  params: { gameId: string };
}) {
  // ⭐ No unwrapping needed
  const { gameId } = params;

  const [game, setGame] = useState<any>(null);

  /* ------------------------------------------------------------
     LOAD GAME RECORD (polling)
  ------------------------------------------------------------ */
  useEffect(() => {
    if (!gameId) return;

    const loadGame = async () => {
      const { data } = await supabase
        .from("bb_games")
        .select("*, host:hosts(*)")
        .eq("id", gameId)
        .single();

      if (data) setGame(data);
    };

    loadGame();

    const interval = setInterval(loadGame, 1500);
    return () => clearInterval(interval);
  }, [gameId]);

  /* ------------------------------------------------------------
     LOADING STATE
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
     SWITCH VIEW
  ------------------------------------------------------------ */
  const isGameRunning = game.status === "running";

  return isGameRunning ? (
    // ⭐ FIX: pass params or gameId correctly
    <ActiveBasketballPage params={{ gameId }} />
  ) : (
    <InactiveBasketballPage game={game} />
  );
}
