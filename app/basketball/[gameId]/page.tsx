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
  const { gameId } = use(params);
  const [game, setGame] = useState<any>(null);

  if (!gameId) {
    return (
      <div style={{ color: "white", padding: 40, fontSize: 32, textAlign: "center" }}>
        ❌ ERROR: Invalid or Missing Game ID
      </div>
    );
  }

  // Dashboard → wall refresh message
  useEffect(() => {
    function handleMsg(e: MessageEvent) {
      if (e.data?.type === "refresh_wall") window.location.reload();
    }
    window.addEventListener("message", handleMsg);
    return () => window.removeEventListener("message", handleMsg);
  }, []);

  // Load once + realtime subscribe (no 1s polling)
  useEffect(() => {
    let mounted = true;

    async function load() {
      const { data, error } = await supabase
        .from("bb_games")
        .select("*")
        .eq("id", gameId)
        .maybeSingle();

      if (!mounted) return;

      if (error) {
        console.error("❌ Failed to load bb_game:", error);
        return;
      }
      setGame(data || null);
    }

    load();

    const channel = supabase
      .channel(`bb-game-${gameId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "bb_games", filter: `id=eq.${gameId}` },
        (payload) => {
          setGame(payload.new);
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  if (!game) {
    return (
      <div style={{ color: "white", padding: 40, fontSize: 32, textAlign: "center" }}>
        Loading game…
      </div>
    );
  }

  return game.wall_active ? <ActiveBasketball gameId={gameId} /> : <InactiveBasketball game={game} />;
}
