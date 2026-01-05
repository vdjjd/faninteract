// lib/trivia/wall/useHerdHighlight.ts
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

const supabase = getSupabaseClient();

export type UseHerdHighlightArgs = {
  enabled: boolean;

  sessionId: string | null;
  questionId: string | null;
  optionsLen: number;

  active: boolean; // e.g. isActiveGame && wallPhase === "question"
  paused: boolean;
  revealAnswer: boolean;

  removed?: Set<number>; // optional: if you want to ignore removed ones in display
  pollMs?: number; // default 600
};

export type UseHerdHighlightResult = {
  counts: number[];
  percents: number[];
  total: number;
  labelForIndex: (idx: number) => string; // "42% (17 votes)"
};

function sameNumberArray(a: number[], b: number[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function useHerdHighlight({
  enabled,
  sessionId,
  questionId,
  optionsLen,
  active,
  paused,
  revealAnswer,
  removed,
  pollMs = 600,
}: UseHerdHighlightArgs): UseHerdHighlightResult {
  const [counts, setCounts] = useState<number[]>(() => Array(Math.max(0, optionsLen)).fill(0));
  const [total, setTotal] = useState<number>(0);

  const lastCountsRef = useRef<number[]>(counts);
  const lastTotalRef = useRef<number>(total);

  // Ensure local arrays resize if optionsLen changes
  useEffect(() => {
    const next = Array(Math.max(0, optionsLen)).fill(0);
    lastCountsRef.current = next;
    setCounts(next);
    lastTotalRef.current = 0;
    setTotal(0);
  }, [optionsLen]);

  useEffect(() => {
    if (!enabled) return;

    if (!sessionId || !questionId || optionsLen <= 0) {
      const next = Array(Math.max(0, optionsLen)).fill(0);
      if (!sameNumberArray(next, lastCountsRef.current)) {
        lastCountsRef.current = next;
        setCounts(next);
      }
      if (lastTotalRef.current !== 0) {
        lastTotalRef.current = 0;
        setTotal(0);
      }
      return;
    }

    // Don’t keep hammering while not active (or while paused/reveal)
    if (!active || paused || revealAnswer) return;

    let alive = true;

    const load = async () => {
      // Pull answers for THIS question, constrained to players in THIS session (inner join)
      // NOTE: Requires FK from trivia_answers.player_id -> trivia_players.id (you have it)
      const { data, error } = await supabase
        .from("trivia_answers")
        .select(
          `
          selected_index,
          trivia_players!inner (
            session_id
          )
        `
        )
        .eq("question_id", questionId)
        .eq("trivia_players.session_id", sessionId);

      if (!alive) return;
      if (error) {
        // If join syntax fails in some environments, we still don’t want to crash the wall.
        console.warn("⚠️ herd highlight query error:", error);
        return;
      }

      const nextCounts = Array(optionsLen).fill(0);
      let nextTotal = 0;

      for (const row of (data as any[]) || []) {
        const idx = typeof row?.selected_index === "number" ? row.selected_index : -1;
        if (idx < 0 || idx >= optionsLen) continue;

        // Optional: if removed, you can still count it, but usually better to keep it counted
        // (the herd represents real answers). We only use `removed` for UI, not stats.
        nextCounts[idx] += 1;
        nextTotal += 1;
      }

      if (!sameNumberArray(nextCounts, lastCountsRef.current)) {
        lastCountsRef.current = nextCounts;
        setCounts(nextCounts);
      }

      if (nextTotal !== lastTotalRef.current) {
        lastTotalRef.current = nextTotal;
        setTotal(nextTotal);
      }
    };

    load();
    const id = window.setInterval(load, pollMs);

    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [enabled, sessionId, questionId, optionsLen, active, paused, revealAnswer, pollMs]);

  const percents = useMemo(() => {
    if (optionsLen <= 0) return [];
    if (total <= 0) return Array(optionsLen).fill(0);

    return counts.map((c) => {
      const p = Math.round((c / total) * 100);
      return Number.isFinite(p) ? p : 0;
    });
  }, [counts, total, optionsLen]);

  const labelForIndex = (idx: number) => {
    const p = percents[idx] ?? 0;
    const c = counts[idx] ?? 0;
    return `${p}% (${c} votes)`;
  };

  return { counts, percents, total, labelForIndex };
}
