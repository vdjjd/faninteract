// lib/trivia/wall/useProgressiveWrongRemoval.ts
"use client";

import { useMemo } from "react";

export type WallPhase = "question" | "overlay" | "reveal" | "leaderboard" | "podium";

export type UseProgressiveWrongRemovalArgs = {
  enabled: boolean;
  questionId: string | null;
  optionsLen: number;
  correctIndex: number | null;

  wallPhase: WallPhase;
  isRunning: boolean;
  isPaused: boolean;
  isSessionOver?: boolean;
  revealAnswer: boolean;

  /** Remaining fraction 0..1 (your existing `progress`) */
  progressRemaining01: number;
};

export type UseProgressiveWrongRemovalResult = {
  level: 0 | 1 | 2;
  removed: Set<number>;
};

/* ---------------------------------------------------------
   Deterministic removal helpers (FNV-1a 32-bit)
--------------------------------------------------------- */
function fnv1a32(str: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function pickTwoWrongRemovals(optsLen: number, correctIndex: number, questionId: string) {
  const wrong: number[] = [];
  for (let i = 0; i < optsLen; i++) if (i !== correctIndex) wrong.push(i);

  if (wrong.length <= 0) return { first: null as number | null, second: null as number | null };
  if (wrong.length === 1) return { first: wrong[0], second: null };

  const h = fnv1a32(questionId || "q");
  const firstIdx = h % wrong.length;
  const first = wrong[firstIdx];

  const remaining = wrong.filter((x) => x !== first);
  const secondIdx = ((h >>> 8) % remaining.length) >>> 0;
  const second = remaining[secondIdx];

  return { first, second };
}

/* ---------------------------------------------------------
   Hook
--------------------------------------------------------- */
export function useProgressiveWrongRemoval({
  enabled,
  questionId,
  optionsLen,
  correctIndex,
  wallPhase,
  isRunning,
  isPaused,
  isSessionOver,
  revealAnswer,
  progressRemaining01,
}: UseProgressiveWrongRemovalArgs): UseProgressiveWrongRemovalResult {
  const level: 0 | 1 | 2 = useMemo(() => {
    if (!enabled) return 0;
    if (!questionId) return 0;
    if (optionsLen <= 0) return 0;
    if (typeof correctIndex !== "number" || correctIndex < 0) return 0;

    if (wallPhase !== "question") return 0;
    if (!isRunning || isPaused) return 0;
    if (isSessionOver) return 0;
    if (revealAnswer) return 0;

    const remaining = Math.max(0, Math.min(1, progressRemaining01 || 0));
    const elapsed = 1 - remaining;

    if (elapsed >= 0.75) return 2;
    if (elapsed >= 0.5) return 1;
    return 0;
  }, [
    enabled,
    questionId,
    optionsLen,
    correctIndex,
    wallPhase,
    isRunning,
    isPaused,
    isSessionOver,
    revealAnswer,
    progressRemaining01,
  ]);

  const removed = useMemo(() => {
    const s = new Set<number>();
    if (level <= 0) return s;

    if (!questionId) return s;
    if (typeof correctIndex !== "number" || correctIndex < 0) return s;
    if (optionsLen <= 0) return s;

    const { first, second } = pickTwoWrongRemovals(optionsLen, correctIndex, questionId);

    if (level >= 1 && typeof first === "number") s.add(first);
    if (level >= 2 && typeof second === "number") s.add(second);

    // Safety: never remove correct
    s.delete(correctIndex);

    return s;
  }, [level, questionId, optionsLen, correctIndex]);

  return { level, removed };
}
