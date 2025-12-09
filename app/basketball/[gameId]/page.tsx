"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ActiveBasketball from "@/app/basketball/components/Active";
import InactiveBasketball from "@/app/basketball/components/Inactive";

export default function Page({ params }: { params: { gameId?: string } }) {
  const gameId = params?.gameId ?? null;

  const [game, setGame] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  /** ---------------------------------------------
   *  SAFETY CHECK → Don't run ANYTHING until gameId is real
   ----------------------------------------------*/
  useEffect(() => {
    if (!gameId) return; // ← prevents undefined errors
    setLoading(false);
  }, [gameId]);

  /** ---------------------------------------------
   * LISTEN FOR REFRESH COMMAND
   ----------------------------------------------*/
  useEffect(() => {
    function handleMsg(e: MessageEvent) {
      if (e.data?.type === "refresh_wall") {
        window.location.reload();
      }
    }
    window.addEventListener("message", handleMsg);
    return () => window.removeEventListener("message", handleMsg);
  }, []);

  /** ---------------------------------------------
   * LOAD GAME DATA SAFELY
   ----------------------------------------------*/
  useEffect(() => {
    if (!gameId) return; // still prevents undefined

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

  /** ---------------------------------------------
   * INVALID GAME ID SCREEN
   ----------------------------------------------*/
  if (loading) {
    return (
      <div style={{ color: "white", padding: 40, fontSize: 32 }}>
        Loading game ID…
      </div>
    );
  }

  if (!gameId) {
    return (
      <div style={{ color: "white", padding: 40, fontSize: 32 }}>
        ❌ ERROR: Invalid game ID
        <br />
        (Popup loaded before params were ready — close and relaunch)
      </div>
    );
  }

  /** ---------------------------------------------
   * STILL FETCHING GAME
   ----------------------------------------------*/
  if (!game) {
    return (
      <div style={{ color: "white", padding: 40, fontSize: 32 }}>
        Loading game…
      </div>
    );
  }

  /** ---------------------------------------------
   * WALL SWITCH LOGIC
   ----------------------------------------------*/
  return game.wall_active
    ? <ActiveBasketball gameId={gameId} />
    : <InactiveBasketball game={game} />;
}
