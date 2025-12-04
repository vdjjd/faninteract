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
  const [duration, setDuration] = useState(90);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  /* ------------------------------------------------------------
     Load game settings into form on modal open
  ------------------------------------------------------------ */
  useEffect(() => {
    if (!game) return;

    setTitle(game.title ?? "");
    setDuration(game.duration_seconds ?? 90);
  }, [game]);

  if (!game) return null;

  /* ------------------------------------------------------------
     Save settings
  ------------------------------------------------------------ */
  async function handleSave() {
    setSaving(true);
    setErrorMsg(null);

    try {
      const { error } = await supabase
        .from("bb_games")
        .update({
          title: title.trim(),
          duration_seconds: duration,
        })
        .eq("id", game.id);

      if (error) {
        console.error("❌ Failed to update game:", error);
        setErrorMsg("Could not save changes.");
        setSaving(false);
        return;
      }

      await refreshBasketballGames();
      onClose();
    } catch (err) {
      console.error("❌ Error saving game settings:", err);
      setErrorMsg("Unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  }

  /* ------------------------------------------------------------
     Delete game
  ------------------------------------------------------------ */
  async function handleDelete() {
    const yes = confirm("Are you sure you want to delete this basketball game?");
    if (!yes) return;

    await supabase.from("bb_games").delete().eq("id", game.id);
    await refreshBasketballGames();
    onClose();
  }

  /* ------------------------------------------------------------
     UI
  ------------------------------------------------------------ */
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <h2 className={cn("text-xl font-bold text-center mb-4")}>
        ⚙️ Basketball Game Settings
      </h2>

      {/* TITLE */}
      <label className={cn('block', 'text-sm', 'font-semibold', 'mb-1', 'text-white')}>
        Game Title
      </label>
      <input
        type="text"
        className={cn('w-full', 'px-3', 'py-2', 'mb-4', 'rounded-lg', 'text-black', 'text-sm')}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      {/* DURATION */}
      <label className={cn('block', 'text-sm', 'font-semibold', 'mb-1', 'text-white')}>
        Game Duration (seconds)
      </label>
      <input
        type="number"
        min={20}
        max={180}
        className={cn('w-full', 'px-3', 'py-2', 'mb-4', 'rounded-lg', 'text-black', 'text-sm')}
        value={duration}
        onChange={(e) => setDuration(parseInt(e.target.value))}
      />

      {/* ERROR */}
      {errorMsg && (
        <p className={cn('text-red-400', 'text-sm', 'mb-3', 'text-center')}>{errorMsg}</p>
      )}

      {/* BUTTONS */}
      <div className={cn('flex', 'justify-center', 'gap-3', 'mt-4')}>
        <button
          onClick={handleSave}
          disabled={saving}
          className={cn('bg-green-600', 'hover:bg-green-700', 'px-4', 'py-2', 'rounded-lg', 'font-semibold', 'text-white')}
        >
          {saving ? "Saving…" : "💾 Save"}
        </button>

        <button
          onClick={onClose}
          className={cn('bg-gray-600', 'hover:bg-gray-700', 'px-4', 'py-2', 'rounded-lg', 'font-semibold', 'text-white')}
        >
          ✖ Cancel
        </button>

        <button
          onClick={handleDelete}
          className={cn('bg-red-700', 'hover:bg-red-800', 'px-4', 'py-2', 'rounded-lg', 'font-semibold', 'text-white')}
        >
          🗑 Delete
        </button>
      </div>
    </Modal>
  );
}
