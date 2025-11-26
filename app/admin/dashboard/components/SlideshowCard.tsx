'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { getSupabaseClient } from '@/lib/supabaseClient';

const supabase = getSupabaseClient();

export default function SlideshowCard({
  show,
  host,
  refreshSlideshows,
  onOpenOptions
}) {
  const [isRenaming, setRenaming] = useState(false);
  const [name, setName] = useState(show.name ?? "");

  /* -----------------------------------------------------------
     UPDATE NAME
  ----------------------------------------------------------- */
  async function updateName() {
    const trimmed = name.trim();
    if (!trimmed) return;

    await supabase
      .from("slide_shows")
      .update({ name: trimmed })
      .eq("id", show.id);

    setRenaming(false);
    refreshSlideshows();
  }

  /* -----------------------------------------------------------
     PLAY / STOP (Option A logic)
  ----------------------------------------------------------- */
  async function play() {
    await supabase
      .from("slide_shows")
      .update({ is_playing: true })
      .eq("id", show.id);

    refreshSlideshows();
  }

  async function stop() {
    await supabase
      .from("slide_shows")
      .update({ is_playing: false })
      .eq("id", show.id);

    refreshSlideshows();
  }

  /* -----------------------------------------------------------
     DELETE
  ----------------------------------------------------------- */
  async function remove() {
    if (!confirm(`Delete slideshow "${show.name}"? This cannot be undone.`))
      return;

    const { error } = await supabase
      .from("slide_shows")
      .delete()
      .eq("id", show.id);

    if (error) {
      console.error("❌ Error deleting slideshow:", error);
      alert("Failed to delete slideshow.");
      return;
    }

    refreshSlideshows();
  }

  /* -----------------------------------------------------------
     LAUNCH POPUP (does NOT mark as playing — Option A)
  ----------------------------------------------------------- */
  function launchPopup() {
    const url = `/slideshow/${show.id}`;

    window.open(
      url,
      "_blank",
      "width=900,height=550,resizable=yes,scrollbars=yes,toolbar=no,menubar=no,location=no,status=no"
    );
  }

  /* -----------------------------------------------------------
     STATUS BADGE
  ----------------------------------------------------------- */
  const status = show.is_playing ? "PLAYING" : "INACTIVE";
  const statusColor = show.is_playing ? "text-lime-400" : "text-orange-400";

  /* -----------------------------------------------------------
     RENDER
  ----------------------------------------------------------- */
  return (
    <div
      className={cn(
        "rounded-xl p-4 text-center shadow-lg bg-cover bg-center",
        "flex flex-col justify-between transition-all duration-300",
        show.is_playing
          ? "ring-4 ring-lime-400 shadow-lime-500/50"
          : "ring-0"
      )}
      style={{
        backgroundImage: `linear-gradient(135deg, #0d1b2a, #1b263b)`
      }}
    >
      {/* TITLE + STATUS */}
      <div>
        {isRenaming ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={updateName}
            onKeyDown={(e) => e.key === "Enter" && updateName()}
            className={cn(
              "bg-black/40 border border-gray-600 rounded",
              "px-2 py-1 text-white w-full"
            )}
            autoFocus
          />
        ) : (
          <h3
            className={cn(
              "font-bold text-lg mb-1 cursor-pointer"
            )}
            onClick={() => setRenaming(true)}
          >
            {show.name}
          </h3>
        )}

        <p className={cn('text-sm', 'mb-2')}>
          <strong>Status:</strong>{" "}
          <span className={cn(statusColor)}>{status}</span>
        </p>
      </div>

      {/* DIVIDER */}
      <div className={cn("border-t border-white/10 mt-2 mb-2")} />

      {/* CONTROLS */}
      <div className={cn("flex flex-wrap justify-center gap-2 mt-auto pt-2")}>

        {/* LAUNCH */}
        <button
          onClick={launchPopup}
          className={cn(
            "bg-blue-600 hover:bg-blue-700",
            "px-2 py-1 rounded text-sm font-semibold text-white"
          )}
        >
          🚀 Launch
        </button>

        {/* PLAY */}
        <button
          onClick={play}
          className={cn(
            "bg-green-600 hover:bg-green-700",
            "px-2 py-1 rounded text-sm font-semibold text-white"
          )}
        >
          ▶️ Play
        </button>

        {/* STOP */}
        <button
          onClick={stop}
          className={cn(
            "bg-red-600 hover:bg-red-700",
            "px-2 py-1 rounded text-sm font-semibold text-white"
          )}
        >
          ⏹ Stop
        </button>

        {/* OPTIONS */}
        <button
          onClick={() => onOpenOptions(show)}
          className={cn(
            "bg-indigo-500 hover:bg-indigo-600",
            "px-2 py-1 rounded text-sm font-semibold text-white"
          )}
        >
          ⚙ Options
        </button>

        {/* DELETE */}
        <button
          onClick={remove}
          className={cn(
            "bg-red-700 hover:bg-red-800",
            "px-2 py-1 rounded text-sm font-semibold text-white"
          )}
        >
          ❌ Delete
        </button>

      </div>
    </div>
  );
}
