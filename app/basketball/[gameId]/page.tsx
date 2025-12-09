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
  // ✅ FIX: unwrap dynamic route params (Next.js 16 requirement)
  const { gameId } = use(params);

  const [game, setGame] = useState<any>(null);

  /* ------------------------------------------------------------
     LISTEN FOR "refresh_wall" MESSAGE FROM DASHBOARD
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
    if (!gameId) return;

    async function load() {
      const { data, error } = await supabase
        .from("bb_games")
        .select("*")
        .eq("id", gameId)
        .maybeSingle();

      if (error) {
        console.error("❌ Load error:", error);
        return;
      }

      if (data) setGame(data);
    }

    load();

    const t = setInterval(load, 1000);
    return () => clearInterval(t);
  }, [gameId]);

  /* ------------------------------------------------------------
     INVALID GAME ID
  ------------------------------------------------------------ */
  if (!gameId) {
    return (
      <div style={{ color: "white", padding: 40, fontSize: 32 }}>
        ❌ ERROR: Invalid Game ID
      </div>
    );
  }

  /* ------------------------------------------------------------
     STILL LOADING FROM SUPABASE
  ------------------------------------------------------------ */
  if (!game) {
    return (
      <div style={{ color: "white", padding: 40, fontSize: 32 }}>
        Loading game…
      </div>
    );
  }

  /* ------------------------------------------------------------
     RENDER WALL
  ------------------------------------------------------------ */
  return game.wall_active ? (
    <ActiveBasketball gameId={gameId} />
  ) : (
    <InactiveBasketball game={game} />
  );
}
