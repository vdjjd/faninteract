// lib/trivia/wall/useHerdHighlight.ts
"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

const supabase = getSupabaseClient();

export type UseHerdHighlightArgs = {
  enabled: boolean;

  sessionId: string | null;
  questionId: string | null;
  optionsLen: number;

  // NOTE: we will NOT trust `active` anymore (it’s been the #1 reason this never runs on wall)
  active: boolean;
  paused: boolean;
  revealAnswer: boolean;

  removed?: Set<number>;
  pollMs?: number;
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

function isMissingColumn(err: any, col: string) {
  const msg = String(err?.message || "").toLowerCase();
  const code = String(err?.code || "");
  return (
    code === "42703" || // postgres undefined_column
    msg.includes("does not exist") ||
    msg.includes(`column`) && msg.includes(col.toLowerCase())
  );
}

export function useHerdHighlight({
  enabled,
  sessionId,
  questionId,
  optionsLen,
  paused,
  revealAnswer,
  pollMs = 600,
}: UseHerdHighlightArgs): UseHerdHighlightResult {
  const [counts, setCounts] = useState<number[]>(
    () => Array(Math.max(0, optionsLen)).fill(0)
  );
  const [total, setTotal] = useState<number>(0);

  const lastCountsRef = useRef<number[]>(counts);
  const lastTotalRef = useRef<number>(total);

  // cache approved player ids (fallback strategy)
  const playerIdsRef = useRef<string[] | null>(null);
  const playerIdsUpdatedAtRef = useRef<number>(0);

  // If a strategy proves impossible in this env, we stop trying it repeatedly.
  const strategyRef = useRef<{
    triedSessionIdColumn: boolean;
    triedJoin: boolean;
    triedInList: boolean;
  }>({
    triedSessionIdColumn: false,
    triedJoin: false,
    triedInList: false,
  });

  // Resize arrays if optionsLen changes
  useEffect(() => {
    const next = Array(Math.max(0, optionsLen)).fill(0);
    lastCountsRef.current = next;
    setCounts(next);
    lastTotalRef.current = 0;
    setTotal(0);
  }, [optionsLen]);

  useEffect(() => {
    if (!enabled) return;

    // hard reset if not ready
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

    // Don’t poll while paused/reveal
    if (paused || revealAnswer) return;

    let alive = true;

    const applyRows = (rows: any[] | null | undefined) => {
      const nextCounts = Array(optionsLen).fill(0);
      let nextTotal = 0;

      for (const row of rows || []) {
        const idx = typeof row?.selected_index === "number" ? row.selected_index : -1;
        if (idx < 0 || idx >= optionsLen) continue;
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

    const load = async () => {
      // -------- Strategy A: trivia_answers has session_id (fastest) --------
      if (!strategyRef.current.triedSessionIdColumn) {
        const { data, error } = await supabase
          .from("trivia_answers")
          .select("selected_index")
          .eq("question_id", questionId)
          // will error if column doesn't exist
          .eq("session_id", sessionId);

        if (!alive) return;

        if (!error) {
          applyRows(data as any[]);
          return;
        }

        // If session_id column doesn't exist, don’t retry this strategy.
        if (isMissingColumn(error, "session_id")) {
          strategyRef.current.triedSessionIdColumn = true;
        } else {
          // other errors (RLS etc.) -> still mark tried so we don’t hammer
          strategyRef.current.triedSessionIdColumn = true;
          // keep going to next strategy
        }
      }

      // -------- Strategy B: join trivia_players (your original) --------
      if (!strategyRef.current.triedJoin) {
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

        if (!error) {
          applyRows(data as any[]);
          return;
        }

        // join syntax not supported / relationship name mismatch / RLS
        strategyRef.current.triedJoin = true;
        // fall through
      }

      // -------- Strategy C: get approved player ids, then IN(player_id, ...) --------
      if (!strategyRef.current.triedInList) {
        const now = Date.now();

        // refresh cached player ids every 2 seconds
        if (
          !playerIdsRef.current ||
          now - playerIdsUpdatedAtRef.current > 2000
        ) {
          const { data: players, error: pErr } = await supabase
            .from("trivia_players")
            .select("id")
            .eq("session_id", sessionId)
            .eq("status", "approved");

          if (!alive) return;

          if (pErr || !players) {
            strategyRef.current.triedInList = true;
            return;
          }

          playerIdsRef.current = (players as any[]).map((p) => p.id).filter(Boolean);
          playerIdsUpdatedAtRef.current = now;
        }

        const ids = playerIdsRef.current || [];
        if (!ids.length) {
          applyRows([]);
          return;
        }

        // Supabase IN() has practical size limits; batch it.
        const batchSize = 100;
        const allRows: any[] = [];

        for (let i = 0; i < ids.length; i += batchSize) {
          const batch = ids.slice(i, i + batchSize);
          const { data, error } = await supabase
            .from("trivia_answers")
            .select("selected_index")
            .eq("question_id", questionId)
            .in("player_id", batch);

          if (!alive) return;

          if (error) {
            strategyRef.current.triedInList = true;
            return;
          }

          if (data?.length) allRows.push(...(data as any[]));
        }

        applyRows(allRows);
        return;
      }

      // If every strategy failed, just hold zeros (don’t spam)
      applyRows([]);
    };

    load();
    const id = window.setInterval(load, pollMs);

    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [enabled, sessionId, questionId, optionsLen, paused, revealAnswer, pollMs]);

  const percents = useMemo(() => {
    if (optionsLen <= 0) return [];
    if (total <= 0) return Array(optionsLen).fill(0);

    return counts.map((c) => {
      const p = Math.round((c / total) * 100);
      return Number.isFinite(p) ? p : 0;
    });
  }, [counts, total, optionsLen]);

  const labelForIndex = useCallback(
    (idx: number) => {
      const p = percents[idx] ?? 0;
      const c = counts[idx] ?? 0;
      return `${p}% (${c} votes)`;
    },
    [percents, counts]
  );

  return { counts, percents, total, labelForIndex };
}
