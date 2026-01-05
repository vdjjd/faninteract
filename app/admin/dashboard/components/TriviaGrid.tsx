"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";

import TriviaCard from "./TriviaCard";
import OptionsModalTrivia from "@/components/OptionsModalTrivia";
import TriviaRegenerateModal from "@/components/TriviaRegenerateModal"; // ⬅️ NEW

const supabase = getSupabaseClient();

interface TriviaGridProps {
  trivia: any[];
  host: any;
  refreshTrivia: () => Promise<void>;
  onOpenOptions: (trivia: any) => void;
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
  const [optionsTrivia, setOptionsTrivia] = useState<any | null>(null);
  const [regenerateTrivia, setRegenerateTrivia] = useState<any | null>(null); // ⬅️ NEW

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
     Launch trivia popup window (HOST WALL ROUTER)
  ------------------------------------------------------------ */
  function handleLaunch(triviaId: string) {
    const url = `${window.location.origin}/trivia/${triviaId}`;
    const popup = window.open(url, "_blank", "width=1280,height=800");
    popup?.focus();
  }

  /* ------------------------------------------------------------
     Open Options modal (local) + still call parent handler
  ------------------------------------------------------------ */
  function handleOpenOptionsLocal(triviaItem: any) {
    setOptionsTrivia(triviaItem);
    onOpenOptions?.(triviaItem);
  }

  /* ------------------------------------------------------------
     Open REGENERATE modal (local)
  ------------------------------------------------------------ */
  function handleOpenRegenerate(triviaItem: any) {
    setRegenerateTrivia(triviaItem);
  }

  /* ------------------------------------------------------------
     Handle REGENERATE submit from modal
  ------------------------------------------------------------ */
  async function handleRegenerateSubmit(payload: {
    triviaId: string;
    newPublicName: string;
    topicPrompt: string;
    numQuestions: number;
    difficulty: string;
  }) {
    try {
      // 🔁 Call your API / Edge function that asks AI for new questions
      // Adjust this endpoint to match however you did initial creation.
      await fetch("/api/trivia/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          hostId: host?.id ?? null,
        }),
      });

      setRegenerateTrivia(null);
      await refreshTrivia();
    } catch (err) {
      console.error("❌ Error regenerating trivia:", err);
      // you could keep the modal open on error if you want
    }
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
            onOpenOptions={handleOpenOptionsLocal}
            onDelete={handleDelete}
            onLaunch={() => handleLaunch(triviaItem.id)}
            onOpenModeration={onOpenModeration}
            onRegenerateQuestions={handleOpenRegenerate} // ⬅️ WIRE BUTTON
          />
        ))}
      </div>

      {/* ✅ OPTIONS MODAL (APPEARANCE / BACKGROUND / COLORS) */}
      {optionsTrivia && host?.id && (
        <OptionsModalTrivia
          trivia={optionsTrivia}
          hostId={host.id}
          onClose={() => setOptionsTrivia(null)}
          refreshTrivia={refreshTrivia}
        />
      )}

      {/* ✅ REGENERATE MODAL (NEW QUESTIONS / TOPIC) */}
      {regenerateTrivia && (
        <TriviaRegenerateModal
          isOpen={!!regenerateTrivia}
          trivia={regenerateTrivia}
          onClose={() => setRegenerateTrivia(null)}
          onRegenerate={handleRegenerateSubmit}
        />
      )}
    </div>
  );
}
