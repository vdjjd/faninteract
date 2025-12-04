"use client";

import { cn } from "@/lib/utils";

// ⭐ Global type for popup storage
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
  onRefresh: () => Promise<void>;   // ✅ REQUIRED FIX
}

export default function BasketballGameCard({
  game,
  onOpenModeration,
  onStart,
  onStop,
  onDelete,
  onOpenOptions,
  onRefresh,        // ✅ REQUIRED FIX
}: BasketballGameCardProps) {
  if (!game?.id) {
    return (
      <div
        className={cn(
          "rounded-xl p-4 text-center bg-gray-700/20 text-gray-300 border border-white/10"
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
      return <span className={cn(base, "bg-green-600 text-white")}>RUNNING</span>;

    if (game.status === "ended")
      return <span className={cn(base, "bg-gray-600 text-white")}>ENDED</span>;

    return <span className={cn(base, "bg-blue-600 text-white")}>LOBBY</span>;
  }

  /* ------------------------------------------------------------
     LAUNCH INACTIVE WINDOW (QR JOIN PAGE)
  ------------------------------------------------------------ */
  function handleLaunch() {
    const url = `${window.location.origin}/basketball/${game.id}`;

    const popup = window.open(
      url,
      "_blank",
      "width=1280,height=800,resizable=yes,scrollbars=yes"
    );

    if (popup) {
      window._basketballPopup = popup; // ⭐ store popup
      popup.focus();
    } else {
      window.location.href = url; // fallback
    }
  }

  /* ------------------------------------------------------------
     START GAME
  ------------------------------------------------------------ */
  async function handleStartClick() {
    if (game.status === "running") return;

    await onStart(game.id);

    // ⭐ Sync popup
    if (window._basketballPopup && !window._basketballPopup.closed) {
      window._basketballPopup.postMessage(
        { type: "start_game", gameId: game.id },
        "*"
      );
    }

    await onRefresh();   // optional use if needed
  }

  /* ------------------------------------------------------------
     STOP GAME
  ------------------------------------------------------------ */
  async function handleStopClick() {
    if (game.status !== "running") return;
    await onStop(game.id);
    await onRefresh();   // optional use if needed
  }

  /* ------------------------------------------------------------
     CARD UI
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
        background: "linear-gradient(to bottom right, #0b0f19, #111827)",
      }}
    >
      {/* Title */}
      <div>
        <h3 className={cn("font-bold text-lg mb-1")}>
          {game.title || "Untitled Game"}
        </h3>

        <p className={cn("text-sm mb-3 flex justify-center items-center gap-2")}>
          <strong>Status:</strong> <StatusBadge />
        </p>

        <p className={cn("text-sm text-white/70 mb-1")}>
          ⏳ Duration: {game.duration_seconds}s
        </p>

        <p className={cn("text-sm text-white/70 mb-3")}>
          🎯 Max Players: {game.max_players}
        </p>
      </div>

      {/* Controls */}
      <div
        className={cn(
          "flex flex-wrap justify-center gap-2 mt-auto pt-2 border-t border-white/10"
        )}
      >
        {/* Launch */}
        <button
          onClick={handleLaunch}
          className={cn(
            "px-3 py-1 rounded text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white"
          )}
        >
          🚀 Launch
        </button>

        {/* Moderate */}
        <button
          onClick={() => onOpenModeration(game.id)}
          className={cn(
            "px-3 py-1 rounded text-sm font-semibold bg-yellow-500 hover:bg-yellow-600 text-black"
          )}
        >
          👥 Moderate Players
        </button>

        {/* Start */}
        <button
          onClick={handleStartClick}
          disabled={game.status === "running"}
          className={cn(
            "px-3 py-1 rounded text-sm font-semibold",
            game.status === "running"
              ? "bg-gray-500 text-gray-300 cursor-not-allowed"
              : "bg-green-600 hover:bg-green-700 text-white"
          )}
        >
          ▶ Start
        </button>

        {/* Stop */}
        <button
          onClick={handleStopClick}
          disabled={game.status !== "running"}
          className={cn(
            "px-3 py-1 rounded text-sm font-semibold",
            game.status !== "running"
              ? "bg-gray-500 text-gray-300 cursor-not-allowed"
              : "bg-red-600 hover:bg-red-700 text-white"
          )}
        >
          ⏹ Stop
        </button>

        {/* Options */}
        <button
          onClick={() => onOpenOptions(game)}
          className={cn(
            "px-3 py-1 rounded text-sm font-semibold bg-indigo-500 hover:bg-indigo-600 text-white"
          )}
        >
          ⚙ Options
        </button>

        {/* Delete */}
        <button
          onClick={() => onDelete(game.id)}
          className={cn(
            "px-3 py-1 rounded text-sm font-semibold bg-red-700 hover:bg-red-800 text-white"
          )}
        >
          ❌ Delete
        </button>
      </div>
    </div>
  );
}
