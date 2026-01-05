"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";

import TriviaCard from "./TriviaCard";
import OptionsModalTrivia from "@/components/OptionsModalTrivia";
import TriviaRegenerateModal from "@/components/TriviaRegenerateModal";

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
  const [regenerateTrivia, setRegenerateTrivia] = useState<any | null>(null);

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
     Difficulty label -> API key
  ------------------------------------------------------------ */
  function mapDifficultyLabelToKey(label: string): string {
    switch (label) {
      case "Elementary":
        return "elementary";
      case "Junior High":
        return "jr_high";
      case "High School":
        return "high_school";
      case "College":
        return "college";
      case "PhD":
        return "phd";
      default:
        return "high_school";
    }
  }

  /* ------------------------------------------------------------
     Handle REGENERATE submit from modal
  ------------------------------------------------------------ */
  async function handleRegenerateSubmit(payload: {
    triviaId: string;
    newPublicName: string;
    topicPrompt: string;
    numQuestions: number;
    difficulty: string; // label form from the modal
  }) {
    if (!regenerateTrivia) return;

    try {
      const apiDifficulty = mapDifficultyLabelToKey(payload.difficulty);

      const res = await fetch("/trivia/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          triviaId: payload.triviaId, // 🔁 tells API to regenerate instead of create
          publicName: payload.newPublicName,
          privateName:
            regenerateTrivia.private_name ??
            regenerateTrivia.public_name ??
            payload.newPublicName,
          topicPrompt: payload.topicPrompt,
          numQuestions: payload.numQuestions,
          difficulty: apiDifficulty,
          numRounds: regenerateTrivia.rounds ?? 1,
          sameTopicForAllRounds: true,
          roundTopics: [],
          hostId: host?.id ?? null,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Failed to regenerate trivia");
      }

      // ✅ Success: close modal and refresh games
      setRegenerateTrivia(null);
      await refreshTrivia();
    } catch (err) {
      console.error("❌ Error regenerating trivia:", err);
      alert("Regenerating trivia failed. Check console for details.");
      // ❗ DO NOT close the modal here; TriviaRegenerateModal will
      // reset its isGenerating flag in its own catch.
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
            onLaunch={handleLaunch} // ⬅️ Card will call onLaunch(trivia.id)
            onOpenModeration={onOpenModeration}
            onRegenerateQuestions={handleOpenRegenerate}
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
