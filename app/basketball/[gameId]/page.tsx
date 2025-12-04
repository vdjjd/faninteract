"use client";

import { use, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import ActiveBasketballPage from "../components/basketballActive";
import InactiveBasketballPage from "../components/basketballinactive";

export default function Page({ params }: { params: Promise<{ gameId: string }> }) {
  // ⭐ Next.js 15 — unwrap params with use()
  const { gameId } = use(params);

  const [game, setGame] = useState<any>(null);

  useEffect(() => {
    if (!gameId) return;

    const load = async () => {
      const { data } = await supabase
        .from("bb_games")
        .select("*, host:hosts(*)")
        .eq("id", gameId)
        .single();

      setGame(data);
    };

    load();
    const interval = setInterval(load, 1500);
    return () => clearInterval(interval);
  }, [gameId]);

  if (!game)
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

  return game.status === "running" ? (
    <ActiveBasketballPage gameId={gameId} />
  ) : (
    <InactiveBasketballPage game={game} />
  );
}
