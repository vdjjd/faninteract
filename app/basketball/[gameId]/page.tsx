"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ActiveBasketball from "@/app/basketball/components/Active";
import InactiveBasketball from "@/app/basketball/components/Inactive";

export default function Page({ params }: { params: { gameId: string } }) {
  const { gameId } = params;            // ✅ FIX — no more use(params)
  const [game, setGame] = useState<any>(null);

  /* ------------------------------------------------------------
     LISTEN FOR WALL REFRESH FROM DASHBOARD
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
     POLL GAME STATE
  ------------------------------------------------------------ */
  useEffect(() => {
    async function load() {
      if (!gameId) return;               // 🚨 prevents undefined
      const { data } = await supabase
        .from("bb_games")
        .select("*")
        .eq("id", gameId)
        .single();

      setGame(data);
    }

    load();
    const t = setInterval(load, 1000);
    return () => clearInterval(t);
  }, [gameId]);

  if (!gameId) {
    return (
      <div style={{ color: "white", padding: 40, fontSize: 28 }}>
        ❌ ERROR: Invalid game ID  
      </div>
    );
  }

  if (!game) {
    return (
      <div style={{ color: "white", padding: 40, fontSize: 32 }}>
        Loading…
      </div>
    );
  }

  const active = Boolean(game.wall_active);

  return active ? (
    <ActiveBasketball gameId={gameId} />
  ) : (
    <InactiveBasketball game={game} />
  );
}
