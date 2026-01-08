"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface TriviaCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  hostId: string;
  refreshTrivia: () => Promise<void>;
  onGenerateTrivia: (payload: any) => void | Promise<void>;
}

export default function TriviaCreationModal({
  isOpen,
  onClose,
  hostId,
  refreshTrivia,
  onGenerateTrivia,
}: TriviaCreationModalProps) {
  const [publicName, setPublicName] = useState("");
  const [privateName, setPrivateName] = useState("");

  const [numQuestions, setNumQuestions] = useState(10);
  const [difficulty, setDifficulty] = useState("High School");

  // ✅ moved up in UI
  const [numRounds, setNumRounds] = useState(1);

  // ✅ per-round topics replace old topicPrompt
  const [roundTopics, setRoundTopics] = useState<string[]>([""]);

  // ✅ generating state so we can block re-clicks and show overlay
  const [isGenerating, setIsGenerating] = useState(false);

  // Keep roundTopics length in sync with numRounds
  const ensureRoundTopicsLength = (roundCount: number) => {
    setRoundTopics((prev) => {
      const next = [...prev];

      // grow
      while (next.length < roundCount) next.push("");

      // shrink
      if (next.length > roundCount) next.length = roundCount;

      // ensure at least 1
      if (next.length === 0) next.push("");

      return next;
    });
  };

  const handleRoundCountChange = (value: number) => {
    setNumRounds(value);
    ensureRoundTopicsLength(value);
  };

  const handleRoundTopicChange = (roundIndex: number, value: string) => {
    setRoundTopics((prev) => {
      const next = [...prev];
      next[roundIndex] = value;
      return next;
    });
  };

  // ✅ REQUIRED FIELD VALIDATION
  const allRoundTopicsFilled =
    roundTopics.length === numRounds &&
    roundTopics.every((t) => t.trim().length > 0);

  const isValid =
    publicName.trim().length > 0 &&
    privateName.trim().length > 0 &&
    numRounds >= 1 &&
    allRoundTopicsFilled;

  const handleGenerate = async () => {
    if (!isValid || isGenerating) return;

    setIsGenerating(true);

    try {
      const trimmedRoundTopics = roundTopics.map((t) => t.trim());

      await onGenerateTrivia({
        publicName: publicName.trim(),
        privateName: privateName.trim(),

        // ✅ backend still expects topicPrompt; use Round 1 topic
        topicPrompt: trimmedRoundTopics[0] || "",

        numQuestions,
        difficulty,
        numRounds,

        // ✅ per-round topics
        sameTopicForAllRounds: false,
        roundTopics: trimmedRoundTopics,

        hostId,
      });

      // Optional safety if parent ever stops closing automatically:
      // await refreshTrivia();
      // onClose();
    } catch (err) {
      console.error("❌ Error generating trivia:", err);
    } finally {
      // ✅ IMPORTANT: never get stuck in "AI is thinking…" overlay
      setIsGenerating(false);
    }
  };

  // ✅ reset state whenever modal is opened fresh
  useEffect(() => {
    if (!isOpen) return;

    setIsGenerating(false);

    // Optional: reset form on open (comment out if you prefer persisting draft)
    setPublicName("");
    setPrivateName("");
    setNumQuestions(10);
    setDifficulty("High School");
    setNumRounds(1);
    setRoundTopics([""]);
  }, [isOpen]);

  // Keep topics length consistent if numRounds changes externally for any reason
  useEffect(() => {
    ensureRoundTopicsLength(numRounds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numRounds]);

  if (!isOpen) return null;

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
          <h2 className={cn("text-2xl", "font-bold")}>🧠 Create Trivia Game</h2>
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
            <label className="font-semibold">Public Trivia Name *</label>
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
            <label className="font-semibold">Private Trivia Name *</label>
            <input
              value={privateName}
              onChange={(e) => setPrivateName(e.target.value)}
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

          {/* ✅ MOVED HERE: Number of Rounds (directly under Private Name) */}
          <div>
            <label className="font-semibold">Number of Rounds</label>
            <select
              value={numRounds}
              onChange={(e) => handleRoundCountChange(Number(e.target.value))}
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
              {Array.from({ length: 10 }, (_, i) => i + 1).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <p className={cn("text-xs", "opacity-70", "mt-1")}>
              You’ll set a main topic for each round below.
            </p>
          </div>

          {/* ✅ Per-round topic fields */}
          <div className={cn("space-y-3")}>
            {Array.from({ length: numRounds }, (_, i) => {
              const label = `Main topic trivia round ${i + 1}`;
              return (
                <div key={i}>
                  <label className="font-semibold">{label} *</label>
                  <input
                    value={roundTopics[i] ?? ""}
                    onChange={(e) => handleRoundTopicChange(i, e.target.value)}
                    disabled={isGenerating}
                    placeholder="e.g., 90's Country Music, NFL History, Space Facts..."
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
              );
            })}
          </div>

          {!allRoundTopicsFilled && (
            <p className={cn("text-xs", "text-red-600")}>
              Please fill in a topic for every round.
            </p>
          )}

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
            onClick={handleGenerate}
            disabled={!isValid || isGenerating}
            className={cn(
              "w-full py-3 font-semibold rounded-lg transition-all",
              isValid && !isGenerating
                ? "bg-blue-600 hover:bg-blue-700 text-white"
                : "bg-gray-400 text-white opacity-60 cursor-not-allowed"
            )}
          >
            {isGenerating ? "🤖 AI is thinking…" : "🚀 Generate Trivia"}
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
                "border-blue-500",
                "border-t-transparent",
                "animate-spin",
                "mb-3"
              )}
            />
            <p className={cn("text-white", "font-semibold")}>
              AI is generating your trivia…
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
              This may take a few seconds. Please don&apos;t click Generate again
              or close this window.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
