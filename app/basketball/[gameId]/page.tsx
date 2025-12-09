"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import ActiveBasketball from "@/app/basketball/components/Active";
import InactiveBasketball from "@/app/basketball/components/Inactive";

export default function Page({ params }: { params: { gameId: string } }) {
  const { gameId } = params;
  const [game, setGame] = useState<any>(null);

  // Prevent double-refresh loops
  const hasRefreshed = useRef(false);

  /* ------------------------------------------------------------
     LISTEN FOR WALL REFRESH COMMAND (Dashboard → Wall)
  ------------------------------------------------------------ */
  useEffect(() => {
    function handleMsg(e: MessageEvent) {
      if (e.data?.type === "refresh_wall" && !hasRefreshed.current) {
        hasRefreshed.current = true;
        console.log("🔄 Refreshing wall popup...");
        window.location.reload();
      }
    }

    window.addEventListener("message", handleMsg);
    return () => window.removeEventListener("message", handleMsg);
  }, []);

  /* ------------------------------------------------------------
     REALTIME SUBSCRIPTION — AUTO UPDATE WALL WITHOUT FREEZING
  ------------------------------------------------------------ */
  useEffect(() => {
    const channel = supabase
      .channel(`wall-${gameId}`)
      .on(
        "postgres_changes",
        {
          schema: "public",
          table: "bb_games",
          event: "*",
          filter: `id=eq.${gameId}`,
        },
        (payload) => {
          console.log("📡 LIVE UPDATE → wall state changed", payload.new);
          setGame(payload.new);
        }
      )
      .subscribe();

    return () => {
      try { supabase.removeChannel(channel); } catch {}
    };
  }, [gameId]);

  /* ------------------------------------------------------------
     INITIAL LOAD (fallback before realtime connects)
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
  }, [gameId]);

  /* ------------------------------------------------------------
     LOADING DISPLAY
  ------------------------------------------------------------ */
  if (!game) {
    return (
      <div style={{ color: "white", padding: 40, fontSize: 32 }}>
        Loading…
      </div>
    );
  }

  /* ------------------------------------------------------------
     MAIN LOGIC — Decide which screen to show
  ------------------------------------------------------------ */

  const wallActive = game.wall_active === true;

  if (!wallActive) {
    return <InactiveBasketball game={game} />;
  }

  return <ActiveBasketball gameId={gameId} />;
}
