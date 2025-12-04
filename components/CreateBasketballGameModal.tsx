"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { cn } from "@/lib/utils";
import { createBasketballGame } from "@/lib/actions/basketball";

interface CreateBasketballGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  hostId: string;
  refreshBasketballGames: () => Promise<void>;
}

export default function CreateBasketballGameModal({
  isOpen,
  onClose,
  hostId,
  refreshBasketballGames,
}: CreateBasketballGameModalProps) {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleCreate() {
    if (!title.trim()) {
      setErrorMsg("Please enter a game name.");
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    try {
      const created = await createBasketballGame(hostId, { title });

      if (!created) {
        setErrorMsg("Failed to create basketball game.");
        setSaving(false);
        return;
      }

      console.log("🏀 Basketball game created:", created);

      await refreshBasketballGames();
      setTitle("");
      onClose();
    } catch (err) {
      console.error("❌ Basketball create error:", err);
      setErrorMsg("Something went wrong creating the game.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <h2 className={cn("text-xl", "font-bold", "text-center", "mb-4")}>
        🏀 New Basketball Game
      </h2>

      <input
        type="text"
        placeholder="Game Name…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className={cn(
          "w-full",
          "px-3",
          "py-2",
          "rounded-lg",
          "text-black",
          "text-sm",
          "mb-2"
        )}
      />

      {errorMsg && (
        <p className={cn("text-red-400", "text-sm", "mb-2", "text-center")}>
          {errorMsg}
        </p>
      )}

      <div className={cn("flex", "justify-center", "gap-3", "mt-3")}>
        <button
          onClick={handleCreate}
          disabled={saving}
          className={cn(
            "bg-green-600",
            "hover:bg-green-700",
            "px-4",
            "py-2",
            "rounded-lg",
            "font-semibold"
          )}
        >
          {saving ? "Creating…" : "✅ Create"}
        </button>

        <button
          onClick={onClose}
          className={cn(
            "bg-red-600",
            "hover:bg-red-700",
            "px-4",
            "py-2",
            "rounded-lg",
            "font-semibold"
          )}
        >
          ✖ Cancel
        </button>
      </div>
    </Modal>
  );
}
