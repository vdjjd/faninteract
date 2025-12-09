"use client";

import { useState, useEffect } from "react";
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

  /* ------------------------------------------------------------
     RESTORE wallActivated from DB (fixes StartGame disabled bug)
  ------------------------------------------------------------ */
  useEffect(() => {
    if (game?.wall_active) setWallActivated(true);
  }, [game?.wall_active]);

  /* ------------------------------------------------------------
     LAUNCH WALL POPUP
  ------------------------------------------------------------ */
  function openWallWindow() {
    if (!game || !game.id) {
      alert("Game ID not ready yet.");
      return;
    }

    const url = `${window.location.origin}/basketball/${game.id}`;
    let popup = window._basketballPopup;

    if (!popup || popup.closed) {
      popup = window.open(
        url,
        "basketball_wall",
        "width=1280,height=800,resizable=yes,scrollbars=yes"
      );

      if (!popup) {
        alert("Popup blocked! Enable popups.");
        return;
      }

      window._basketballPopup = popup;
    }

    popup.focus();
    return popup;
  }

  /* ------------------------------------------------------------
     ACTIVATE WALL (DB update only)
  ------------------------------------------------------------ */
  async function handleActivateWall() {
    if (!game?.id) return;

    await supabase
      .from("bb_games")
      .update({
        wall_active: true,
        game_running: false,
        game_timer_start: null,
        status: "running",
      })
      .eq("id", game.id);

    setWallActivated(true);

    // Tell popup to refresh
    window._basketballPopup?.postMessage({ type: "refresh_wall" }, "*");

    await onRefresh();
  }

  /* ------------------------------------------------------------
     START GAME → SEND COUNTDOWN
     FIX: Use one universal channel that does NOT require subscribe()
  ------------------------------------------------------------ */
  async function handleStartGame() {
    if (!wallActivated) return;
    if (!game?.id) return;

    console.log("▶ Sending COUNTDOWN to wall + shooters...");

    // Tell wall popup
    window._basketballPopup?.postMessage({ type: "start_countdown" }, "*");

    // Tell all clients (wall + shooters)
    await supabase.channel("broadcast").send({
      type: "broadcast",
      event: "start_countdown",
      payload: { gameId: game.id },
    });

    await onRefresh();
  }

  /* ------------------------------------------------------------
     STOP GAME
  ------------------------------------------------------------ */
  async function handleStopClick() {
    if (!game?.id) return;

    await onStop(game.id);

    await supabase
      .from("bb_games")
      .update({
        game_running: false,
        game_timer_start: null,
      })
      .eq("id", game.id);

    await onRefresh();
  }

  /* ------------------------------------------------------------
     RESET GAME
  ------------------------------------------------------------ */
  async function handleResetGame() {
    if (!game?.id) return;

    await supabase.rpc("reset_player_scores", { p_game_id: game.id });

    await supabase
      .from("bb_games")
      .update({
        wall_active: false,
        game_running: false,
        game_timer_start: null,
        status: "lobby",
      })
      .eq("id", game.id);

    setWallActivated(false);

    window._basketballPopup?.postMessage({ type: "refresh_wall" }, "*");

    await onRefresh();
  }

  /* ------------------------------------------------------------
     UI
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
      style={{ backgroundImage: "url('/BBgamebackground.png')" }}
    >
      <div>
        <h3 className={cn('font-bold', 'text-lg', 'mb-1')}>
          {game.title || "Untitled Game"}
        </h3>

        <p className={cn('text-sm', 'mb-3', 'flex', 'justify-center', 'items-center', 'gap-2')}>
          <strong>Status:</strong>
          <span
            className={cn(
              "font-bold tracking-wide px-2 py-1 rounded-lg text-xs",
              game.status === "running"
                ? "bg-green-600 text-white"
                : game.status === "ended"
                ? "bg-gray-600 text-white"
                : "bg-blue-600 text-white"
            )}
          >
            {game.status.toUpperCase()}
          </span>
        </p>
      </div>

      <div className={cn('flex', 'flex-col', 'gap-3', 'mt-auto', 'pt-3', 'border-t', 'border-white/10')}>
        <button
          onClick={() => onOpenModeration(game.id)}
          className={cn('w-full', 'py-2', 'rounded', 'text-sm', 'font-semibold', 'bg-yellow-500', 'hover:bg-yellow-600', 'text-black')}
        >
          👥 Moderate Players
        </button>

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
            className={cn('w-full', 'py-2', 'rounded', 'text-sm', 'font-semibold', 'bg-red-600', 'hover:bg-red-700', 'text-white')}
          >
            ⛔ Stop
          </button>
        </div>

        <button
          onClick={handleResetGame}
          className={cn('w-full', 'py-2', 'rounded', 'text-sm', 'font-semibold', 'bg-orange-500', 'hover:bg-orange-600', 'text-white')}
        >
          🔄 Reset Game
        </button>

        <button
          onClick={() => onOpenOptions(game)}
          className={cn('w-full', 'py-2', 'mt-2', 'rounded', 'text-sm', 'font-semibold', 'bg-indigo-500', 'hover:bg-indigo-600', 'text-white')}
        >
          ⚙ Game Options
        </button>

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
