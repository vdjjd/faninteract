"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";

import TriviaCard from "./TriviaCard";

const supabase = getSupabaseClient();

interface TriviaGridProps {
  trivia: any[];
  host: any;
  refreshTrivia: () => Promise<void>;
  onOpenOptions: (trivia: any) => void;
  // ✅ NEW: moderation handler
  onOpenModeration: (trivia: any) => void;
}

export default function TriviaGrid({
  trivia,
  host,
  refreshTrivia,
  onOpenOptions,
  onOpenModeration,
}: TriviaGridProps) {
  const [localTrivia, setLocalTrivia] = useState<any[]>([]);

  /* ------------------------------------------------------------
     Sync props → local state
  ------------------------------------------------------------ */
  useEffect(() => {
    if (Array.isArray(trivia)) {
      const cleaned = trivia.filter((t) => t && t.id);
      setLocalTrivia(cleaned);
    } else {
      setLocalTrivia([]);
    }
  }, [trivia]);

  /* ------------------------------------------------------------
     Realtime updates (insert/update/delete)
  ------------------------------------------------------------ */
  useEffect(() => {
    if (!host?.id) return;

    const channel = supabase
      .channel(`trivia-cards-${host.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "trivia_cards",
          filter: `host_id=eq.${host.id}`,
        },
        () => refreshTrivia()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [host?.id, refreshTrivia]);

  /* ------------------------------------------------------------
     Delete trivia card
  ------------------------------------------------------------ */
  async function handleDelete(id: string) {
    setLocalTrivia((prev) => prev.filter((t) => t.id !== id));
    await supabase.from("trivia_cards").delete().eq("id", id);
    await refreshTrivia();
  }

  /* ------------------------------------------------------------
     Launch trivia popup window
  ------------------------------------------------------------ */
  function handleLaunch(triviaId: string) {
    const url = `${window.location.origin}/trivia/${triviaId}`;
    const popup = window.open(url, "_blank", "width=1280,height=800");
    popup?.focus();
  }

  /* ------------------------------------------------------------
     Render
  ------------------------------------------------------------ */
  return (
    <div className={cn("mt-10 w-full max-w-6xl")}>
      <h2 className={cn("text-xl font-semibold mb-3")}>🧠 Trivia Games</h2>

      <div className={cn("grid grid-cols-1 md:grid-cols-4 gap-6")}>
        {localTrivia.length === 0 && (
          <p className={cn("text-gray-400 italic")}>
            No Trivia Games created yet.
          </p>
        )}

        {localTrivia.map((triviaItem) => (
          <TriviaCard
            key={triviaItem.id}
            trivia={triviaItem}
            onOpenOptions={onOpenOptions}
            onDelete={handleDelete}
            onLaunch={() => handleLaunch(triviaItem.id)}
            // ✅ Wire moderation down to the card
            onOpenModeration={onOpenModeration}
          />
        ))}
      </div>
    </div>
  );
}
