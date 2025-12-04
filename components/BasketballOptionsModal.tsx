"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";

interface BasketballOptionsModalProps {
  game: any;
  isOpen: boolean;
  onClose: () => void;
  refreshBasketballGames: () => Promise<void>;
}

export default function BasketballOptionsModal({
  game,
  isOpen,
  onClose,
  refreshBasketballGames,
}: BasketballOptionsModalProps) {
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(90); // default 90 sec
  const [maxPlayers, setMaxPlayers] = useState(10);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  /* ------------------------------------------------------------
     LOAD GAME DATA INTO FORM
  ------------------------------------------------------------ */
  useEffect(() => {
    if (game) {
      setTitle(game.title ?? "");
      setDuration(game.duration_seconds ?? 90);
      setMaxPlayers(game.max_players ?? 10);
    }
  }, [game]);

  if (!game) return null;

  /* ------------------------------------------------------------
     SAVE CHANGES
  ------------------------------------------------------------ */
  async function handleSave() {
    setSaving(true);
    setErrorMsg(null);

    try {
      const { error } = await supabase
        .from("bb_games")
        .update({
          title,
          duration_seconds: duration,
          max_players: maxPlayers,
        })
        .eq("id", game.id);

      if (error) {
        console.error("❌ Error updating basketball game", error);
        setErrorMsg("Failed to save changes.");
        setSaving(false);
        return;
      }

      await refreshBasketballGames();
      onClose();
    } catch (err) {
      console.error("❌ Unexpected Error", err);
      setErrorMsg("Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  /* ------------------------------------------------------------
     DELETE CONFIRMATION
  ------------------------------------------------------------ */
  async function handleDelete() {
    const yes = confirm("Delete this basketball game?");
    if (!yes) return;

    await supabase.from("bb_games").delete().eq("id", game.id);
    await refreshBasketballGames();
    onClose();
  }

  /* ------------------------------------------------------------
     RENDER
  ------------------------------------------------------------ */
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      {/* TITLE */}
      <h2 className={cn("text-xl", "font-bold", "text-center", "mb-4")}>
        ⚙️ Basketball Game Settings
      </h2>

      {/* GAME TITLE */}
      <label className={cn('block', 'text-sm', 'font-semibold', 'mb-1', 'text-white')}>
        Game Title
      </label>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className={cn(
          "w-full px-3 py-2 mb-4 rounded-lg text-black text-sm"
        )}
      />

      {/* DURATION */}
      <label className={cn('block', 'text-sm', 'font-semibold', 'mb-1', 'text-white')}>
        Game Duration (seconds)
      </label>
      <input
        type="number"
        value={duration}
        min={20}
        max={180}
        onChange={(e) => setDuration(parseInt(e.target.value))}
        className={cn(
          "w-full px-3 py-2 mb-4 rounded-lg text-black text-sm"
        )}
      />

      {/* MAX PLAYERS */}
      <label className={cn('block', 'text-sm', 'font-semibold', 'mb-1', 'text-white')}>
        Max Players
      </label>
      <input
        type="number"
        value={maxPlayers}
        min={2}
        max={10}
        onChange={(e) => setMaxPlayers(parseInt(e.target.value))}
        className={cn(
          "w-full px-3 py-2 mb-4 rounded-lg text-black text-sm"
        )}
      />

      {/* ERROR */}
      {errorMsg && (
        <p className={cn('text-red-400', 'text-sm', 'mb-3', 'text-center')}>{errorMsg}</p>
      )}

      {/* BUTTONS */}
      <div className={cn("flex justify-center gap-3 mt-4")}>
        <button
          onClick={handleSave}
          disabled={saving}
          className={cn(
            "bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg font-semibold text-white"
          )}
        >
          {saving ? "Saving…" : "💾 Save"}
        </button>

        <button
          onClick={onClose}
          className={cn(
            "bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-lg font-semibold text-white"
          )}
        >
          ✖ Cancel
        </button>

        <button
          onClick={handleDelete}
          className={cn(
            "bg-red-700 hover:bg-red-800 px-4 py-2 rounded-lg font-semibold text-white"
          )}
        >
          🗑 Delete
        </button>
      </div>
    </Modal>
  );
}
