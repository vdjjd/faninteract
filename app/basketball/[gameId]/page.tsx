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
  // ✅ REQUIRED for Next.js 16 — unwrap params with React.use()
  const { gameId } = use(params);

  const [game, setGame] = useState<any>(null);

  /* ------------------------------------------------------------
     SAFETY CHECK — invalid or undefined gameId
  ------------------------------------------------------------ */
  if (!gameId) {
    return (
      <div
        style={{
          color: "white",
          padding: 40,
          fontSize: 32,
          textAlign: "center",
        }}
      >
        ❌ ERROR: Invalid or Missing Game ID
      </div>
    );
  }

  /* ------------------------------------------------------------
     LISTEN FOR DASHBOARD → WALL RELOAD MESSAGE
  ------------------------------------------------------------ */
  useEffect(() => {
    function handleMsg(e: MessageEvent) {
      if (e.data?.type === "refresh_wall") {
        window.location.reload();
      }
    }
    window.addEventListener("message", handleMsg);
    return () => window.removeEventListener("message", handleMsg);
  }, []);

  /* ------------------------------------------------------------
     LOAD GAME FROM SUPABASE
  ------------------------------------------------------------ */
  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("bb_games")
        .select("*")
        .eq("id", gameId)
        .maybeSingle();

      if (error) {
        console.error("❌ Failed to load bb_game:", error);
        return;
      }

      setGame(data || null);
    }

    load();
    const interval = setInterval(load, 1000); // stay synced
    return () => clearInterval(interval);
  }, [gameId]);

  /* ------------------------------------------------------------
     LOADING STATE
  ------------------------------------------------------------ */
  if (!game) {
    return (
      <div
        style={{
          color: "white",
          padding: 40,
          fontSize: 32,
          textAlign: "center",
        }}
      >
        Loading game…
      </div>
    );
  }

  /* ------------------------------------------------------------
     RENDER — Switch Between Inactive / Active Wall
  ------------------------------------------------------------ */
  return game.wall_active ? (
    <ActiveBasketball gameId={gameId} />
  ) : (
    <InactiveBasketball game={game} />
  );
}
