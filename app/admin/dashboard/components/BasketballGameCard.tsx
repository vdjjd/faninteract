"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";

declare global {
  interface Window {
    _basketballPopup?: Window | null;
  }
}

export default function BasketballGameCard({
  game,
  onOpenModeration,
  onStart,
  onStop,
  onDelete,
  onOpenOptions,
  onRefresh,
}) {
  const [wallActivated, setWallActivated] = useState(false);

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

  async function handleActivateWall() {
    await supabase
      .from("bb_games")
      .update({
        wall_active: true,
        game_running: false,
        game_timer_start: null,
        status: "ready",
      })
      .eq("id", game.id);

    setWallActivated(true);
    await onRefresh();
  }

  async function handleStartGame() {
    if (!wallActivated) return;

    console.log("▶ Countdown Started");

    // Tell popup to visually enter countdown mode
    window._basketballPopup?.postMessage({ type: "start_countdown" }, "*");

    // Broadcast countdown to all shooters + wall
    const channel = supabase.channel(`basketball-${game.id}`);

    await channel.send({
      type: "broadcast",
      event: "start_countdown",
      payload: { gameId: game.id },
    });

    await onRefresh();
  }

  async function handleStopClick() {
    await onStop(game.id);
    setWallActivated(false);

    await supabase
      .from("bb_games")
      .update({
        wall_active: false,
        game_running: false,
        game_timer_start: null,
      })
      .eq("id", game.id);

    await onRefresh();
  }

  return (
    <div className={cn("rounded-xl p-4 text-center shadow-lg bg-cover bg-center flex flex-col justify-between transition-all duration-300")} style={{ backgroundImage: "url('/BBgamebackground.png')" }}>
      {/* HEADER */}
      <div>
        <h3 className={cn('font-bold', 'text-lg', 'mb-1')}>{game.title || "Untitled Game"}</h3>

        <p className={cn('text-sm', 'mb-3', 'flex', 'justify-center', 'items-center', 'gap-2')}>
          <strong>Status:</strong>
          <span className={cn('font-bold', 'tracking-wide', 'px-2', 'py-1', 'rounded-lg', 'text-xs', 'bg-blue-600', 'text-white')}>
            {game.status.toUpperCase()}
          </span>
        </p>
      </div>

      <div className={cn('flex', 'flex-col', 'gap-3', 'mt-auto', 'pt-3', 'border-t', 'border-white/10')}>
        
        {/* MODERATE */}
        <button
          onClick={() => onOpenModeration(game.id)}
          className={cn('w-full', 'py-2', 'rounded', 'text-sm', 'font-semibold', 'bg-yellow-500', 'hover:bg-yellow-600', 'text-black')}
        >
          👥 Moderate Players
        </button>

        {/* Launch + Activate */}
        <div className={cn('grid', 'grid-cols-2', 'gap-2')}>
          <button
            onClick={openWallWindow}
            className={cn('w-full', 'py-2', 'rounded', 'text-sm', 'font-semibold', 'bg-purple-600', 'hover:bg-purple-700', 'text-white')}
          >
            🚀 Launch Wall
          </button>

          <button
            onClick={handleActivateWall}
            className={cn('w-full', 'py-2', 'rounded', 'text-sm', 'font-semibold', 'bg-blue-600', 'hover:bg-blue-700', 'text-white')}
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
            disabled={!game.game_running}
            className={cn(
              "w-full py-2 rounded text-sm font-semibold",
              game.game_running
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-gray-500 text-gray-300 cursor-not-allowed"
            )}
          >
            ⛔ Stop
          </button>
        </div>

        {/* Options */}
        <button
          onClick={() => onOpenOptions(game)}
          className={cn('w-full', 'py-2', 'mt-2', 'rounded', 'text-sm', 'font-semibold', 'bg-indigo-500', 'hover:bg-indigo-600', 'text-white')}
        >
          ⚙ Game Options
        </button>

        {/* Delete */}
        <button
          onClick={() => onDelete(game.id)}
          className={cn('w-full', 'py-2', 'rounded', 'text-sm', 'font-semibold', 'bg-red-700', 'hover:bg-red-800', 'text-white')}
        >
          ❌ Delete
        </button>
      </div>
    </div>
  );
}
