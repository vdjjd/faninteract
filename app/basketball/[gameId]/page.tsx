"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ActiveBasketball from "@/app/basketball/components/Active";
import InactiveBasketball from "@/app/basketball/components/Inactive";

export default function Page({ params }: { params?: { gameId?: string } } = {}) {
  // SAFEST POSSIBLE EXTRACTION
  const gameId = params?.gameId || null;

  const [game, setGame] = useState<any>(null);
  const [valid, setValid] = useState<boolean>(!!gameId);

  /* ------------------------------------------------------------
     LISTEN FOR DASHBOARD → REFRESH WALL
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
    if (!gameId) return; // >> prevents undefined-API call

    async function load() {
      const { data, error } = await supabase
        .from("bb_games")
        .select("*")
        .eq("id", gameId)
        .maybeSingle();

      if (error) {
        console.error("❌ Failed to load game:", error);
        return;
      }

      if (!data) return;

      setGame(data);
      setValid(true);
    }

    load();

    const t = setInterval(load, 1000);
    return () => clearInterval(t);
  }, [gameId]);

  /* ------------------------------------------------------------
     INVALID GAME ID HANDLER
  ------------------------------------------------------------ */
  if (!valid || !gameId) {
    return (
      <div style={{ color: "white", padding: 40, fontSize: 32 }}>
        ❌ ERROR: Invalid game ID  
        <br />
        (Popup may have loaded too early — just close and relaunch)
      </div>
    );
  }

  /* ------------------------------------------------------------
     STILL LOADING
  ------------------------------------------------------------ */
  if (!game) {
    return (
      <div style={{ color: "white", padding: 40, fontSize: 32 }}>
        Loading…
      </div>
    );
  }

  /* ------------------------------------------------------------
     SWITCH BETWEEN QR WALL + ACTIVE GAME WALL
  ------------------------------------------------------------ */
  const isActive = Boolean(game.wall_active);

  return isActive ? (
    <ActiveBasketball gameId={gameId} />
  ) : (
    <InactiveBasketball game={game} />
  );
}
