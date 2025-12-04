"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";

// Global popup reference
declare global {
  interface Window {
    _basketballPopup?: Window | null;
  }
}

interface BasketballGameCardProps {
  game: any;
  onOpenModeration: (gameId: string) => void;
  onStart: (gameId: string) => Promise<void>;
  onStop: (gameId: string) => Promise<void>;
  onDelete: (gameId: string) => Promise<void>;
  onOpenOptions: (game: any) => void;
  onRefresh: () => Promise<void>;
}

export default function BasketballGameCard({
  game,
  onOpenModeration,
  onStart,
  onStop,
  onDelete,
  onOpenOptions,
  onRefresh,
}: BasketballGameCardProps) {
  const [wallActivated, setWallActivated] = useState(false);

  if (!game?.id) {
    return (
      <div
        className={cn(
          "rounded-xl",
          "p-4",
          "text-center",
          "bg-gray-700/20",
          "text-gray-300",
          "border",
          "border-white/10"
        )}
      >
        Loading game…
      </div>
    );
  }

  /* ------------------------------------------------------------
     STATUS BADGE
  ------------------------------------------------------------ */
  function StatusBadge() {
    const base = "font-bold tracking-wide px-2 py-1 rounded-lg text-xs";

    if (game.status === "running")
      return (
        <span className={cn(base, "bg-green-600 text-white")}>RUNNING</span>
      );

    if (game.status === "ended")
      return <span className={cn(base, "bg-gray-600 text-white")}>ENDED</span>;

    return <span className={cn(base, "bg-blue-600 text-white")}>LOBBY</span>;
  }

  /* ------------------------------------------------------------
     Launch Wall (opens popup)
  ------------------------------------------------------------ */
  function openWallWindow() {
    const url = `${window.location.origin}/basketball/${game.id}`;

    let popup = window._basketballPopup;

    if (!popup || popup.closed) {
      popup = window.open(
        url,
        "_blank",
        "width=1280,height=800,resizable=yes,scrollbars=yes"
      );
      window._basketballPopup = popup;
    }

    popup?.focus();
    return popup;
  }

  /* ------------------------------------------------------------
     ACTIVATE WALL
  ------------------------------------------------------------ */
  async function handleActivateWall() {
    await supabase
      .from("bb_games")
      .update({
        status: "running",
        game_running: false,
        game_timer_start: null,
      })
      .eq("id", game.id);

    setWallActivated(true);
    await onRefresh();
  }

  /* ------------------------------------------------------------
     START GAME
  ------------------------------------------------------------ */
  async function handleStartGame() {
    if (!wallActivated) return;

    window._basketballPopup?.postMessage(
      { type: "start_game", gameId: game.id },
      "*"
    );

    await onRefresh();
  }

  /* ------------------------------------------------------------
     STOP GAME
  ------------------------------------------------------------ */
  async function handleStopClick() {
    await onStop(game.id);
    setWallActivated(false);
    await onRefresh();
  }

  /* ------------------------------------------------------------
     RENDER CARD
  ------------------------------------------------------------ */
  return (
    <div
      className={cn(
        "rounded-xl p-4 text-center shadow-lg bg-cover bg-center flex flex-col justify-between transition-all duration-300",
        game.status === "running"
          ? "ring-4 ring-lime-400 shadow-lime-500/40"
          : game.status === "ended"
          ? "ring-4 ring-gray-400 shadow-gray-400/40"
          : "ring-0"
      )}
      style={{
        backgroundImage: "url('/BBgamebackground.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {/* HEADER */}
      <div>
        <h3 className={cn("font-bold text-lg mb-1")}>
          {game.title || "Untitled Game"}
        </h3>

        <p
          className={cn(
            "text-sm mb-3 flex justify-center items-center gap-2"
          )}
        >
          <strong>Status:</strong> <StatusBadge />
        </p>

        <p className={cn("text-sm text-white/70 mb-1")}>
          ⏳ Duration: {game.duration_seconds}s
        </p>

        <p className={cn("text-sm text-white/70 mb-3")}>
          🎯 Max Players: {game.max_players}
        </p>
      </div>

      {/* CONTROL BUTTONS */}
      <div
        className={cn(
          "flex flex-col gap-3 mt-auto pt-3 border-t border-white/10"
        )}
      >
        {/* Moderate */}
        <button
          onClick={() => onOpenModeration(game.id)}
          className={cn(
            "w-full py-2 rounded text-sm font-semibold bg-yellow-500 hover:bg-yellow-600 text-black"
          )}
        >
          👥 Moderate Players
        </button>

        {/* Launch + Activate */}
        <div className={cn('grid', 'grid-cols-2', 'gap-2')}>
          <button
            onClick={openWallWindow}
            className={cn(
              "w-full py-2 rounded text-sm font-semibold bg-purple-600 hover:bg-purple-700 text-white"
            )}
          >
            🚀 Launch Wall
          </button>

          <button
            onClick={handleActivateWall}
            className={cn(
              "w-full py-2 rounded text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white"
            )}
          >
            🟦 Activate Wall
          </button>
        </div>

        {/* Start + Stop */}
        <div className={cn('grid', 'grid-cols-2', 'gap-2')}>
          <button
            onClick={handleStartGame}
            disabled={!wallActivated}
            className={cn(
              "w-full py-2 rounded text-sm font-semibold",
              wallActivated
                ? "bg-green-600 hover:bg-green-700 text-white"
                : "bg-gray-500 text-gray-300 cursor-not-allowed"
            )}
          >
            ▶ Start Game
          </button>

          <button
            onClick={handleStopClick}
            disabled={game.status !== "running"}
            className={cn(
              "w-full py-2 rounded text-sm font-semibold",
              game.status !== "running"
                ? "bg-gray-500 text-gray-300 cursor-not-allowed"
                : "bg-red-600 hover:bg-red-700 text-white"
            )}
          >
            ⛔ Stop
          </button>
        </div>

        {/* Options + Delete */}
        <div className={cn('grid', 'grid-cols-2', 'gap-2')}>
          <button
            onClick={() => onOpenOptions(game)}
            className={cn(
              "w-full py-2 rounded text-sm font-semibold bg-indigo-500 hover:bg-indigo-600 text-white"
            )}
          >
            ⚙ Options
          </button>

          <button
            onClick={() => onDelete(game.id)}
            className={cn(
              "w-full py-2 rounded text-sm font-semibold bg-red-700 hover:bg-red-800 text-white"
            )}
          >
            ❌ Delete
          </button>
        </div>
      </div>
    </div>
  );
}
