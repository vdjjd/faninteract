"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";

import BasketballGameCard from "./BasketballGameCard";
import BasketballModerationModal from "@/components/BasketballModerationModal";
import BasketballOptionsModal from "@/components/BasketballOptionsModal";

interface BasketballGridProps {
  games: any[] | undefined;
  host: any;
  refreshBasketballGames: () => Promise<void>;
  onOpenOptions?: (game: any) => void;
}

export default function BasketballGrid({
  games,
  host,
  refreshBasketballGames,
  onOpenOptions,
}: BasketballGridProps) {
  const [localGames, setLocalGames] = useState<any[]>([]);
  const [moderationGameId, setModerationGameId] = useState<string | null>(null);

  const [selectedGame, setSelectedGame] = useState<any | null>(null);
  const [isOptionsOpen, setOptionsOpen] = useState(false);

  const refreshTimeout = useRef<NodeJS.Timeout | null>(null);

  /* ------------------------------------------------------------
     SAFE SYNC OF PROPS → STATE  (fixes undefined game.id issues)
  ------------------------------------------------------------ */
  useEffect(() => {
    if (Array.isArray(games)) {
      // Only reject null/undefined — allow all valid objects
      const clean = games.filter((g) => g && g.id != null);
      setLocalGames(clean);
    } else {
      setLocalGames([]);
    }
  }, [games]);

  /* ------------------------------------------------------------
     REALTIME SYNC — listens for player join/leave
  ------------------------------------------------------------ */
  useEffect(() => {
    if (!host?.id) return;

    const channel = supabase
      .channel("basketball-grid-sync")
      .on(
        "postgres_changes",
        {
          schema: "public",
          table: "bb_game_entries",
          event: "*",
          filter: `game_id=not.is.null`,
        },
        async () => {
          const { data } = await supabase
            .from("bb_games")
            .select("*")
            .eq("host_id", host.id)
            .order("created_at", { ascending: false });

          setLocalGames(data || []);
        }
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, [host?.id]);

  /* ------------------------------------------------------------
     BROADCAST HELPER
  ------------------------------------------------------------ */
  async function broadcast(event: string, payload: any) {
    try {
      await supabase.channel("basketball-realtime").send({
        type: "broadcast",
        event,
        payload,
      });
    } catch (err) {
      console.error("❌ BasketballGrid broadcast failed:", err);
    }
  }

  /* ------------------------------------------------------------
     Game Actions
  ------------------------------------------------------------ */
  async function handleStart(gameId: string) {
    await supabase
      .from("bb_games")
      .update({
        status: "running",
        started_at: new Date().toISOString(),
        game_running: true,
        game_timer_start: new Date().toISOString(),
      })
      .eq("id", gameId);

    await broadcast("basketball_game_started", { gameId });
    delayedRefresh();
  }

  async function handleStop(gameId: string) {
    await supabase
      .from("bb_games")
      .update({
        status: "ended",
        ended_at: new Date().toISOString(),
        game_running: false,
      })
      .eq("id", gameId);

    await broadcast("basketball_game_stopped", { gameId });
    delayedRefresh();
  }

  async function handleDelete(id: string) {
    setLocalGames((prev) => prev.filter((g) => g.id !== id));

    await supabase.from("bb_games").delete().eq("id", id);
    await broadcast("basketball_game_deleted", { id });

    delayedRefresh();
  }

  /* ------------------------------------------------------------
     Moderation Handlers
  ------------------------------------------------------------ */
  function handleOpenModeration(gameId: string) {
    setModerationGameId(gameId);
  }

  function handleCloseModeration() {
    setModerationGameId(null);
  }

  /* ------------------------------------------------------------
     Options Handlers
  ------------------------------------------------------------ */
  function handleOpenOptionsInternal(game: any) {
    setSelectedGame(game);
    setOptionsOpen(true);
    if (onOpenOptions) onOpenOptions(game);
  }

  function handleCloseOptions() {
    setSelectedGame(null);
    setOptionsOpen(false);
  }

  /* ------------------------------------------------------------
     Debounced Refresh
  ------------------------------------------------------------ */
  function delayedRefresh() {
    if (refreshTimeout.current) clearTimeout(refreshTimeout.current);

    refreshTimeout.current = setTimeout(() => {
      refreshBasketballGames().catch(console.error);
    }, 400);
  }

  /* ------------------------------------------------------------
     RENDER UI
  ------------------------------------------------------------ */
  return (
    <div className={cn("mt-10 w-full max-w-6xl")}>
      <h2 className={cn("text-xl font-semibold mb-3")}>🏀 Basketball Games</h2>

      <div
        className={cn(
          "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5"
        )}
      >
        {localGames.length === 0 && (
          <p className={cn("text-gray-400 italic")}>
            No Basketball Games created yet.
          </p>
        )}

        {localGames.map((game) => (
          <BasketballGameCard
            key={game.id}
            game={game}
            onOpenModeration={handleOpenModeration}
            onRefresh={refreshBasketballGames}
            onDelete={handleDelete}
            onStart={handleStart}
            onStop={handleStop}
            onOpenOptions={handleOpenOptionsInternal}
          />
        ))}
      </div>

      {/* Moderation Modal */}
      {moderationGameId && (
        <BasketballModerationModal
          gameId={moderationGameId}
          onClose={handleCloseModeration}
        />
      )}

      {/* Options Modal */}
      {selectedGame && (
        <BasketballOptionsModal
          game={selectedGame}
          isOpen={isOptionsOpen}
          onClose={handleCloseOptions}
          refreshBasketballGames={refreshBasketballGames}
        />
      )}
    </div>
  );
}
