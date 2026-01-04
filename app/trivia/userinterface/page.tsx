"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { computeTriviaPoints } from "@/lib/trivia/triviaScoringEngine";

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
      (a[i].selfieUrl || null) !== (b[i].selfieUrl || null)
    ) {
      return false;
    }
  }
  return true;
}

/**
 * ✅ FIX FOR “Q1 then jumps to Q3/Q8”
 * Do NOT rely on SQL ordering when round_number/question_number are partially filled.
 *
 * Rule:
 * - ONLY use question_number if every question has it
 * - ELSE ONLY use round_number if every question has it
 * - ELSE fall back to created_at (stable insertion order)
 */
type QuestionOrderMode = "question_number" | "round_number" | "created_at";

function normalizeQuestions(qsRaw: any[]): { list: any[]; mode: QuestionOrderMode } {
  const list = Array.isArray(qsRaw) ? [...qsRaw] : [];
  if (!list.length) return { list: [], mode: "created_at" };

  const hasAllQN = list.every(
    (q) => typeof q?.question_number === "number" && Number.isFinite(q.question_number)
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
    if (mode === "question_number") return a.question_number - b.question_number;
    if (mode === "round_number") return a.round_number - b.round_number;
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
   Component
--------------------------------------------------------- */
const FALLBACK_BG =
  "radial-gradient(circle at top,#1d4ed8 0,#020617 55%,#000 100%)";

export default function TriviaUserInterfacePage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const gameId = searchParams.get("game"); // trivia_cards.id

  const [profile, setProfile] = useState<any>(null);
  const [trivia, setTrivia] = useState<any>(null);
  const [session, setSession] = useState<TriviaSession | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);

  const [questions, setQuestions] = useState<any[]>([]);
  const [questionOrderMode, setQuestionOrderMode] = useState<QuestionOrderMode>("created_at");

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

  // server-time offset
  const [serverOffsetMs, setServerOffsetMs] = useState<number>(0);

  // ads
  const [hostRow, setHostRow] = useState<HostRow | null>(null);
  const [ads, setAds] = useState<SlideAd[]>([]);
  const [adsLoading, setAdsLoading] = useState(false);

  // per-game trivia switch (poll this)
  const [adsEnabled, setAdsEnabled] = useState<boolean>(false);

  // lock ad to question number (prevents mid-question jumping)
  const [adLockedQuestion, setAdLockedQuestion] = useState<number>(1);
  const [lockedAdIndex, setLockedAdIndex] = useState<number>(0);

  // ✅ PATCH: leaderboard flicker guard
  const lastLeaderRowsRef = useRef<LeaderRow[]>([]);
  const leaderScrollRef = useRef<HTMLDivElement | null>(null);

  /* ---------------------------------------------------------
     ✅ COUNTDOWN TIMER (LOCKED TO INACTIVE WALL)
  --------------------------------------------------------- */
  const [countdownSeconds, setCountdownSeconds] = useState<number>(10);
  const [countdownActive, setCountdownActive] = useState<boolean>(false);
  const [countdownStartedAt, setCountdownStartedAt] = useState<string | null>(null);

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

      // 1) trivia card (includes ads_enabled)
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
          background_brightness,
          ads_enabled,
          countdown_seconds,
          countdown_active,
          countdown_started_at
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
      setAdsEnabled(Boolean((card as any).ads_enabled));

      // ✅ countdown state seed
      setCountdownSeconds(
        typeof (card as any).countdown_seconds === "number"
          ? (card as any).countdown_seconds
          : 10
      );
      setCountdownActive(Boolean((card as any).countdown_active));
      setCountdownStartedAt((card as any).countdown_started_at ?? null);

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

      // 5) questions (✅ no SQL ordering traps)
      setLoadingMessage("Loading questions…");

      const { data: qsRaw, error: qErr } = await supabase
        .from("trivia_questions")
        .select(
          "id, question_number, round_number, question_text, options, correct_index, is_active, created_at"
        )
        .eq("trivia_card_id", gameId)
        .eq("is_active", true);

      if (cancelled) return;

      if (qErr || !qsRaw) {
        console.error("❌ trivia_questions fetch error (UI):", qErr);
        setLoadingMessage("No questions are available for this game.");
        setLoading(false);
        return;
      }

      const { list, mode } = normalizeQuestions(qsRaw || []);
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
     Subscribe to trivia_cards countdown fields
  --------------------------------------------------------- */
  useEffect(() => {
    if (!gameId) return;

    const ch = supabase
      .channel(`trivia-cards-ui-${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "trivia_cards",
          filter: `id=eq.${gameId}`,
        },
        (payload: any) => {
          const next = payload?.new;
          if (!next) return;

          if (typeof next.countdown_seconds === "number") {
            setCountdownSeconds(next.countdown_seconds);
          }
          setCountdownActive(next.countdown_active === true);
          setCountdownStartedAt(next.countdown_started_at ?? null);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [gameId]);

  /* ---------------------------------------------------------
     Poll trivia_cards.ads_enabled every 5 seconds (mid-game toggle)
  --------------------------------------------------------- */
  useEffect(() => {
    if (!gameId) return;
    let cancelled = false;

    const poll = async () => {
      const { data, error } = await supabase
        .from("trivia_cards")
        .select("ads_enabled")
        .eq("id", gameId)
        .maybeSingle();

      if (cancelled) return;
      if (error || !data) return;

      setAdsEnabled(Boolean((data as any).ads_enabled));
    };

    poll();
    const id = window.setInterval(poll, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [gameId]);

  /* ---------------------------------------------------------
     Load Slide Ads when allowed (GLOBAL + TRIVIA)
     NOTE: This page NEVER writes to trivia_sessions. Ads are display-only.
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
      setAdLockedQuestion((prevQ) => (q !== prevQ ? q : prevQ));
    };

    doPoll();
    const id = window.setInterval(doPoll, 1000);
    return () => window.clearInterval(id);
  }, [session?.id, gameId]);

  /* ---------------------------------------------------------
     Derived current question (✅ safe ordering)
  --------------------------------------------------------- */
  const timerSeconds: number = trivia?.timer_seconds ?? 30;
  const scoringMode: string = trivia?.scoring_mode ?? "100s";

  const isRunning = session?.status === "running";
  const currentQuestionNumber = Number(session?.current_question ?? 1);

  const currentQuestion = useMemo(() => {
    return pickQuestionForCurrent(questions, currentQuestionNumber, questionOrderMode);
  }, [questions, currentQuestionNumber, questionOrderMode]);

  const totalQuestions = questions.length;

  const wallPhase = (session?.wall_phase || "question") as
    | "question"
    | "overlay"
    | "reveal"
    | "leaderboard"
    | "podium";

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

    if (wallPhase !== "question") setLocked(true);
  }, [wallPhase]);

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

    setLocked(wallPhase !== "question");
    setProgress(1);
    setSecondsLeft(timerSeconds);
  }, [currentQuestion?.id, timerSeconds, wallPhase]);

  /* ---------------------------------------------------------
     TIMER: source of truth = questionStartedAt
  --------------------------------------------------------- */
  useEffect(() => {
    if (timerIntervalRef.current !== null) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (
      !isRunning ||
      !currentQuestion ||
      !questionStartedAt ||
      wallPhase !== "question"
    ) {
      if (wallPhase !== "question") {
        setProgress(0);
        setSecondsLeft(0);
      } else {
        setProgress(1);
        setSecondsLeft(timerSeconds);
      }
      return;
    }

    const durationMs = (timerSeconds || 30) * 1000;
    const startedMs = new Date(questionStartedAt).getTime();

    const updateFromDbTime = () => {
      const now = Date.now() + serverOffsetMs;
      const elapsed = now - startedMs;
      const remaining = Math.max(0, durationMs - elapsed);
      const frac = remaining / durationMs;

      setProgress(frac);
      const secs = Math.max(0, Math.ceil(remaining / 1000));
      setSecondsLeft(secs);

      if (remaining <= 0) setLocked(true);
    };

    updateFromDbTime();
    timerIntervalRef.current = window.setInterval(updateFromDbTime, 100);

    return () => {
      if (timerIntervalRef.current !== null) {
        window.clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [
    isRunning,
    currentQuestion?.id,
    questionStartedAt,
    timerSeconds,
    serverOffsetMs,
    wallPhase,
  ]);

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
        .select("player_id,points")
        .in("player_id", playerIds);

      if (answersErr) {
        console.error("❌ trivia_answers fetch error:", answersErr);
        if (!cancelled) setLeaderLoading(false);
        return;
      }

      const totals = new Map<string, number>();
      for (const a of answers || []) {
        const pts = typeof (a as any).points === "number" ? (a as any).points : 0;
        totals.set(
          (a as any).player_id,
          (totals.get((a as any).player_id) || 0) + pts
        );
      }

      const guestMap = new Map<string, { name: string; selfieUrl: string | null }>();

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
  }, [session?.id, wallPhase]);

  /* ---------------------------------------------------------
     ✅ Auto-scroll leaderboard
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
    if (hasAnswered || locked) return;
    if (wallPhase !== "question") return;
    if (isCountdownRunning) return;

    setSelectedIndex(idx);
    setHasAnswered(true);

    const { data: existing, error: existingErr } = await supabase
      .from("trivia_answers")
      .select("id")
      .eq("player_id", playerId)
      .eq("question_id", currentQuestion.id)
      .maybeSingle();

    if (existingErr) console.error("❌ trivia_answers existing check error:", existingErr);
    if (existing) return;

    const isCorrect = idx === currentQuestion.correct_index;

    const points = isCorrect
      ? (() => {
          const nowMs = Date.now() + serverOffsetMs;
          try {
            // @ts-ignore
            return computeTriviaPoints({
              scoringMode,
              timerSeconds,
              questionStartedAt: questionStartedAt ?? null,
              nowMs,
            });
          } catch {
            return computeTriviaPoints({
              scoringMode,
              timerSeconds,
              questionStartedAt: questionStartedAt ?? null,
            } as any);
          }
        })()
      : 0;

    const { error: insertErr } = await supabase.from("trivia_answers").insert({
      player_id: playerId,
      question_id: currentQuestion.id,
      selected_index: idx,
      is_correct: isCorrect,
      points,
    });

    if (insertErr) console.error("❌ trivia_answers insert error:", insertErr);
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
                : `Question ${Math.max(1, Math.min(totalQuestions, currentQuestionNumber))} of ${totalQuestions}`}
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
                leaderRows.map((row) => (
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
                      <div style={{ fontSize: "0.75rem", opacity: 0.75 }}>
                        Points
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
                ))}
            </>
          )}

          {view === "question" &&
            (Array.isArray(currentQuestion.options) ? currentQuestion.options : []).map(
              (opt: string, idx: number) => {
                const chosen = selectedIndex === idx;
                const isCorrectChoice =
                  typeof currentQuestion.correct_index === "number" &&
                  idx === currentQuestion.correct_index;

                const disabled =
                  hasAnswered ||
                  locked ||
                  wallPhase !== "question" ||
                  isCountdownRunning;

                let bgBtn = "rgba(15,23,42,0.85)";
                let border = "1px solid rgba(148,163,184,0.4)";
                let opacityBtn = 1;
                let boxShadow = "none";

                const gotItRightPulse = revealAnswer && chosen && isCorrectChoice;

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
                  } else if (chosen && !isCorrectChoice) {
                    bgBtn = "linear-gradient(90deg,#ef4444,#b91c1c)";
                    border = "2px solid rgba(248,113,113,1)";
                    boxShadow = "0 0 16px rgba(248,113,113,0.9)";
                  } else {
                    opacityBtn = 0.4;
                  }
                } else if (disabled && !chosen) {
                  opacityBtn = 0.7;
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
                    }}
                  >
                    <span
                      style={{
                        width: 60,
                        height: 60,
                        borderRadius: "999px",
                        border: "1px solid rgba(226,232,240,0.8)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "2.0rem",
                        background: chosen
                          ? "rgba(15,23,42,0.2)"
                          : "rgba(15,23,42,0.7)",
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
                      }}
                    >
                      {opt}
                    </span>
                  </button>
                );
              }
            )}
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

        {/* ✅ PRE-GAME COUNTDOWN OVERLAY */}
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
