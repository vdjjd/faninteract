"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { computeTriviaPoints } from "@/lib/trivia/triviaScoringEngine";
import { useTriviaCardFlags } from "@/lib/trivia/hooks/useTriviaCardFlags";

// ✅ herd highlight (same hook the wall uses)
import { useHerdHighlight } from "@/lib/trivia/wall/useHerdHighlight";

const supabase = getSupabaseClient();

/* ---------------------------------------------------------
   Helpers
--------------------------------------------------------- */
function getStoredGuestProfile() {
  try {
    const raw =
      localStorage.getItem("guest_profile") ||
      localStorage.getItem("guestInfo");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

interface TriviaSession {
  id: string;
  status: string;
  current_round: number;
  current_question: number;
  question_started_at: string | null;

  wall_phase?: string | null;
  wall_phase_started_at?: string | null;
}

type UIView = "question" | "leaderboard";

type LeaderRow = {
  rank: number;
  name: string;
  points: number;
  selfieUrl?: string | null;

  // ✅ NEW: streak (ready for UI highlight later)
  streak?: number;
};

type HostRow = {
  id: string;
  master_id: string | null;
  branding_logo_url: string | null;
  logo_url: string | null;
  injector_enabled: boolean | null; // GLOBAL gate
};

type SlideAd = {
  id: string;
  url: string;
  type: "image" | "video" | string; // allow weird db values safely
  active: boolean | null;
  order_index: number;
  global_order_index: number | null;
  duration_seconds: number | null;
  host_profile_id: string | null;
  master_id: string | null;
};

function formatName(first?: string, last?: string) {
  const f = (first || "").trim();
  const l = (last || "").trim();
  const li = l ? `${l[0].toUpperCase()}.` : "";
  return `${f}${li ? " " + li : ""}`.trim() || "Player";
}

function formatDisplayName(display?: string) {
  const raw = (display || "").trim().replace(/\s+/g, " ");
  if (!raw) return "Player";

  const parts = raw.split(" ").filter(Boolean);
  const first = parts[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  const li = last ? `${last[0].toUpperCase()}.` : "";

  return `${first}${li ? " " + li : ""}`.trim() || "Player";
}

function pickSelfieUrl(guest: any): string | null {
  return (
    guest?.selfie_url ||
    guest?.photo_url ||
    guest?.avatar_url ||
    guest?.image_url ||
    guest?.selfie ||
    guest?.photo ||
    guest?.profile_photo_url ||
    null
  );
}

// ✅ PATCH: prevent leaderboard flicker / pointless state churn
function sameLeaderRows(a: LeaderRow[], b: LeaderRow[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].rank !== b[i].rank ||
      a[i].name !== b[i].name ||
      a[i].points !== b[i].points ||
      (a[i].selfieUrl || null) !== (b[i].selfieUrl || null) ||
      (a[i].streak || 0) !== (b[i].streak || 0)
    ) {
      return false;
    }
  }
  return true;
}

/* ---------------------------------------------------------
   ✅ STREAK MULTIPLIER HELPERS
--------------------------------------------------------- */
function streakBonusPct(streak: number): number {
  // 2 => 0.10, 3 => 0.20, 4 => 0.30, 5 => 0.40, 6+ => 0.50
  if (!Number.isFinite(streak) || streak < 2) return 0;
  return Math.min(0.1 * (streak - 1), 0.5);
}

function computeStreakBeforeCurrentQuestion(args: {
  answers: { question_id: string; is_correct: boolean | null }[];
  questions: any[];
  currentQuestionIndex: number;
}): number {
  const { answers, questions, currentQuestionIndex } = args;
  if (!Array.isArray(questions) || questions.length === 0) return 0;
  if (!Number.isFinite(currentQuestionIndex)) return 0;

  const qIndexById = new Map<string, number>();
  for (let i = 0; i < questions.length; i++) {
    const id = questions[i]?.id;
    if (typeof id === "string") qIndexById.set(id, i);
  }

  const ansByIdx = new Map<number, boolean>();
  for (const a of answers || []) {
    const qi = qIndexById.get(a.question_id);
    if (typeof qi === "number") ansByIdx.set(qi, !!a.is_correct);
  }

  let streak = 0;
  for (let i = currentQuestionIndex - 1; i >= 0; i--) {
    if (!ansByIdx.has(i)) break; // missing answer breaks streak
    if (!ansByIdx.get(i)) break; // wrong breaks streak
    streak++;
  }
  return streak;
}

function computeStreakEndingAtLatestAnswered(args: {
  answers: { question_id: string; is_correct: boolean | null }[];
  questions: any[];
}): number {
  const { answers, questions } = args;
  if (!Array.isArray(questions) || questions.length === 0) return 0;

  const qIndexById = new Map<string, number>();
  for (let i = 0; i < questions.length; i++) {
    const id = questions[i]?.id;
    if (typeof id === "string") qIndexById.set(id, i);
  }

  const ansByIdx = new Map<number, boolean>();
  let latestIdx = -1;

  for (const a of answers || []) {
    const qi = qIndexById.get(a.question_id);
    if (typeof qi === "number") {
      ansByIdx.set(qi, !!a.is_correct);
      if (qi > latestIdx) latestIdx = qi;
    }
  }

  if (latestIdx < 0) return 0;

  let streak = 0;
  for (let i = latestIdx; i >= 0; i--) {
    if (!ansByIdx.has(i)) break;
    if (!ansByIdx.get(i)) break;
    streak++;
  }
  return streak;
}

/* ---------------------------------------------------------
   ✅ Highlight The Herd flag reader (supports either column name)
--------------------------------------------------------- */
function readHerdEnabled(row: any): boolean {
  if (typeof row?.highlight_the_herd_enabled !== "undefined") {
    return !!row.highlight_the_herd_enabled;
  }
  if (typeof row?.herd_highlight_enabled !== "undefined") {
    return !!row.herd_highlight_enabled;
  }
  // tolerate a few other shapes
  if (typeof row?.highlightTheHerdEnabled !== "undefined") {
    return !!row.highlightTheHerdEnabled;
  }
  if (typeof row?.herdHighlightEnabled !== "undefined") {
    return !!row.herdHighlightEnabled;
  }
  return false;
}

/* ---------------------------------------------------------
   ✅ QUESTION ORDERING (MATCH WALL LOGIC)
--------------------------------------------------------- */
type QuestionOrderMode = "question_number" | "round_number" | "created_at";

function normalizeQuestions(qsRaw: any[]): {
  list: any[];
  mode: QuestionOrderMode;
} {
  const list = Array.isArray(qsRaw) ? [...qsRaw] : [];
  if (!list.length) return { list: [], mode: "created_at" };

  const hasAllQN = list.every(
    (q) =>
      typeof q?.question_number === "number" &&
      Number.isFinite(q.question_number)
  );
  const hasAllRN = list.every(
    (q) => typeof q?.round_number === "number" && Number.isFinite(q.round_number)
  );

  const mode: QuestionOrderMode = hasAllQN
    ? "question_number"
    : hasAllRN
    ? "round_number"
    : "created_at";

  const time = (v: any) => {
    const t = new Date(v || 0).getTime();
    return Number.isFinite(t) ? t : 0;
  };

  list.sort((a, b) => {
    if (mode === "question_number")
      return (a.question_number || 0) - (b.question_number || 0);
    if (mode === "round_number")
      return (a.round_number || 0) - (b.round_number || 0);
    return time(a?.created_at) - time(b?.created_at);
  });

  return { list, mode };
}

function pickQuestionForCurrent(
  qs: any[],
  currentQuestion: number,
  mode: QuestionOrderMode
): any | null {
  if (!qs?.length || !currentQuestion || currentQuestion < 1) return null;

  if (mode === "question_number") {
    const hit = qs.find((q) => q?.question_number === currentQuestion);
    if (hit) return hit;
  }

  if (mode === "round_number") {
    const hit = qs.find((q) => q?.round_number === currentQuestion);
    if (hit) return hit;
  }

  const idx = Math.max(0, Math.min(qs.length - 1, currentQuestion - 1));
  return qs[idx] ?? null;
}

/* ---------------------------------------------------------
   ✅ Progressive wrong-answer removal (50% + 75%)
   - Deterministic per question.id so phone + wall match
--------------------------------------------------------- */
function fnv1a32(str: string) {
  // 32-bit FNV-1a
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function pickTwoWrongRemovals(
  optsLen: number,
  correctIndex: number,
  questionId: string
) {
  const wrong: number[] = [];
  for (let i = 0; i < optsLen; i++) if (i !== correctIndex) wrong.push(i);
  if (wrong.length < 2) return { first: wrong[0] ?? null, second: null };

  const h = fnv1a32(questionId || "q");
  const firstIdx = h % wrong.length;
  const first = wrong[firstIdx];

  const remaining = wrong.filter((x) => x !== first);
  const secondIdx = ((h >>> 8) % remaining.length) >>> 0;
  const second = remaining[secondIdx];

  return { first, second };
}

/* ---------------------------------------------------------
   Constants
--------------------------------------------------------- */
const FALLBACK_BG =
  "radial-gradient(circle at top,#1d4ed8 0,#020617 55%,#000 100%)";

// ✅ Extra visual/lock grace period for FIRST question only (ms)
const FIRST_QUESTION_EXTRA_MS = 2000;

/* ---------------------------------------------------------
   ✅ Effective question start (fixes Q1 scoring)
--------------------------------------------------------- */
function getEffectiveQuestionStartMs(args: {
  questionStartedAt: string | null;
  currentQuestionNumber: number | null;
  countdownStartedAt: string | null;
  countdownSeconds: number | null;
}) {
  const {
    questionStartedAt,
    currentQuestionNumber,
    countdownStartedAt,
    countdownSeconds,
  } = args;

  if (!questionStartedAt) return null;

  const baseStart = new Date(questionStartedAt).getTime();
  if (!Number.isFinite(baseStart)) return null;

  let startMs = baseStart;

  // If Q1 question_started_at got stamped before countdown finished,
  // shift effective start to countdown end.
  if (currentQuestionNumber === 1 && countdownStartedAt) {
    const cStart = new Date(countdownStartedAt).getTime();
    if (Number.isFinite(cStart)) {
      const cSecs = typeof countdownSeconds === "number" ? countdownSeconds : 10;
      startMs = cStart + cSecs * 1000;
    }
  }

  // Apply your extra Q1 grace
  if (currentQuestionNumber === 1) {
    startMs += FIRST_QUESTION_EXTRA_MS;
  }

  return startMs;
}

export default function TriviaUserInterfacePage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const gameId = searchParams.get("game"); // trivia_cards.id

  // ✅ central flags hook
  const { flags } = useTriviaCardFlags(gameId, {
    realtime: true,
    pollMs: 2000,
  });

  const [profile, setProfile] = useState<any>(null);
  const [trivia, setTrivia] = useState<any>(null);
  const [session, setSession] = useState<TriviaSession | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [questionOrderMode, setQuestionOrderMode] =
    useState<QuestionOrderMode>("created_at");
  const [hostLogoUrl, setHostLogoUrl] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("Loading trivia…");

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);

  // Timer
  const [progress, setProgress] = useState<number>(1);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);

  // Wall-authority phases
  const [showAnswerOverlay, setShowAnswerOverlay] = useState(false);
  const [revealAnswer, setRevealAnswer] = useState(false);

  // View
  const [view, setView] = useState<UIView>("question");
  const [leaderRows, setLeaderRows] = useState<LeaderRow[]>([]);
  const [leaderLoading, setLeaderLoading] = useState(false);

  // DB-anchored start time
  const [questionStartedAt, setQuestionStartedAt] = useState<string | null>(null);

  const timerIntervalRef = useRef<number | null>(null);

  // ✅ holds the last computed timer state so "paused" can freeze without resetting
  const timerSnapshotRef = useRef<{
    progress: number;
    secondsLeft: number;
    remainingMs: number;
  } | null>(null);

  // server-time offset
  const [serverOffsetMs, setServerOffsetMs] = useState<number>(0);

  // ads
  const [hostRow, setHostRow] = useState<HostRow | null>(null);
  const [ads, setAds] = useState<SlideAd[]>([]);
  const [adsLoading, setAdsLoading] = useState(false);

  // lock ad to question number (prevents mid-question jumping)
  const [adLockedQuestion, setAdLockedQuestion] = useState<number>(1);
  const [lockedAdIndex, setLockedAdIndex] = useState<number>(0);

  // ✅ PATCH: leaderboard flicker guard
  const lastLeaderRowsRef = useRef<LeaderRow[]>([]);
  const leaderScrollRef = useRef<HTMLDivElement | null>(null);

  /* ---------------------------------------------------------
     ✅ FLAGS (from hook) — single source of truth
  --------------------------------------------------------- */
  const adsEnabled = flags?.adsEnabled ?? false;
  const progressiveWrongRemovalEnabled =
    flags?.progressiveWrongRemovalEnabled ?? false;

  const countdownSeconds = flags?.countdownSeconds ?? 10;
  const countdownActive = flags?.countdownActive ?? false;
  const countdownStartedAt = flags?.countdownStartedAt ?? null;

  // ✅ NEW: streak flag (tolerate camelCase or snake_case)
  const streakMultiplierEnabled =
    (flags as any)?.streakMultiplierEnabled ??
    (flags as any)?.streak_multiplier_enabled ??
    false;

  // ✅ Highlight The Herd (try to read from flags, but we’ll also fallback-load from DB)
  const herdEnabledFromFlags = useMemo(() => {
    const f: any = flags as any;
    return readHerdEnabled(f) || readHerdEnabled(f?.new) || false;
  }, [flags]);

  const [highlightTheHerdEnabled, setHighlightTheHerdEnabled] =
    useState<boolean>(false);

  // Prefer flags when present (live updates)
  useEffect(() => {
    if (typeof herdEnabledFromFlags === "boolean") {
      setHighlightTheHerdEnabled(herdEnabledFromFlags);
    }
  }, [herdEnabledFromFlags]);

  /* ---------------------------------------------------------
     ✅ COUNTDOWN TIMER (LOCKED TO INACTIVE WALL)
  --------------------------------------------------------- */
  const countdownRemaining = useMemo(() => {
    if (!countdownActive || !countdownStartedAt) return 0;

    const startMs = new Date(countdownStartedAt).getTime();
    const nowMs = Date.now() + serverOffsetMs;
    const elapsed = Math.max(0, (nowMs - startMs) / 1000);

    return Math.max(0, (countdownSeconds || 10) - elapsed);
  }, [countdownActive, countdownStartedAt, countdownSeconds, serverOffsetMs]);

  const isCountdownRunning =
    Boolean(countdownActive) &&
    Boolean(countdownStartedAt) &&
    countdownRemaining > 0.01;

  /* ---------------------------------------------------------
     Server clock sync
  --------------------------------------------------------- */
  useEffect(() => {
    if (!gameId) return;

    let cancelled = false;

    async function syncServerTime() {
      try {
        const t0 = Date.now();
        const { data, error } = await supabase.rpc("server_time");
        const t1 = Date.now();

        if (cancelled) return;
        if (error || !data) {
          console.warn("⚠️ server_time RPC unavailable:", error);
          return;
        }

        const serverMs = new Date(data as any).getTime();
        const rtt = t1 - t0;
        const estimatedNow = t1 - rtt / 2;
        const offset = serverMs - estimatedNow;

        setServerOffsetMs(offset);
      } catch (e) {
        console.warn("⚠️ server time sync error:", e);
      }
    }

    syncServerTime();
    const id = window.setInterval(syncServerTime, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [gameId]);

  /* ---------------------------------------------------------
     Load guest profile
  --------------------------------------------------------- */
  useEffect(() => {
    const p = getStoredGuestProfile();
    if (!p) {
      if (gameId) router.replace(`/guest/signup?trivia=${gameId}`);
      return;
    }
    setProfile(p);
  }, [router, gameId]);

  /* ---------------------------------------------------------
     Initial load
  --------------------------------------------------------- */
  useEffect(() => {
    if (!gameId || !profile?.id) return;

    let cancelled = false;

    async function init() {
      setLoading(true);
      setLoadingMessage("Loading trivia game…");

      // 1) trivia card
      const { data: card, error: cardErr } = await supabase
        .from("trivia_cards")
        .select(
          `
          id,
          public_name,
          timer_seconds,
          scoring_mode,
          host_id,
          background_type,
          background_value,
          background_brightness
        `
        )
        .eq("id", gameId)
        .maybeSingle();

      if (cancelled) return;

      if (cardErr || !card) {
        console.error("❌ trivia_cards fetch error (UI):", cardErr);
        setLoadingMessage("Could not load trivia game.");
        setLoading(false);
        return;
      }

      setTrivia(card);

      // ✅ Herd flag fallback-load
      try {
        const { data: herd1, error: e1 } = await supabase
          .from("trivia_cards")
          .select("highlight_the_herd_enabled")
          .eq("id", gameId)
          .maybeSingle();

        if (!cancelled && !e1 && herd1) {
          setHighlightTheHerdEnabled(
            !!(herd1 as any).highlight_the_herd_enabled
          );
        } else {
          const { data: herd2, error: e2 } = await supabase
            .from("trivia_cards")
            .select("herd_highlight_enabled")
            .eq("id", gameId)
            .maybeSingle();

          if (!cancelled && !e2 && herd2) {
            setHighlightTheHerdEnabled(!!(herd2 as any).herd_highlight_enabled);
          }
        }
      } catch {
        // ignore
      }

      // 2) host row (logo + master_id + injector_enabled)
      let logo = "/faninteractlogo.png";
      if ((card as any).host_id) {
        const { data: host, error: hostErr } = await supabase
          .from("hosts")
          .select("id,master_id,branding_logo_url,logo_url,injector_enabled")
          .eq("id", (card as any).host_id)
          .maybeSingle();

        if (!hostErr && host) {
          setHostRow(host as HostRow);
          logo = host.branding_logo_url?.trim() || host.logo_url?.trim() || logo;
        }
      }
      if (!cancelled) setHostLogoUrl(logo);

      // 3) latest session
      setLoadingMessage("Connecting to game session…");

      const { data: sessionRow, error: sessionErr } = await supabase
        .from("trivia_sessions")
        .select(
          "id,status,current_round,current_question,question_started_at,wall_phase,wall_phase_started_at,created_at"
        )
        .eq("trivia_card_id", gameId)
        .neq("status", "finished")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      if (sessionErr || !sessionRow) {
        console.error("❌ trivia_sessions fetch error (UI):", sessionErr);
        setLoadingMessage("The host has not opened this trivia game yet.");
        setLoading(false);
        return;
      }

      setSession(sessionRow as TriviaSession);
      setQuestionStartedAt((sessionRow as any).question_started_at ?? null);

      // seed ad lock to current question immediately
      const initialQ = Number((sessionRow as any)?.current_question ?? 1);
      setAdLockedQuestion(initialQ);

      // 4) ensure player row
      setLoadingMessage("Finding your player seat…");

      const { data: playerRow, error: playerErr } = await supabase
        .from("trivia_players")
        .select("id,status")
        .eq("session_id", (sessionRow as any).id)
        .eq("guest_id", profile.id)
        .maybeSingle();

      if (cancelled) return;

      if (playerErr || !playerRow) {
        console.error("❌ trivia_players fetch error (UI):", playerErr);
        setLoadingMessage("Could not find your player entry for this game.");
        setLoading(false);
        return;
      }

      setPlayerId((playerRow as any).id);

      // 5) questions
      setLoadingMessage("Loading questions…");

      const { data: qsRaw, error: qErr } = await supabase
        .from("trivia_questions")
        .select("*")
        .eq("trivia_card_id", gameId)
        .eq("is_active", true);

      if (cancelled) return;

      if (qErr || !qsRaw) {
        console.error("❌ trivia_questions fetch error (UI):", qErr);
        setLoadingMessage("No questions are available for this game.");
        setLoading(false);
        return;
      }

      // ✅ Make question ordering + mode match wall logic
      const { list, mode } = normalizeQuestions(qsRaw);
      setQuestions(list);
      setQuestionOrderMode(mode);
      setLoading(false);
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [gameId, profile?.id, router]);

  /* ---------------------------------------------------------
     Load Slide Ads when allowed (GLOBAL + TRIVIA)
  --------------------------------------------------------- */
  useEffect(() => {
    if (!hostRow?.id) return;

    let cancelled = false;

    async function loadAds() {
      try {
        setAdsLoading(true);

        if (!hostRow.injector_enabled || !adsEnabled) {
          if (!cancelled) setAds([]);
          return;
        }

        const hostId = hostRow.id;
        const masterId = hostRow.master_id;

        let query = supabase
          .from("slide_ads")
          .select(
            "id,url,type,active,order_index,global_order_index,duration_seconds,host_profile_id,master_id"
          )
          .eq("active", true);

        if (masterId) {
          query = query
            .or(`master_id.eq.${masterId},host_profile_id.eq.${hostId}`)
            .order("global_order_index", { ascending: true, nullsFirst: false })
            .order("order_index", { ascending: true });
        } else {
          query = query
            .eq("host_profile_id", hostId)
            .order("order_index", { ascending: true });
        }

        const { data, error } = await query;

        if (error) {
          console.warn("⚠️ slide_ads fetch error (trivia phone):", error);
          if (!cancelled) setAds([]);
          return;
        }

        const cleaned = ((data as SlideAd[]) || []).filter(
          (a) => typeof a?.url === "string" && a.url.trim().length > 0
        );

        if (!cancelled) setAds(cleaned);
      } finally {
        if (!cancelled) setAdsLoading(false);
      }
    }

    loadAds();
    return () => {
      cancelled = true;
    };
  }, [hostRow?.id, hostRow?.master_id, hostRow?.injector_enabled, adsEnabled]);

  /* ---------------------------------------------------------
     Poll trivia_sessions for current_question / status / wall_phase
  --------------------------------------------------------- */
  useEffect(() => {
    if (!gameId || !session?.id) return;

    const doPoll = async () => {
      const { data, error } = await supabase
        .from("trivia_sessions")
        .select(
          "id,status,current_round,current_question,question_started_at,wall_phase,wall_phase_started_at"
        )
        .eq("id", session.id)
        .maybeSingle();

      if (error || !data) {
        console.error("❌ trivia_sessions poll error:", error);
        return;
      }

      setSession((prev) => ({
        ...(prev || (data as any)),
        ...(data as any),
      }));

      setQuestionStartedAt((data as any).question_started_at ?? null);

      // ✅ lock ad ONLY when question number changes
      const q = Number((data as any)?.current_question ?? 1);
      setAdLockedQuestion((prevQ) => {
        if (q !== prevQ) return q;
        return prevQ;
      });
    };

    doPoll();
    const id = window.setInterval(doPoll, 1000);
    return () => window.clearInterval(id);
  }, [session?.id, gameId]);

  /* ---------------------------------------------------------
     Derived current question (MATCHES WALL'S SELECTION)
  --------------------------------------------------------- */
  const timerSeconds: number = trivia?.timer_seconds ?? 30;
  const scoringMode: string = trivia?.scoring_mode ?? "100s";

  const currentQuestionIndex =
    session?.current_question && questions.length > 0
      ? (() => {
          const picked = pickQuestionForCurrent(
            questions,
            session.current_question || 1,
            questionOrderMode
          );
          if (!picked) return 0;
          const idx = questions.findIndex((q) => q.id === picked.id);
          return idx === -1 ? 0 : idx;
        })()
      : 0;

  const currentQuestion = questions[currentQuestionIndex] || null;
  const isRunning = session?.status === "running";
  const isPaused = Boolean(session?.status) && session?.status !== "running";

  const wallPhase = (session?.wall_phase || "question") as
    | "question"
    | "overlay"
    | "reveal"
    | "leaderboard"
    | "podium";

  /* ---------------------------------------------------------
     ✅ Session over detection + close handler + continue button
  --------------------------------------------------------- */
  const isLastQuestion = currentQuestionIndex === questions.length - 1;

  const isSessionOver =
    session?.status === "finished" ||
    wallPhase === "podium" ||
    (isLastQuestion && wallPhase === "leaderboard");

  function handleCloseTab() {
    try {
      window.open("", "_self");
      window.close();
    } catch {}
    setTimeout(() => {
      try {
        window.location.href = "about:blank";
      } catch {}
    }, 50);
  }

  function handleContinueToNextRound() {
    if (!gameId) return;
    // Important: tell the thanks page this is a trivia flow
    router.push(`/thanks/${gameId}?type=trivia`);
  }

  /* ---------------------------------------------------------
     ✅ If host hits STOP, send user to thank-you page
     (assuming dashboard sets status = "stopped")
  --------------------------------------------------------- */
  useEffect(() => {
    if (!gameId) return;
    if (session?.status === "stopped") {
      router.replace(`/thanks/${gameId}?type=trivia`);
    }
  }, [session?.status, gameId, router]);

  /* ---------------------------------------------------------
     Detect video
  --------------------------------------------------------- */
  const lockedAd: SlideAd | null = useMemo(() => {
    if (!adsEnabled) return null;
    if (!ads || ads.length === 0) return null;
    return ads[lockedAdIndex] || null;
  }, [adsEnabled, ads, lockedAdIndex]);

  const isVideo =
    typeof lockedAd?.type === "string" &&
    lockedAd.type.toLowerCase().includes("video");

  /* ---------------------------------------------------------
     Advance ad index ONLY when question changes
  --------------------------------------------------------- */
  useEffect(() => {
    if (!adsEnabled) return;
    if (!ads || ads.length === 0) return;

    const nextIdx =
      ((adLockedQuestion - 1) % ads.length + ads.length) % ads.length;

    setLockedAdIndex(nextIdx);
  }, [adsEnabled, ads, adLockedQuestion]);

  /* ---------------------------------------------------------
     Follow wall phase
  --------------------------------------------------------- */
  useEffect(() => {
    if (wallPhase === "leaderboard") setView("leaderboard");
    else setView("question");

    setShowAnswerOverlay(wallPhase === "overlay");
    setRevealAnswer(wallPhase === "reveal");

    setLocked(
      wallPhase !== "question" || isPaused || isCountdownRunning || isSessionOver
    );
  }, [wallPhase, isPaused, isCountdownRunning, isSessionOver]);

  /* ---------------------------------------------------------
     When question changes → reset local answer state
  --------------------------------------------------------- */
  useEffect(() => {
    if (!currentQuestion?.id) return;

    setLeaderRows([]);
    lastLeaderRowsRef.current = [];
    setLeaderLoading(false);

    setSelectedIndex(null);
    setHasAnswered(false);

    setProgress(1);
    setSecondsLeft(timerSeconds);

    timerSnapshotRef.current = null;
  }, [currentQuestion?.id, timerSeconds]);

  /* ---------------------------------------------------------
     TIMER (patched: uses effective start so Q1 doesn't burn time)
  --------------------------------------------------------- */
  useEffect(() => {
    if (timerIntervalRef.current !== null) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (wallPhase !== "question") {
      timerSnapshotRef.current = null;
      setProgress(0);
      setSecondsLeft(0);
      return;
    }

    if (!currentQuestion || !questionStartedAt) {
      timerSnapshotRef.current = null;
      setProgress(1);
      setSecondsLeft(timerSeconds);
      return;
    }

    const durationMs = (timerSeconds || 30) * 1000;

    const effectiveStartMs = getEffectiveQuestionStartMs({
      questionStartedAt,
      currentQuestionNumber: session?.current_question ?? null,
      countdownStartedAt,
      countdownSeconds,
    });

    const computeRemaining = (nowMs: number) => {
      if (!effectiveStartMs) {
        return {
          remainingMs: durationMs,
          progress: 1,
          secondsLeft: Math.max(0, Math.ceil(durationMs / 1000)),
        };
      }

      // If effective start is in the future (countdown/grace), elapsed = 0
      const effectiveElapsed = Math.max(0, nowMs - effectiveStartMs);

      const remainingMs = Math.max(0, durationMs - effectiveElapsed);
      const frac = durationMs > 0 ? remainingMs / durationMs : 0;

      return {
        remainingMs,
        progress: Math.max(0, Math.min(1, frac)),
        secondsLeft: Math.max(0, Math.ceil(remainingMs / 1000)),
      };
    };

    const apply = (snap: {
      remainingMs: number;
      progress: number;
      secondsLeft: number;
    }) => {
      timerSnapshotRef.current = snap;
      setProgress(snap.progress);
      setSecondsLeft(snap.secondsLeft);

      if (snap.remainingMs <= 0) setLocked(true);
    };

    if (isPaused || !isRunning || isCountdownRunning || isSessionOver) {
      const nowMs = Date.now() + serverOffsetMs;
      apply(computeRemaining(nowMs));
      setLocked(true);
      return;
    }

    const tick = () => {
      const nowMs = Date.now() + serverOffsetMs;
      apply(computeRemaining(nowMs));
    };

    tick();
    timerIntervalRef.current = window.setInterval(tick, 100);

    return () => {
      if (timerIntervalRef.current !== null) {
        window.clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [
    isRunning,
    isPaused,
    isCountdownRunning,
    isSessionOver,
    currentQuestion?.id,
    questionStartedAt,
    timerSeconds,
    serverOffsetMs,
    wallPhase,
    session?.current_question,
    countdownStartedAt,
    countdownSeconds,
  ]);

  /* ---------------------------------------------------------
     ✅ Progressive wrong-answer removal derived state
  --------------------------------------------------------- */
  const wrongRemovalLevel = useMemo(() => {
    if (!progressiveWrongRemovalEnabled) return 0;
    if (!currentQuestion?.id) return 0;
    if (wallPhase !== "question") return 0;
    if (!isRunning || isPaused || isCountdownRunning || isSessionOver) return 0;
    if (revealAnswer) return 0;

    // progress is "remaining fraction". elapsed is 1 - progress.
    const elapsed = 1 - Math.max(0, Math.min(1, progress || 0));
    if (elapsed >= 0.75) return 2;
    if (elapsed >= 0.5) return 1;
    return 0;
  }, [
    progressiveWrongRemovalEnabled,
    currentQuestion?.id,
    wallPhase,
    isRunning,
    isPaused,
    isCountdownRunning,
    isSessionOver,
    revealAnswer,
    progress,
  ]);

  const removedWrongIndices = useMemo(() => {
    if (!currentQuestion?.id) return new Set<number>();
    const optsLen = Array.isArray(currentQuestion?.options)
      ? currentQuestion.options.length
      : 0;

    const correct =
      typeof currentQuestion.correct_index === "number"
        ? currentQuestion.correct_index
        : -1;

    if (optsLen <= 0 || correct < 0) return new Set<number>();
    if (wrongRemovalLevel <= 0) return new Set<number>();

    const { first, second } = pickTwoWrongRemovals(
      optsLen,
      correct,
      currentQuestion.id
    );

    const s = new Set<number>();
    if (wrongRemovalLevel >= 1 && typeof first === "number") s.add(first);
    if (wrongRemovalLevel >= 2 && typeof second === "number") s.add(second);

    return s;
  }, [
    currentQuestion?.id,
    currentQuestion?.options,
    currentQuestion?.correct_index,
    wrongRemovalLevel,
  ]);

  /* ---------------------------------------------------------
     ✅ Highlight The Herd (same as wall)
  --------------------------------------------------------- */
  const herd = useHerdHighlight({
    enabled: highlightTheHerdEnabled,

    sessionId: session?.id ?? null,
    questionId: currentQuestion?.id ?? null,
    optionsLen: Array.isArray(currentQuestion?.options)
      ? currentQuestion.options.length
      : 0,

    active:
      isRunning &&
      wallPhase === "question" &&
      !isCountdownRunning &&
      !isSessionOver,

    paused: isPaused,
    revealAnswer,

    removed: removedWrongIndices,
    pollMs: 600,
  });

  const herdTopIndex = useMemo(() => {
    if (!highlightTheHerdEnabled) return null;

    const p = herd?.percents || [];
    if (!Array.isArray(p) || p.length === 0) return null;

    let best = -1;
    let bestVal = -1;

    for (let i = 0; i < p.length; i++) {
      if (removedWrongIndices.has(i)) continue;
      const v = Number(p[i] || 0);
      if (v > bestVal) {
        bestVal = v;
        best = i;
      }
    }

    return bestVal > 0 && best >= 0 ? best : null;
  }, [highlightTheHerdEnabled, herd?.percents, removedWrongIndices]);

  /* ---------------------------------------------------------
     If refresh mid-question, reflect existing answer
  --------------------------------------------------------- */
  useEffect(() => {
    if (!playerId || !currentQuestion?.id) return;

    let cancelled = false;

    async function loadExisting() {
      const { data, error } = await supabase
        .from("trivia_answers")
        .select("selected_index")
        .eq("player_id", playerId)
        .eq("question_id", currentQuestion.id)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error("❌ existing answer lookup error:", error);
        return;
      }

      if (data) {
        setHasAnswered(true);
        setSelectedIndex(
          typeof (data as any).selected_index === "number"
            ? (data as any).selected_index
            : null
        );
      }
    }

    loadExisting();
    return () => {
      cancelled = true;
    };
  }, [playerId, currentQuestion?.id]);

  /* ---------------------------------------------------------
     ✅ Leaderboard loader (ONLY players who have points)
  --------------------------------------------------------- */
  useEffect(() => {
    if (!session?.id) return;
    if (wallPhase !== "leaderboard") return;

    let cancelled = false;

    async function loadLeaderboard() {
      if (lastLeaderRowsRef.current.length === 0) setLeaderLoading(true);

      const { data: players, error: playersErr } = await supabase
        .from("trivia_players")
        .select("id,status,guest_id,display_name,photo_url")
        .eq("session_id", session.id)
        .in("status", ["approved", "active"]);

      if (playersErr || !players || players.length === 0) {
        if (!cancelled) {
          if (!sameLeaderRows([], lastLeaderRowsRef.current)) {
            lastLeaderRowsRef.current = [];
            setLeaderRows([]);
          }
          setLeaderLoading(false);
        }
        return;
      }

      const playerIds = players.map((p: any) => p.id);
      const guestIds = players.map((p: any) => p.guest_id).filter(Boolean);

      const { data: answers, error: answersErr } = await supabase
        .from("trivia_answers")
        .select("player_id,points,question_id,is_correct")
        .in("player_id", playerIds);

      if (answersErr) {
        console.error("❌ trivia_answers fetch error:", answersErr);
        if (!cancelled) setLeaderLoading(false);
        return;
      }

      const totals = new Map<string, number>();
      const byPlayer = new Map<string, any[]>();

      for (const a of answers || []) {
        const pid = (a as any).player_id as string;

        const pts =
          typeof (a as any).points === "number" ? (a as any).points : 0;

        totals.set(pid, (totals.get(pid) || 0) + pts);

        if (!byPlayer.has(pid)) byPlayer.set(pid, []);
        byPlayer.get(pid)!.push(a);
      }

      // ✅ streaks computed from latest answered question in your questions[] order
      const streaks = new Map<string, number>();

      byPlayer.forEach((arr, pid) => {
        streaks.set(
          pid,
          computeStreakEndingAtLatestAnswered({
            answers: (arr as any) || [],
            questions,
          })
        );
      });

      const guestMap = new Map<
        string,
        { name: string; selfieUrl: string | null }
      >();

      if (guestIds.length > 0) {
        const { data: guests, error: guestsErr } = await supabase
          .from("guest_profiles")
          .select(
            "id,first_name,last_name,photo_url,selfie_url,avatar_url,image_url,profile_photo_url"
          )
          .in("id", guestIds);

        if (guestsErr) {
          console.warn("⚠️ guest_profiles fetch error:", guestsErr);
        } else {
          for (const g of guests || []) {
            guestMap.set((g as any).id, {
              name: formatName((g as any)?.first_name, (g as any)?.last_name),
              selfieUrl: pickSelfieUrl(g),
            });
          }
        }
      }

      const built: LeaderRow[] = players
        .map((p: any) => {
          const guest = p.guest_id ? guestMap.get(p.guest_id) : undefined;
          const safeName = guest?.name || formatDisplayName(p.display_name);
          const safeSelfie = guest?.selfieUrl || p.photo_url || null;

          return {
            rank: 0,
            name: safeName,
            points: totals.get(p.id) || 0,
            selfieUrl: safeSelfie,
            streak: streaks.get(p.id) || 0,
          };
        })
        .filter((r) => r.points > 0)
        .sort((a, b) => b.points - a.points)
        .map((r, idx) => ({ ...r, rank: idx + 1 }));

      if (!cancelled) {
        if (!sameLeaderRows(built, lastLeaderRowsRef.current)) {
          lastLeaderRowsRef.current = built;
          setLeaderRows(built);
        }
        setLeaderLoading(false);
      }
    }

    loadLeaderboard();
    const id = window.setInterval(loadLeaderboard, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [session?.id, wallPhase, questions]);

  /* ---------------------------------------------------------
     ✅ Auto-scroll leaderboard down then back up
  --------------------------------------------------------- */
  useEffect(() => {
    if (view !== "leaderboard") return;

    const el = leaderScrollRef.current;
    if (!el) return;

    const canScroll = el.scrollHeight - el.clientHeight > 8;
    if (!canScroll) return;

    let cancelled = false;
    let dir: 1 | -1 = 1;
    let pauseUntil = 0;

    const stepPx = 1.2;
    const tickMs = 22;

    const tick = () => {
      if (cancelled) return;

      const now = Date.now();
      if (now < pauseUntil) return;

      const max = el.scrollHeight - el.clientHeight;
      const next = el.scrollTop + dir * stepPx;

      if (next >= max) {
        el.scrollTop = max;
        dir = -1;
        pauseUntil = now + 850;
        return;
      }

      if (next <= 0) {
        el.scrollTop = 0;
        dir = 1;
        pauseUntil = now + 850;
        return;
      }

      el.scrollTop = next;
    };

    const id = window.setInterval(tick, tickMs);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [view, leaderRows.length]);

  /* ---------------------------------------------------------
     Answer submission
  --------------------------------------------------------- */
  async function handleSelectAnswer(idx: number) {
    if (!currentQuestion) return;
    if (!playerId) return;

    if (isPaused || !isRunning) return;
    if (hasAnswered || locked) return;
    if (wallPhase !== "question") return;
    if (isCountdownRunning) return;
    if (isSessionOver) return;

    if (removedWrongIndices.has(idx) && selectedIndex !== idx) return;

    setSelectedIndex(idx);
    setHasAnswered(true);

    const { data: existing, error: existingErr } = await supabase
      .from("trivia_answers")
      .select("id")
      .eq("player_id", playerId)
      .eq("question_id", currentQuestion.id)
      .maybeSingle();

    if (existingErr) {
      console.error("❌ trivia_answers existing check error:", existingErr);
    }
    if (existing) return;

    const isCorrect = idx === currentQuestion.correct_index;

    // --- base points (time-based)
    const basePoints = isCorrect
      ? (() => {
          const nowMs = Date.now() + serverOffsetMs;

          const effectiveStartMs =
            getEffectiveQuestionStartMs({
              questionStartedAt,
              currentQuestionNumber: session?.current_question ?? null,
              countdownStartedAt,
              countdownSeconds,
            }) ?? nowMs;

          // clamp: if user answers during countdown/grace, treat elapsed as 0
          const safeNowMs = Math.max(nowMs, effectiveStartMs);

          try {
            return computeTriviaPoints({
              scoringMode,
              timerSeconds,
              questionStartedAt: new Date(effectiveStartMs).toISOString(),
              nowMs: safeNowMs,
            } as any);
          } catch {
            return computeTriviaPoints({
              scoringMode,
              timerSeconds,
              questionStartedAt: new Date(effectiveStartMs).toISOString(),
            } as any);
          }
        })()
      : 0;

    // --- streak bonus (optional)
    let bonusPct = 0;

    if (streakMultiplierEnabled && isCorrect) {
      const { data: prev, error: prevErr } = await supabase
        .from("trivia_answers")
        .select("question_id,is_correct")
        .eq("player_id", playerId);

      if (!prevErr && Array.isArray(prev)) {
        const streakBefore = computeStreakBeforeCurrentQuestion({
          answers: prev as any,
          questions,
          currentQuestionIndex,
        });

        const streakAfter = streakBefore + 1;
        bonusPct = streakBonusPct(streakAfter);
      }
    }

    const points = isCorrect ? Math.round(basePoints * (1 + bonusPct)) : 0;

    const { error: insertErr } = await supabase.from("trivia_answers").insert({
      player_id: playerId,
      question_id: currentQuestion.id,
      selected_index: idx,
      is_correct: isCorrect,
      points,
    });

    if (insertErr) {
      console.error("❌ trivia_answers insert error:", insertErr);
    }
  }

  /* ---------------------------------------------------------
     Render states
  --------------------------------------------------------- */
  if (!gameId) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#020617",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          textAlign: "center",
        }}
      >
        Missing game id. Please re-open the trivia link.
      </div>
    );
  }

  if (!profile) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#020617",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          textAlign: "center",
        }}
      >
        Loading your profile…
      </div>
    );
  }

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#020617",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          textAlign: "center",
        }}
      >
        {loadingMessage}
      </div>
    );
  }

  if (!session || !questions.length || !currentQuestion) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#020617",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          textAlign: "center",
        }}
      >
        Waiting for the host to start the game…
      </div>
    );
  }

  const pctWidth = Math.max(0, Math.min(100, progress * 100));

  let footerText = "";
  if (!isRunning) {
    footerText = "Game is paused. Waiting for the host…";
  } else if (wallPhase === "leaderboard") {
    footerText = "Leaderboard — next question starting soon…";
  } else if (wallPhase === "overlay") {
    footerText = "Time is up. Revealing the correct answer…";
  } else if (wallPhase === "reveal") {
    footerText = "Here’s the correct answer. Waiting for leaderboard…";
  } else if (hasAnswered) {
    footerText = "Answer submitted. You can’t change it for this question.";
  } else if (wrongRemovalLevel === 1) {
    footerText = "One wrong answer has been removed.";
  } else if (wrongRemovalLevel === 2) {
    footerText = "Two wrong answers have been removed.";
  } else {
    footerText = "Tap an answer to lock in your choice.";
  }

  const bg =
    trivia?.background_type === "image"
      ? `url(${trivia.background_value}) center/cover no-repeat`
      : trivia?.background_value || FALLBACK_BG;

  const brightness =
    typeof trivia?.background_brightness === "number"
      ? trivia.background_brightness
      : 100;

  // ✅ Herd chip should only show during active question phase (matches wall behavior)
  const herdUiActive =
    highlightTheHerdEnabled &&
    isRunning &&
    wallPhase === "question" &&
    !revealAnswer &&
    !isCountdownRunning &&
    !isSessionOver;

  return (
    <>
      <div
        style={{
          minHeight: "100vh",
          background: bg,
          filter: `brightness(${brightness}%)`,
          color: "#fff",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          position: "relative",
        }}
      >
        {/* HEADER ROW */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 8,
              background: "rgba(15,23,42,0.95)",
              border: "2px solid rgba(148,163,184,0.9)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.7rem",
              fontWeight: 700,
              marginRight: 10,
              letterSpacing: 0.5,
              overflow: "hidden",
            }}
          >
            {hostLogoUrl ? (
              <img
                src={hostLogoUrl}
                alt="Host Logo"
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            ) : (
              "LOGO"
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: "0.95rem",
                fontWeight: 700,
                letterSpacing: 0.3,
              }}
            >
              {trivia?.public_name || "Trivia Game"}
            </div>
            <div style={{ fontSize: "0.75rem", opacity: 0.75, marginTop: 2 }}>
              {view === "leaderboard"
                ? "Leaderboard"
                : `Question ${currentQuestionIndex + 1} of ${questions.length}`}
            </div>
          </div>
        </div>

        {/* QUESTION BOX */}
        <div
          style={{
            padding: 18,
            borderRadius: 16,
            background: "rgba(15,23,42,0.9)",
            border: "1px solid rgba(148,163,184,0.4)",
            marginBottom: 10,
            minHeight: 130,
            display: "flex",
            alignItems: "center",
          }}
        >
          <div
            style={{
              fontSize: "1.05rem",
              fontWeight: 700,
              lineHeight: 1.4,
              wordWrap: "break-word",
              textAlign: "center",
              width: "100%",
            }}
          >
            {view === "leaderboard"
              ? "Leaderboard — Top Players"
              : currentQuestion.question_text}
          </div>
        </div>

        {/* TIMER */}
        {view === "question" && (
          <div
            style={{
              marginBottom: 16,
              width: "100%",
              borderRadius: 999,
              background: "rgba(15,23,42,0.85)",
              border: "1px solid rgba(34,197,94,0.5)",
              overflow: "hidden",
              position: "relative",
              height: 26,
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${pctWidth}%`,
                background:
                  locked || revealAnswer || wallPhase !== "question"
                    ? "linear-gradient(90deg,#ef4444,#dc2626)"
                    : "linear-gradient(90deg,#22c55e,#16a34a,#15803d)",
                transition: "width 0.1s linear, background 0.2s ease",
              }}
            />
          </div>
        )}

        {/* ANSWERS / LEADERBOARD LIST */}
        <div
          ref={view === "leaderboard" ? leaderScrollRef : undefined}
          style={{
            display: "grid",
            gap: 10,
            marginBottom: 10,
            flex: "1 1 auto",
            minHeight: 0,
            overflowY: "auto",
            paddingRight: 2,
            alignContent: "flex-start",
          }}
        >
          {view === "leaderboard" && (
            <>
              {leaderLoading && (
                <div
                  style={{
                    background: "rgba(15,23,42,0.85)",
                    border: "1px solid rgba(148,163,184,0.35)",
                    borderRadius: 16,
                    padding: 14,
                    textAlign: "center",
                    opacity: 0.9,
                  }}
                >
                  Loading leaderboard…
                </div>
              )}

              {!leaderLoading && leaderRows.length === 0 && (
                <div
                  style={{
                    background: "rgba(15,23,42,0.85)",
                    border: "1px solid rgba(148,163,184,0.35)",
                    borderRadius: 16,
                    padding: 14,
                    textAlign: "center",
                    opacity: 0.9,
                  }}
                >
                  No scores yet.
                </div>
              )}

              {!leaderLoading &&
                leaderRows.map((row) => {
                  const hasHotStreak =
                    row.points > 0 && (row.streak ?? 0) >= 2;

                  return (
                    <div
                      key={`${row.rank}-${row.name}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 12px",
                        borderRadius: 18,
                        background: "rgba(15,23,42,0.85)",
                        border: "1px solid rgba(148,163,184,0.35)",
                      }}
                    >
                      <div
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 999,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 900,
                          background: "rgba(59,130,246,0.35)",
                          border: "1px solid rgba(147,197,253,0.55)",
                          flexShrink: 0,
                        }}
                      >
                        {row.rank}
                      </div>

                      <div
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 999,
                          overflow: "hidden",
                          border: "1px solid rgba(226,232,240,0.6)",
                          background: "rgba(2,6,23,0.6)",
                          flexShrink: 0,
                        }}
                      >
                        {row.selfieUrl ? (
                          <img
                            src={row.selfieUrl}
                            alt=""
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                            }}
                          />
                        ) : null}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 800,
                            fontSize: "0.95rem",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {row.name}
                        </div>

                        <div
                          style={{
                            fontSize: "0.75rem",
                            opacity: 0.75,
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            marginTop: 2,
                          }}
                        >
                          <span>Points</span>

                          {hasHotStreak && (
                            <span
                              style={{
                                padding: "2px 8px",
                                borderRadius: 999,
                                border:
                                  "1px solid rgba(251,191,36,0.75)",
                                background:
                                  "rgba(251,191,36,0.15)",
                                fontSize: "0.7rem",
                                fontWeight: 800,
                                letterSpacing: 0.4,
                                textTransform: "uppercase",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              <span aria-hidden="true">🔥</span>
                              <span>{row.streak}x Streak</span>
                            </span>
                          )}
                        </div>
                      </div>

                      <div
                        style={{
                          fontWeight: 900,
                          fontSize: "1.1rem",
                          letterSpacing: 0.2,
                        }}
                      >
                        {row.points}
                      </div>
                    </div>
                  );
                })}
            </>
          )}

          {view === "question" &&
            currentQuestion.options.map((opt: string, idx: number) => {
              const chosen = selectedIndex === idx;
              const isCorrectChoice =
                typeof currentQuestion.correct_index === "number" &&
                idx === currentQuestion.correct_index;

              const isRemoved =
                removedWrongIndices.has(idx) && !chosen && !revealAnswer;

              const disabled =
                hasAnswered ||
                locked ||
                wallPhase !== "question" ||
                isCountdownRunning ||
                isSessionOver ||
                isPaused ||
                isRemoved;

              // ✅ Herd label + top highlight (matches wall behavior)
              const herdLabel =
                herdUiActive && !isRemoved ? herd.labelForIndex(idx) : "";

              const isHerdTop =
                herdUiActive &&
                herdTopIndex === idx &&
                !isRemoved &&
                !chosen &&
                !revealAnswer;

              let bgBtn = "rgba(15,23,42,0.85)";
              let border = "1px solid rgba(148,163,184,0.4)";
              let opacityBtn = 1;
              let boxShadow = "none";

              let badgeBg = chosen
                ? "rgba(15,23,42,0.2)"
                : "rgba(15,23,42,0.7)";
              let badgeBorder = "1px solid rgba(226,232,240,0.8)";

              const gotItRightPulse = revealAnswer && chosen && isCorrectChoice;

              if (isRemoved) {
                bgBtn = "rgba(2,6,23,0.55)";
                border = "1px dashed rgba(148,163,184,0.55)";
                opacityBtn = 0.45;
                badgeBg = "rgba(2,6,23,0.55)";
                badgeBorder = "1px dashed rgba(148,163,184,0.55)";
              }

              if (!revealAnswer && chosen) {
                bgBtn = "linear-gradient(90deg,#22c55e,#15803d)";
                border = "1px solid rgba(240,253,250,0.9)";
                boxShadow = "0 0 12px rgba(74,222,128,0.6)";
              }

              if (revealAnswer) {
                if (isCorrectChoice) {
                  bgBtn = "linear-gradient(90deg,#22c55e,#16a34a)";
                  border = "2px solid rgba(74,222,128,1)";
                  boxShadow = gotItRightPulse
                    ? "0 0 26px rgba(74,222,128,1)"
                    : "0 0 20px rgba(74,222,128,0.9)";

                  badgeBg = "rgba(22,163,74,0.2)";
                  badgeBorder = "2px solid rgba(74,222,128,1)";
                } else if (chosen && !isCorrectChoice) {
                  bgBtn = "linear-gradient(90deg,#ef4444,#b91c1c)";
                  border = "2px solid rgba(248,113,113,1)";
                  boxShadow = "0 0 16px rgba(248,113,113,0.9)";

                  badgeBg = "rgba(127,29,29,0.8)";
                  badgeBorder = "2px solid rgba(248,113,113,1)";
                } else {
                  opacityBtn = 0.4;
                }
              } else if (disabled && !chosen) {
                opacityBtn = Math.min(opacityBtn, 0.7);
              }

              // ✅ Herd top glow (only during question)
              if (isHerdTop) {
                border = "2px solid rgba(190,242,100,0.85)";
                boxShadow = "0 0 18px rgba(190,242,100,0.45)";
              }

              return (
                <button
                  key={idx}
                  onClick={() => handleSelectAnswer(idx)}
                  disabled={disabled}
                  style={{
                    width: "100%",
                    padding: "6px 12px",
                    borderRadius: 20,
                    background: bgBtn,
                    border,
                    opacity: opacityBtn,
                    color: "#fff",
                    textAlign: "left",
                    display: "flex",
                    alignItems: "center",
                    gap: 15,
                    fontSize: "0.95rem",
                    fontWeight: chosen ? 700 : 500,
                    minHeight: 72,
                    boxShadow,
                    transition:
                      "opacity 0.25s ease, border 0.25s ease, background 0.25s ease, box-shadow 0.3s ease",
                    animation: gotItRightPulse
                      ? "fiCorrectPulse 1.25s ease-in-out infinite alternate"
                      : "none",
                    cursor: disabled ? "not-allowed" : "pointer",
                  }}
                >
                  <span
                    style={{
                      width: 60,
                      height: 60,
                      borderRadius: "999px",
                      border: badgeBorder,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "2.0rem",
                      background: badgeBg,
                      flexShrink: 0,
                    }}
                  >
                    {String.fromCharCode(65 + idx)}
                  </span>

                  <span
                    style={{
                      flex: 1,
                      lineHeight: 1.3,
                      wordWrap: "break-word",
                      whiteSpace: "normal",
                      opacity: isRemoved ? 0.9 : 1,
                      textDecoration: isRemoved ? "line-through" : "none",
                    }}
                  >
                    {isRemoved ? "Removed" : opt}

                    {!!herdLabel && (
                      <div style={{ marginTop: 6 }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "4px 10px",
                            borderRadius: 999,
                            fontSize: "0.75rem",
                            fontWeight: 800,
                            letterSpacing: 0.2,
                            background: "rgba(255,255,255,0.10)",
                            border: "1px solid rgba(255,255,255,0.18)",
                            opacity: 0.95,
                          }}
                        >
                          {herdLabel}
                        </span>
                      </div>
                    )}
                  </span>
                </button>
              );
            })}
        </div>

        {/* AD SLOT */}
        <div
          style={{
            marginBottom: 10,
            padding: 0,
            borderRadius: 16,
            border: "1px solid rgba(148,163,184,0.35)",
            background: "rgba(15,23,42,0.65)",
            height: 160,
            overflow: "hidden",
            display: adsEnabled ? "flex" : "none",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          {adsLoading ? (
            <div style={{ fontSize: "0.95rem", opacity: 0.9, padding: 16 }}>
              Loading ad…
            </div>
          ) : lockedAd?.url ? (
            isVideo ? (
              <video
                src={lockedAd.url}
                muted
                playsInline
                autoPlay
                loop
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  objectPosition: "center",
                  display: "block",
                  background: "rgba(0,0,0,0.35)",
                }}
              />
            ) : (
              <img
                src={lockedAd.url}
                alt=""
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: "center",
                  display: "block",
                }}
              />
            )
          ) : null}
        </div>

        {/* FOOTER */}
        <div
          style={{
            textAlign: "center",
            fontSize: "0.8rem",
            opacity: 0.8,
            paddingBottom: 8,
          }}
        >
          {footerText}
        </div>

        {/* OVERLAY */}
        {showAnswerOverlay && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.75)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 50,
            }}
          >
            <div
              style={{
                textAlign: "center",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              <div
                style={{
                  fontFamily:
                    "'SF Pro Display', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                  fontSize: "2rem",
                  fontWeight: 900,
                  marginBottom: "0.5rem",
                  color: "#e5f1ff",
                  textShadow:
                    "0 0 2px #000000, 0 0 6px #000000, 0 0 18px rgba(15,23,42,0.9), 0 0 36px rgba(15,23,42,0.9), 0 0 72px rgba(59,130,246,0.9)",
                  padding: "0.4em 1.2em",
                  borderRadius: 18,
                  background:
                    "radial-gradient(circle at 50% 50%, rgba(59,130,246,0.65), rgba(15,23,42,0.0))",
                  boxShadow:
                    "0 0 30px rgba(59,130,246,0.9), 0 0 70px rgba(59,130,246,0.85)",
                }}
              >
                THE ANSWER IS…
              </div>
            </div>
          </div>
        )}

        {/* ✅ PRE-GAME COUNTDOWN OVERLAY (LOCKED TO INACTIVE WALL) */}
        {isCountdownRunning && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.75)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 80,
              padding: 20,
              textAlign: "center",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "1.2rem",
                  fontWeight: 900,
                  letterSpacing: 1,
                  opacity: 0.9,
                  textTransform: "uppercase",
                }}
              >
                GAME STARTING IN
              </div>

              <div
                style={{
                  fontSize: "clamp(4rem,10vw,7rem)",
                  fontWeight: 1000,
                  marginTop: 10,
                  textShadow: "0 0 30px rgba(0,0,0,0.75)",
                }}
              >
                {Math.floor(countdownRemaining / 60)}:
                {Math.floor(countdownRemaining % 60)
                  .toString()
                  .padStart(2, "0")}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ✅ SESSION OVER OVERLAY */}
      {isSessionOver && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 20,
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 520,
              background: "rgba(15,23,42,0.92)",
              border: "1px solid rgba(148,163,184,0.35)",
              borderRadius: 22,
              padding: "22px 18px",
              boxShadow: "0 0 40px rgba(0,0,0,0.55)",
            }}
          >
            <div
              style={{
                fontSize: "1.25rem",
                fontWeight: 1000,
                letterSpacing: 1,
                textTransform: "uppercase",
                marginBottom: 10,
              }}
            >
              This Trivia Session Is Over
            </div>

            <div
              style={{
                opacity: 0.85,
                fontSize: "0.95rem",
                marginBottom: 16,
              }}
            >
              Thanks for playing!
            </div>

            {/* ➕ NEW: Continue to Next Round (send to /thanks/[id]?type=trivia) */}
            <button
              onClick={handleContinueToNextRound}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 16,
                border: "1px solid rgba(59,130,246,0.6)",
                background: "linear-gradient(90deg,#3b82f6,#0ea5e9)",
                color: "#fff",
                fontWeight: 900,
                fontSize: "1rem",
                cursor: "pointer",
                marginBottom: 10,
              }}
            >
              Continue to Next Round
            </button>

            {/* Existing Close button */}
            <button
              onClick={handleCloseTab}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 16,
                border: "1px solid rgba(148,163,184,0.45)",
                background: "linear-gradient(90deg,#ef4444,#b91c1c)",
                color: "#fff",
                fontWeight: 900,
                fontSize: "1rem",
                cursor: "pointer",
              }}
            >
              Close
            </button>

            <div
              style={{
                marginTop: 10,
                fontSize: "0.75rem",
                opacity: 0.65,
              }}
            >
              If your browser blocks tab closing, just close this tab manually.
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fiCorrectPulse {
          0% {
            transform: scale(1);
            box-shadow: 0 0 16px rgba(74, 222, 128, 0.7);
          }
          100% {
            transform: scale(1.04);
            box-shadow: 0 0 26px rgba(74, 222, 128, 1),
              0 0 46px rgba(22, 163, 74, 0.9);
          }
        }
      `}</style>
    </>
  );
}
