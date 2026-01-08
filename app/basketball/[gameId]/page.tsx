"use client";

import { use, useEffect, useRef, useState } from "react";
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

  const pollRef = useRef<NodeJS.Timeout | null>(null);

  if (!gameId) {
    return (
      <div style={{ color: "white", padding: 40, fontSize: 32, textAlign: "center" }}>
        ❌ ERROR: Invalid or Missing Game ID
      </div>
    );
  }

  async function loadGame() {
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

  // Dashboard → wall refresh message
  useEffect(() => {
    function handleMsg(e: MessageEvent) {
      if (e.data?.type === "refresh_wall") {
        loadGame();
      }
    }
    window.addEventListener("message", handleMsg);
    return () => window.removeEventListener("message", handleMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  // Load once
  useEffect(() => {
    loadGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  // Realtime subscribe
  useEffect(() => {
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
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  // ✅ Fallback polling (fixes "activate did nothing")
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(() => {
      loadGame();
    }, 1000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  if (!game) {
    return (
      <div style={{ color: "white", padding: 40, fontSize: 32, textAlign: "center" }}>
        Loading game…
      </div>
    );
  }

  return game.wall_active ? (
    <ActiveBasketball gameId={gameId} />
  ) : (
    <InactiveBasketball game={game} />
  );
}
