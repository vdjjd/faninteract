"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ActiveBasketball from "@/app/basketball/components/Active";
import InactiveBasketball from "@/app/basketball/components/Inactive";

export default function Page({ params }: { params: { gameId: string } }) {
  const { gameId } = params;
  const [game, setGame] = useState<any>(null);

  /* ------------------------------------------------------------
     LISTEN FOR WALL REFRESH COMMAND FROM DASHBOARD
  ------------------------------------------------------------ */
  useEffect(() => {
    function handleMsg(e: MessageEvent) {
      if (e.data?.type === "refresh_wall") {
        console.log("🔄 Refreshing wall popup...");
        window.location.reload();
      }
    }
    window.addEventListener("message", handleMsg);
    return () => window.removeEventListener("message", handleMsg);
  }, []);

  /* ------------------------------------------------------------
     POLL GAME STATE EVERY SECOND
  ------------------------------------------------------------ */
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("bb_games")
        .select("*")
        .eq("id", gameId)
        .single();

      if (data) setGame(data);
    }

    load();
    const t = setInterval(load, 1000);
    return () => clearInterval(t);
  }, [gameId]);

  /* ------------------------------------------------------------
     LOADING STATE
  ------------------------------------------------------------ */
  if (!game) {
    return (
      <div style={{ color: "white", padding: 40, fontSize: 32 }}>
        Loading…
      </div>
    );
  }

  /* ------------------------------------------------------------
     PAGE SWITCH — THIS IS THE REAL LOGIC
     QR Screen → InactiveBasketball
     Active Wall → ActiveBasketball
  ------------------------------------------------------------ */

  // Treat null as false to avoid wall showing early
  const wallActive = Boolean(game.wall_active);

  if (!wallActive) {
    return <InactiveBasketball game={game} />;
  }

  return <ActiveBasketball gameId={gameId} />;
}
