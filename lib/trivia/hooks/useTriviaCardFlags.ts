// lib/trivia/hooks/useTriviaCardFlags.ts
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type TriviaCardFlags = {
  id: string;

  // core runtime
  status: string; // inactive | waiting | running | paused | finished | etc
  countdownActive: boolean;
  countdownSeconds: number;
  countdownStartedAt: string | null;

  // gameplay
  timerSeconds: number;
  playMode: string;
  scoringMode: string;
  requireSelfie: boolean;

  // feature flags
  adsEnabled: boolean;
  progressiveWrongRemovalEnabled: boolean;
  highlightTheHerdEnabled: boolean;

  // optional display bits (handy for user UI)
  publicName?: string;
  backgroundType?: string;
  backgroundValue?: string | null;
  backgroundBrightness?: number;
};

type Options = {
  /** If you already have the trivia row, pass it so the UI is instant */
  initialTrivia?: any;
  /** Use realtime updates (recommended). */
  realtime?: boolean;
  /** Also poll as a safety net (0 disables). */
  pollMs?: number;
};

const DEFAULTS = {
  status: "inactive",
  countdownActive: false,
  countdownSeconds: 10,
  countdownStartedAt: null as string | null,

  timerSeconds: 30,
  playMode: "auto",
  scoringMode: "hundreds",
  requireSelfie: true,

  adsEnabled: false,
  progressiveWrongRemovalEnabled: false,
  highlightTheHerdEnabled: false,

  publicName: "Trivia Game",
  backgroundType: "gradient",
  backgroundValue: null as string | null,
  backgroundBrightness: 100,
};

function normalizeCountdownSeconds(n: any) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return DEFAULTS.countdownSeconds;
  return Math.max(1, Math.min(24 * 60 * 60, Math.floor(v)));
}

function normalizeTimerSeconds(n: any) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return DEFAULTS.timerSeconds;
  return Math.max(1, Math.min(60 * 60, Math.floor(v)));
}

function fromRow(id: string, row: any): TriviaCardFlags {
  return {
    id,

    status: String(row?.status ?? DEFAULTS.status),

    countdownActive: !!row?.countdown_active,
    countdownSeconds: normalizeCountdownSeconds(row?.countdown_seconds),
    countdownStartedAt: row?.countdown_started_at ?? DEFAULTS.countdownStartedAt,

    timerSeconds: normalizeTimerSeconds(
      row?.timer_seconds ?? row?.question_duration_seconds ?? DEFAULTS.timerSeconds
    ),
    playMode: String(row?.play_mode ?? DEFAULTS.playMode),
    scoringMode: String(row?.scoring_mode ?? DEFAULTS.scoringMode),
    requireSelfie:
      typeof row?.require_selfie === "boolean"
        ? row.require_selfie
        : DEFAULTS.requireSelfie,

    adsEnabled: !!row?.ads_enabled,
    progressiveWrongRemovalEnabled: !!row?.progressive_wrong_removal_enabled,
    highlightTheHerdEnabled: !!row?.highlight_the_herd_enabled,

    publicName: String(row?.public_name ?? DEFAULTS.publicName),
    backgroundType: String(row?.background_type ?? DEFAULTS.backgroundType),
    backgroundValue:
      typeof row?.background_value === "undefined"
        ? DEFAULTS.backgroundValue
        : row.background_value,
    backgroundBrightness: Number(
      row?.background_brightness ?? DEFAULTS.backgroundBrightness
    ),
  };
}

export function useTriviaCardFlags(
  triviaCardId: string | null | undefined,
  opts?: Options
) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const realtime = opts?.realtime ?? true;
  const pollMs = opts?.pollMs ?? 2000;

  const [flags, setFlags] = useState<TriviaCardFlags | null>(() => {
    if (!triviaCardId) return null;
    if (opts?.initialTrivia) return fromRow(triviaCardId, opts.initialTrivia);
    return fromRow(triviaCardId, {});
  });

  const lastRef = useRef<string>("");

  const applyRow = (row: any) => {
    if (!triviaCardId) return;
    const next = fromRow(triviaCardId, row);

    // small diff guard to prevent re-render spam
    const sig = JSON.stringify(next);
    if (sig === lastRef.current) return;
    lastRef.current = sig;

    setFlags(next);
  };

  useEffect(() => {
    if (!triviaCardId) {
      setFlags(null);
      return;
    }

    // prime from initial (if provided)
    if (opts?.initialTrivia) applyRow(opts.initialTrivia);

    let alive = true;

    const fetchOnce = async () => {
      const { data, error } = await supabase
        .from("trivia_cards")
        .select(
          [
            "status",
            "countdown_active",
            "countdown_seconds",
            "countdown_started_at",
            "timer_seconds",
            "question_duration_seconds",
            "play_mode",
            "scoring_mode",
            "require_selfie",
            "ads_enabled",
            "progressive_wrong_removal_enabled",
            "highlight_the_herd_enabled",
            "public_name",
            "background_type",
            "background_value",
            "background_brightness",
          ].join(",")
        )
        .eq("id", triviaCardId)
        .maybeSingle();

      if (!alive) return;
      if (error || !data) return;
      applyRow(data);
    };

    fetchOnce();

    let pollId: number | null = null;
    if (pollMs > 0) {
      pollId = window.setInterval(fetchOnce, pollMs);
    }

    let ch: any = null;
    if (realtime) {
      ch = supabase
        .channel(`trivia-card-flags-${triviaCardId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "trivia_cards",
            filter: `id=eq.${triviaCardId}`,
          },
          (payload: any) => {
            if (!payload?.new) return;
            applyRow(payload.new);
          }
        )
        .subscribe();
    }

    return () => {
      alive = false;
      if (pollId != null) window.clearInterval(pollId);
      if (ch) supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triviaCardId]);

  return { flags };
}
