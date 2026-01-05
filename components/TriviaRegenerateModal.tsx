// app/admin/dashboard/components/TriviaRegenerateModal.tsx
"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface TriviaRegenerateModalProps {
  isOpen: boolean;
  onClose: () => void;
  trivia: any | null;
  onRegenerate: (payload: {
    triviaId: string;
    newPublicName: string;
    topicPrompt: string;
    numQuestions: number;
    difficulty: string;
  }) => Promise<void> | void;
}

export default function TriviaRegenerateModal({
  isOpen,
  onClose,
  trivia,
  onRegenerate,
}: TriviaRegenerateModalProps) {
  const [publicName, setPublicName] = useState("");
  const [topicPrompt, setTopicPrompt] = useState("");
  const [numQuestions, setNumQuestions] = useState(10);
  const [difficulty, setDifficulty] = useState("High School");
  const [isGenerating, setIsGenerating] = useState(false);

  // ✅ Prefill & reset state every time the modal opens on a trivia card
  useEffect(() => {
    if (isOpen && trivia) {
      setPublicName(trivia.public_name || "");
      setTopicPrompt(trivia.topic_prompt || "");
      setNumQuestions(trivia.num_questions || 10);
      setDifficulty(trivia.difficulty || "High School");
      setIsGenerating(false); // reset the spinner like the Create modal
    }
  }, [isOpen, trivia]);

  if (!isOpen || !trivia) return null;

  const isValid =
    publicName.trim().length > 0 && topicPrompt.trim().length > 0;

  const handleRegenerateClick = async () => {
    if (!isValid || isGenerating) return;

    setIsGenerating(true);

    try {
      await onRegenerate({
        triviaId: trivia.id,
        newPublicName: publicName.trim(),
        topicPrompt: topicPrompt.trim(),
        numQuestions,
        difficulty,
      });
      // ⚠️ DO NOT setIsGenerating(false) here on success.
      // Parent will close the modal; spinner just unmounts like Create modal.
    } catch (err) {
      console.error("❌ Error regenerating trivia:", err);
      setIsGenerating(false); // allow retry if it fails
    }
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-[9999]",
        "flex items-center justify-center",
        "bg-black/60"
      )}
    >
      <div
        className={cn(
          "bg-white dark:bg-neutral-900",
          "w-full max-w-xl",
          "rounded-xl shadow-2xl",
          "flex flex-col",
          "max-h-[90vh]",
          "relative"
        )}
      >
        {/* HEADER */}
        <div
          className={cn(
            "flex justify-between items-center",
            "p-6 border-b border-black/10 dark:border-white/10"
          )}
        >
          <h2 className={cn("text-2xl", "font-bold")}>
            🔁 New Questions / Topic
          </h2>
          <button
            onClick={onClose}
            className={cn(
              "text-gray-500",
              "hover:text-gray-800",
              "dark:hover:text-white"
            )}
            disabled={isGenerating}
          >
            ✖
          </button>
        </div>

        {/* BODY */}
        <div className={cn("p-6", "space-y-6", "overflow-y-auto")}>
          <div>
            <label className="font-semibold">New Public Trivia Name *</label>
            <input
              value={publicName}
              onChange={(e) => setPublicName(e.target.value)}
              disabled={isGenerating}
              className={cn(
                "w-full",
                "p-2",
                "mt-1",
                "border",
                "rounded-md",
                "bg-white",
                "dark:bg-neutral-800",
                isGenerating && "opacity-60 cursor-not-allowed"
              )}
            />
          </div>

          <div>
            <label className="font-semibold">
              New Topic Prompt (what should this game be about?) *
            </label>
            <textarea
              value={topicPrompt}
              onChange={(e) => setTopicPrompt(e.target.value)}
              rows={3}
              disabled={isGenerating}
              className={cn(
                "w-full",
                "p-2",
                "mt-1",
                "border",
                "rounded-md",
                "bg-white",
                "dark:bg-neutral-800",
                isGenerating && "opacity-60 cursor-not-allowed"
              )}
            />
          </div>

          <div>
            <label className="font-semibold">Number of Questions</label>
            <select
              value={numQuestions}
              onChange={(e) => setNumQuestions(Number(e.target.value))}
              disabled={isGenerating}
              className={cn(
                "w-full",
                "p-2",
                "mt-1",
                "border",
                "rounded-md",
                "bg-white",
                "dark:bg-neutral-800",
                isGenerating && "opacity-60 cursor-not-allowed"
              )}
            >
              {[5, 10, 15, 20, 25].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-semibold">Difficulty Level</label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              disabled={isGenerating}
              className={cn(
                "w-full",
                "p-2",
                "mt-1",
                "border",
                "rounded-md",
                "bg-white",
                "dark:bg-neutral-800",
                isGenerating && "opacity-60 cursor-not-allowed"
              )}
            >
              {["Elementary", "Junior High", "High School", "College", "PhD"].map(
                (d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                )
              )}
            </select>
          </div>

          <button
            onClick={handleRegenerateClick}
            disabled={!isValid || isGenerating}
            className={cn(
              "w-full py-3 font-semibold rounded-lg transition-all",
              isValid && !isGenerating
                ? "bg-orange-500 hover:bg-orange-600 text-black"
                : "bg-gray-400 text-white opacity-60 cursor-not-allowed"
            )}
          >
            {isGenerating ? "🤖 AI is thinking…" : "🧠 Generate New Questions"}
          </button>
        </div>

        {/* ✅ Blocking overlay while AI is generating */}
        {isGenerating && (
          <div
            className={cn(
              "absolute inset-0 rounded-xl",
              "bg-black/40",
              "flex flex-col items-center justify-center",
              "backdrop-blur-sm"
            )}
          >
            <div
              className={cn(
                "h-10",
                "w-10",
                "rounded-full",
                "border-4",
                "border-orange-500",
                "border-t-transparent",
                "animate-spin",
                "mb-3"
              )}
            />
            <p className={cn("text-white", "font-semibold")}>
              AI is creating new questions…
            </p>
            <p
              className={cn(
                "text-white/80",
                "text-xs",
                "mt-1",
                "px-4",
                "text-center"
              )}
            >
              This may take a few seconds. Please don&apos;t click again or
              close this window.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
