"use client";

import { useEffect, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { AnimatePresence, motion } from "framer-motion";
import { getSupabaseClient } from "@/lib/supabaseClient";
import TriviaPodum from "@/app/trivia/layouts/triviapodum";

const supabase = getSupabaseClient();

/* ---------- TYPES ---------- */
interface TriviaActiveWallProps {
  trivia: any; // Full trivia row from DB
  running?: boolean; // optional, not required
}

type TopRankRow = {
  place: 1 | 2 | 3;
  playerId: string;
  guestId?: string | null;
  name: string;
  selfieUrl?: string | null;
  points: number;
};

type LeaderRow = {
  rank: number;
  playerId: string;
  guestId?: string | null;
  name: string;
  selfieUrl?: string | null;
  points: number;
};

// ✅ wall authority phases
type WallPhase = "question" | "overlay" | "reveal" | "leaderboard" | "podium";
type WallView = "question" | "leaderboard" | "podium";

/* ---------------------------------------------------- */
/* QR + LOGO CONTROL                                    */
/* ---------------------------------------------------- */
const QR_CTRL = {
  bottom: "7.5vh",
  left: "4vw",
  size: 210,
  opacity: 0.35,
};

const LOGO_CTRL = {
  top: "3vh",
  right: "1vw",
  width: 150,
  height: 150,
  opacity: 0.85,
};

/* ---------------------------------------------------- */
/* RANKINGS CONTROL (ADJUST HERE)                        */
/* ---------------------------------------------------- */
const RANKINGS_CTRL = {
  bottom: "10.5vh",
  centerLeft: "50%",
  offsetX: "0px",
  groupGap: "8vw",
  avatarSize: 72,
  nameGap: "18px",
  nameMaxWidth: "220px",
  placeTopMargin: "8px",
};

/* ---------------------------------------------------- */
/* LEADERBOARD UI TUNING                                */
/* ---------------------------------------------------- */
const LEADER_UI = {
  titleTop: "9vh",
  listTop: "18vh",
  maxWidth: 1200,
  rowGap: 14,
  rowPadX: 22,
  rowHeight: 86,
  avatar: 64,
};

/* ---------------------------------------------------- */
/* TEMP HOST LOGO STUB                                  */
/* ---------------------------------------------------- */
const fallbackLogo = "/faninteractlogo.png";

/* ---------------------------------------------------- */
/* PHASE DURATIONS (WALL AUTHORITY)                     */
/* ---------------------------------------------------- */
const OVERLAY_MS = 5000; // "THE ANSWER IS"
const REVEAL_MS = 8000; // show correct answer
const LEADERBOARD_MS = 8000; // leaderboard display

// how often to update the bar on WALL (ms)
const WALL_TIMER_STEP_MS = 30;

/* ✅ EXTRA TIME FOR FIRST QUESTION ONLY (visual + lock) */
const FIRST_QUESTION_EXTRA_MS = 8000;

/* ---------------------------------------------------- */
/* HELPERS                                              */
/* ---------------------------------------------------- */
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

function pickPublicName(row: any): string {
  const pn = String(row?.public_name || "").trim();
  if (pn) return pn;

  // backward compat if older data uses `title`
  const t = String(row?.title || "").trim();
  if (t) return t;

  return "Trivia Game";
}

function sameTopRanks(a: TopRankRow[], b: TopRankRow[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].place !== b[i].place ||
      a[i].playerId !== b[i].playerId ||
      a[i].points !== b[i].points ||
      a[i].name !== b[i].name ||
      (a[i].selfieUrl || "") !== (b[i].selfieUrl || "")
    ) {
      return false;
    }
  }
  return true;
}

function sameLeaderRows(a: LeaderRow[], b: LeaderRow[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].playerId !== b[i].playerId ||
      a[i].points !== b[i].points ||
      a[i].name !== b[i].name ||
      (a[i].selfieUrl || "") !== (b[i].selfieUrl || "")
    ) {
      return false;
    }
  }
  return true;
}

/**
 * ✅ FIX FOR “Q1 then jumps to Q4/Q8”
 * Ordering rules described below.
 */
type QuestionOrderMode = "question_number" | "round_number" | "created_at";

function normalizeQuestions(qsRaw: any[]): {
  list: any[];
  mode: QuestionOrderMode;
} {
  const list = Array.isArray(qsRaw) ? [...qsRaw] : [];
  if (!list.length) return { list: [], mode: "created_at" };

  const hasAllQN = list.every(
    (q) =>
      typeof q?.question_number === "number" && Number.isFinite(q.question_number)
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

/* -------------------------------------------------------------------------- */
/* 🎮 TRIVIA ACTIVE WALL                                                       */
/* -------------------------------------------------------------------------- */

export default function TriviaActiveWall({ trivia }: TriviaActiveWallProps) {
  const logoSrc =
    trivia?.host?.branding_logo_url?.trim() ||
    trivia?.host?.logo_url?.trim() ||
    fallbackLogo;

  const bg =
    trivia?.background_type === "image"
      ? `url(${trivia.background_value}) center/cover no-repeat`
      : trivia?.background_value ||
        "linear-gradient(to bottom right,#1b2735,#090a0f)";

  const brightness = trivia?.background_brightness ?? 100;

  /* -------------------------------------------------- */
  /* ✅ LIVE CARD STATUS (PAUSE/RESUME SUPPORT)          */
  /* -------------------------------------------------- */
  const [cardStatus, setCardStatus] = useState<string>(trivia?.status || "idle");
  const [cardCountdownActive, setCardCountdownActive] = useState<boolean>(
    !!trivia?.countdown_active
  );

  useEffect(() => {
    setCardStatus(trivia?.status || "idle");
    setCardCountdownActive(!!trivia?.countdown_active);
  }, [trivia?.id, trivia?.status, trivia?.countdown_active]);

  // Poll card status so the wall reacts instantly to Pause/Resume from dashboard
  useEffect(() => {
    if (!trivia?.id) return;
    let alive = true;

    const poll = async () => {
      const { data, error } = await supabase
        .from("trivia_cards")
        .select("status,countdown_active")
        .eq("id", trivia.id)
        .maybeSingle();

      if (!alive) return;
      if (error || !data) return;

      setCardStatus(data.status);
      setCardCountdownActive(!!data.countdown_active);
    };

    poll();
    const id = window.setInterval(poll, 1000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [trivia?.id]);

  const [view, setView] = useState<WallView>("question");

  const [question, setQuestion] = useState<any>(null);
  const [currentQuestionNumber, setCurrentQuestionNumber] = useState<number | null>(
    null
  );
  const [totalQuestions, setTotalQuestions] = useState<number | null>(null);

  const [questionStartedAt, setQuestionStartedAt] = useState<string | null>(null);

  // ✅ session + wall authority
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<string | null>(null);

  const [wallPhase, setWallPhase] = useState<WallPhase>("question");
  const [wallPhaseStartedAt, setWallPhaseStartedAt] = useState<string | null>(null);

  const [progress, setProgress] = useState(1);
  const [locked, setLocked] = useState(false);

  const [showAnswerOverlay, setShowAnswerOverlay] = useState(false);
  const [revealAnswer, setRevealAnswer] = useState(false);

  const questionRef = useRef<HTMLDivElement | null>(null);

  const [topRanks, setTopRanks] = useState<TopRankRow[]>([]);
  const topRanksRef = useRef<TopRankRow[]>([]);

  const [leaderRows, setLeaderRows] = useState<LeaderRow[]>([]);
  const leaderRowsRef = useRef<LeaderRow[]>([]);
  const [leaderLoading, setLeaderLoading] = useState(false);

  const timerSeconds: number = trivia?.timer_seconds ?? 30;

  // ✅ Title (PUBLIC NAME) + live updates
  const [publicName, setPublicName] = useState<string>(() => pickPublicName(trivia));

  useEffect(() => {
    setPublicName(pickPublicName(trivia));
  }, [trivia?.public_name, trivia?.title, trivia?.id]);

  useEffect(() => {
    if (!trivia?.id) return;

    const ch = supabase
      .channel(`active-wall-title-${trivia.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "trivia_cards",
          filter: `id=eq.${trivia.id}`,
        },
        (payload: any) => {
          const next = payload?.new;
          if (!next) return;
          setPublicName(pickPublicName(next));
          // also pick up status changes from realtime if they arrive
          if (typeof next.status === "string") setCardStatus(next.status);
          if (typeof next.countdown_active === "boolean")
            setCardCountdownActive(!!next.countdown_active);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [trivia?.id]);

  /* -------------------------------------------------- */
  /* ✅ SERVER CLOCK OFFSET                              */
  /* -------------------------------------------------- */
  const serverOffsetRef = useRef(0); // serverNowMs - deviceNowMs

  async function syncServerOffset() {
    const attempt = async (fn: string) => {
      const { data, error } = await supabase.rpc(fn);
      return { data, error };
    };

    let res = await attempt("server_time");
    if (res.error) res = await attempt("trivia_server_time");

    if (res.error || !res.data) {
      console.warn("⚠️ server time rpc error:", res.error);
      return;
    }

    const serverMs = new Date(res.data as any).getTime();
    serverOffsetRef.current = serverMs - Date.now();
  }

  function nowServerMs() {
    return Date.now() + serverOffsetRef.current;
  }

  useEffect(() => {
    syncServerOffset();
    const id = window.setInterval(syncServerOffset, 15000);
    return () => window.clearInterval(id);
  }, []);

  /* -------------------------------------------------- */
  /* ✅ Phase writer (idempotent + guarded)               */
  /* -------------------------------------------------- */
  const phaseWriteLockRef = useRef(false);

  async function setWallPhaseAuthoritative(
    next: WallPhase,
    expectedPrev?: WallPhase
  ) {
    if (!sessionId) return;
    if (phaseWriteLockRef.current) return;

    phaseWriteLockRef.current = true;
    try {
      const { error: rpcErr } = await supabase.rpc("trivia_set_wall_phase", {
        p_session_id: sessionId,
        p_phase: next,
        p_expected_prev: expectedPrev ?? null,
      });

      if (!rpcErr) return;

      const iso = new Date(nowServerMs()).toISOString();
      let q = supabase
        .from("trivia_sessions")
        .update({
          wall_phase: next,
          wall_phase_started_at: iso,
        })
        .eq("id", sessionId);

      if (expectedPrev) q = q.eq("wall_phase", expectedPrev);

      const { error: updErr } = await q;
      if (updErr) console.warn("⚠️ wall_phase update fallback error:", updErr);
    } finally {
      phaseWriteLockRef.current = false;
    }
  }

  /* -------------------------------------------------- */
  /* ✅ CRITICAL FIX: Atomic, guarded “advance question”  */
  /* -------------------------------------------------- */
  const advanceWriteLockRef = useRef(false);

  async function advanceQuestionAuthoritative() {
    if (!sessionId) return;
    if (currentQuestionNumber == null) return;
    if (advanceWriteLockRef.current) return;

    advanceWriteLockRef.current = true;
    try {
      const iso = new Date(nowServerMs()).toISOString();

      const { data: updated, error: updErr } = await supabase
        .from("trivia_sessions")
        .update({
          current_question: currentQuestionNumber + 1,
          question_started_at: iso,
          wall_phase: "question",
          wall_phase_started_at: iso,
        })
        .eq("id", sessionId)
        .eq("wall_phase", "leaderboard")
        .eq("current_question", currentQuestionNumber)
        .select("id");

      if (updErr) {
        console.error("❌ advanceQuestionAuthoritative update error:", updErr);
        return;
      }

      if (!updated || updated.length === 0) return;
    } finally {
      advanceWriteLockRef.current = false;
    }
  }

  /* -------------------------------------------------- */
  /* ✅ Poll session: current_question + phase authority  */
  /*    ✅ UPDATED: allow status = paused                 */
  /* -------------------------------------------------- */
  useEffect(() => {
    if (!trivia?.id) return;

    let alive = true;

    async function pollSession() {
      const { data: session, error: sessionErr } = await supabase
        .from("trivia_sessions")
        .select(
          "id,status,current_question,question_started_at,wall_phase,wall_phase_started_at"
        )
        .eq("trivia_card_id", trivia.id)
        .neq("status", "finished")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sessionErr) {
        console.error("❌ trivia_sessions poll error:", sessionErr);
        return;
      }

      const okStatus =
        session?.status === "running" || session?.status === "paused";

      if (!session?.id || !okStatus || !session.current_question) {
        if (!alive) return;
        setSessionId(null);
        setSessionStatus(null);
        setWallPhase("question");
        setWallPhaseStartedAt(null);
        setQuestion(null);
        setCurrentQuestionNumber(null);
        setTotalQuestions(null);
        setQuestionStartedAt(null);
        return;
      }

      if (!alive) return;

      setSessionId(session.id);
      setSessionStatus(session.status);
      setCurrentQuestionNumber(session.current_question);
      setQuestionStartedAt(session.question_started_at ?? null);

      const safePhase = (session.wall_phase || "question") as WallPhase;
      setWallPhase(safePhase);
      setWallPhaseStartedAt(session.wall_phase_started_at ?? null);

      if (!session.wall_phase) {
        setWallPhaseAuthoritative("question", undefined);
      }

      const { data: qsRaw, error: qErr } = await supabase
        .from("trivia_questions")
        .select("*")
        .eq("trivia_card_id", trivia.id);

      if (qErr) {
        console.error("❌ trivia_questions fetch error:", qErr);
        return;
      }

      const { list: qs, mode } = normalizeQuestions(qsRaw || []);

      if (!qs || qs.length === 0) {
        setQuestion(null);
        setTotalQuestions(0);
        return;
      }

      setTotalQuestions(qs.length);

      const picked = pickQuestionForCurrent(qs, session.current_question, mode);
      setQuestion(picked);
    }

    pollSession();
    const interval = setInterval(pollSession, 1000);

    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [trivia?.id]);

  /* -------------------------------------------------- */
  /* ✅ Derived runtime flags                             */
  /* -------------------------------------------------- */
  const isPaused = cardStatus === "paused" || sessionStatus === "paused";
  const isActiveGame =
    (cardStatus === "running" || cardStatus === "paused") &&
    cardCountdownActive === false;

  const isFinalQuestion =
    totalQuestions != null && currentQuestionNumber != null
      ? currentQuestionNumber >= totalQuestions
      : false;

  /* -------------------------------------------------- */
  /* ✅ UI follows wall_phase ONLY                        */
  /* -------------------------------------------------- */
  useEffect(() => {
    if (wallPhase === "leaderboard") setView("leaderboard");
    else if (wallPhase === "podium") setView("podium");
    else setView("question");

    setShowAnswerOverlay(wallPhase === "overlay");
    setRevealAnswer(wallPhase === "reveal");

    // If paused, lock the UI regardless of phase (prevents “green bar” vibe)
    if (isPaused) setLocked(true);
    else setLocked(wallPhase !== "question");
  }, [wallPhase, isPaused]);

  /* -------------------------------------------------- */
  /* ✅ QUESTION TIMER (bar only) + phase trigger         */
  /*    ✅ UPDATED: freezes on pause                      */
  /* -------------------------------------------------- */
  useEffect(() => {
    let intervalId: number | null = null;

    // When paused, FREEZE progress in place (do not reset to 1/0)
    if (isPaused) {
      setLocked(true);
      return () => {
        if (intervalId != null) window.clearInterval(intervalId);
      };
    }

    if (
      !isActiveGame ||
      !sessionId ||
      currentQuestionNumber == null ||
      !questionStartedAt ||
      wallPhase !== "question"
    ) {
      if (wallPhase !== "question") {
        setProgress(0);
        setLocked(true);
      } else {
        setProgress(1);
        setLocked(false);
      }
      return () => {
        if (intervalId != null) window.clearInterval(intervalId);
      };
    }

    setLocked(false);
    setProgress(1);

    const baseDurationMs =
      typeof timerSeconds === "number" && timerSeconds > 0
        ? timerSeconds * 1000
        : 30000;

    const durationMs =
      baseDurationMs + (currentQuestionNumber === 1 ? FIRST_QUESTION_EXTRA_MS : 0);

    const startMs = new Date(questionStartedAt).getTime();

    const update = async () => {
      const now = nowServerMs();
      const elapsed = now - startMs;
      const remaining = Math.max(0, durationMs - elapsed);
      const frac = remaining / durationMs;

      setProgress(frac);

      if (remaining <= 0) {
        setLocked(true);
        await setWallPhaseAuthoritative("overlay", "question");
        if (intervalId != null) {
          window.clearInterval(intervalId);
          intervalId = null;
        }
      }
    };

    update();
    intervalId = window.setInterval(update, WALL_TIMER_STEP_MS);

    return () => {
      if (intervalId != null) window.clearInterval(intervalId);
    };
  }, [
    isActiveGame,
    isPaused,
    sessionId,
    currentQuestionNumber,
    questionStartedAt,
    timerSeconds,
    wallPhase,
  ]);

  /* -------------------------------------------------- */
  /* ✅ PHASE MACHINE (wall authority)                    */
  /*    ✅ UPDATED: freezes on pause                      */
  /* -------------------------------------------------- */
  const phaseTickLockRef = useRef(false);

  useEffect(() => {
    if (!isActiveGame) return;
    if (isPaused) return;
    if (!sessionId) return;
    if (!wallPhaseStartedAt) return;

    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;

      if (phaseTickLockRef.current) return;
      phaseTickLockRef.current = true;

      try {
        const startedMs = new Date(wallPhaseStartedAt).getTime();
        const elapsed = nowServerMs() - startedMs;

        if (wallPhase === "overlay" && elapsed >= OVERLAY_MS) {
          await setWallPhaseAuthoritative("reveal", "overlay");
          return;
        }

        if (wallPhase === "reveal" && elapsed >= REVEAL_MS) {
          if (isFinalQuestion) {
            await setWallPhaseAuthoritative("podium", "reveal");
          } else {
            await setWallPhaseAuthoritative("leaderboard", "reveal");
          }
          return;
        }

        if (wallPhase === "leaderboard" && elapsed >= LEADERBOARD_MS) {
          if (isFinalQuestion) {
            await setWallPhaseAuthoritative("podium", "leaderboard");
            return;
          }

          await advanceQuestionAuthoritative();
          return;
        }
      } finally {
        phaseTickLockRef.current = false;
      }
    };

    tick();
    const id = window.setInterval(tick, 200);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [
    isActiveGame,
    isPaused,
    sessionId,
    wallPhase,
    wallPhaseStartedAt,
    isFinalQuestion,
    currentQuestionNumber,
  ]);

  /* -------------------------------------------------- */
  /* TOP 3 RANKINGS (AUTO UPDATE)                        */
  /* ✅ UPDATED: supports paused sessions                */
  /* -------------------------------------------------- */
  useEffect(() => {
    if (!trivia?.id) return;

    let cancelled = false;

    async function loadTopRanks() {
      if (!isActiveGame || !sessionId) {
        if (!cancelled && topRanksRef.current.length) {
          topRanksRef.current = [];
          setTopRanks([]);
        }
        return;
      }

      const { data: session, error: sessionErr } = await supabase
        .from("trivia_sessions")
        .select("id,status,created_at")
        .eq("trivia_card_id", trivia.id)
        .in("status", ["running", "paused"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sessionErr) {
        console.error("❌ rankings session fetch error:", sessionErr);
        return;
      }

      if (!session?.id) {
        if (!cancelled && topRanksRef.current.length) {
          topRanksRef.current = [];
          setTopRanks([]);
        }
        return;
      }

      const { data: players, error: playersErr } = await supabase
        .from("trivia_players")
        .select("id,status,guest_id,display_name,photo_url")
        .eq("session_id", session.id)
        .eq("status", "approved");

      if (playersErr) {
        console.error("❌ rankings players fetch error:", playersErr);
        return;
      }

      const approved = players || [];
      if (approved.length === 0) {
        if (!cancelled && topRanksRef.current.length) {
          topRanksRef.current = [];
          setTopRanks([]);
        }
        return;
      }

      const playerIds = approved.map((p: any) => p.id);
      const guestIds = approved.map((p: any) => p.guest_id).filter(Boolean);

      const { data: answers, error: answersErr } = await supabase
        .from("trivia_answers")
        .select("player_id,points")
        .in("player_id", playerIds);

      if (answersErr) {
        console.error("❌ rankings answers fetch error:", answersErr);
        return;
      }

      const totals = new Map<string, number>();
      for (const a of answers || []) {
        const pts = typeof a.points === "number" ? a.points : 0;
        totals.set(a.player_id, (totals.get(a.player_id) || 0) + pts);
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
          console.warn("⚠️ rankings guest_profiles fetch error:", guestsErr);
        } else {
          for (const g of guests || []) {
            guestMap.set(g.id, {
              name: formatName(g?.first_name, g?.last_name),
              selfieUrl: pickSelfieUrl(g),
            });
          }
        }
      }

      const rows = approved
        .map((p: any) => {
          const guest = p.guest_id ? guestMap.get(p.guest_id) : undefined;
          const safeName = guest?.name || formatDisplayName(p.display_name);
          const safeSelfie = guest?.selfieUrl || p.photo_url || null;

          return {
            playerId: p.id,
            guestId: p.guest_id,
            name: safeName,
            selfieUrl: safeSelfie,
            points: totals.get(p.id) || 0,
          };
        })
        .sort((a: any, b: any) => b.points - a.points);

      const maxPoints = rows.length ? Math.max(...rows.map((r) => r.points)) : 0;
      if (maxPoints <= 0) {
        if (!cancelled && topRanksRef.current.length) {
          topRanksRef.current = [];
          setTopRanks([]);
        }
        return;
      }

      const top3 = rows.slice(0, 3).map((r: any, idx: number) => ({
        place: (idx + 1) as 1 | 2 | 3,
        playerId: r.playerId,
        guestId: r.guestId,
        name: r.name,
        selfieUrl: r.selfieUrl,
        points: r.points,
      }));

      if (!cancelled && !sameTopRanks(top3, topRanksRef.current)) {
        topRanksRef.current = top3;
        setTopRanks(top3);
      }
    }

    loadTopRanks();
    const id = window.setInterval(loadTopRanks, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [trivia?.id, isActiveGame, sessionId]);

  /* -------------------------------------------------- */
  /* FULL LEADERBOARD LOADER (ONLY USED IN VIEW=leaderboard) */
  /* ✅ UPDATED: supports paused sessions                */
  /* -------------------------------------------------- */
  useEffect(() => {
    if (!trivia?.id) return;
    if (!isActiveGame) return;
    if (view !== "leaderboard") return;

    let cancelled = false;

    async function loadLeaderboard() {
      if (!leaderRowsRef.current.length) setLeaderLoading(true);

      const { data: session, error: sessionErr } = await supabase
        .from("trivia_sessions")
        .select("id,status,created_at")
        .eq("trivia_card_id", trivia.id)
        .in("status", ["running", "paused"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sessionErr || !session?.id) {
        if (!cancelled && !sameLeaderRows([], leaderRowsRef.current)) {
          leaderRowsRef.current = [];
          setLeaderRows([]);
        }
        if (!cancelled) setLeaderLoading(false);
        return;
      }

      const { data: players, error: playersErr } = await supabase
        .from("trivia_players")
        .select("id,status,guest_id,display_name,photo_url")
        .eq("session_id", session.id)
        .eq("status", "approved");

      if (playersErr || !players || players.length === 0) {
        if (!cancelled && !sameLeaderRows([], leaderRowsRef.current)) {
          leaderRowsRef.current = [];
          setLeaderRows([]);
        }
        if (!cancelled) setLeaderLoading(false);
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
        const pts = typeof a.points === "number" ? a.points : 0;
        totals.set(a.player_id, (totals.get(a.player_id) || 0) + pts);
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
            guestMap.set(g.id, {
              name: formatName(g?.first_name, g?.last_name),
              selfieUrl: pickSelfieUrl(g),
            });
          }
        }
      }

      const built = players
        .map((p: any) => {
          const guest = p.guest_id ? guestMap.get(p.guest_id) : undefined;
          const safeName = guest?.name || formatDisplayName(p.display_name);
          const safeSelfie = guest?.selfieUrl || p.photo_url || null;

          return {
            rank: 0,
            playerId: p.id,
            guestId: p.guest_id,
            name: safeName,
            selfieUrl: safeSelfie,
            points: totals.get(p.id) || 0,
          };
        })
        .sort((a: any, b: any) => b.points - a.points)
        .map((r: any, idx: number) => ({ ...r, rank: idx + 1 }));

      const hasPoints = built.some((r) => r.points > 0);
      const finalRows = hasPoints ? built : [];

      if (!cancelled && !sameLeaderRows(finalRows, leaderRowsRef.current)) {
        leaderRowsRef.current = finalRows;
        setLeaderRows(finalRows);
      }

      if (!cancelled) setLeaderLoading(false);
    }

    loadLeaderboard();
    const id = window.setInterval(loadLeaderboard, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [trivia?.id, isActiveGame, view]);

  const options: string[] = Array.isArray(question?.options) ? question.options : [];

  const baseBgColors = [
    "rgba(239, 68, 68, 0.30)",
    "rgba(59, 130, 246, 0.30)",
    "rgba(34, 197, 94, 0.30)",
    "rgba(250, 204, 21, 0.35)",
  ];

  const baseBorders = [
    "1px solid rgba(239, 68, 68, 0.80)",
    "1px solid rgba(59, 130, 246, 0.80)",
    "1px solid rgba(34, 197, 94, 0.80)",
    "1px solid rgba(250, 204, 21, 0.90)",
  ];

  const highlightBorders = [
    "2px solid rgba(248, 113, 113, 1)",
    "2px solid rgba(96, 165, 250, 1)",
    "2px solid rgba(74, 222, 128, 1)",
    "2px solid rgba(253, 224, 71, 1)",
  ];

  const glowColors = [
    "rgba(248, 113, 113, 0.9)",
    "rgba(96, 165, 250, 0.9)",
    "rgba(74, 222, 128, 0.9)",
    "rgba(253, 224, 71, 0.9)",
  ];

  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://faninteract.vercel.app";
  const qrValue = `${origin}/trivia/${trivia?.id}/join`;

  return (
    <>
      {/* ROOT: background layers + foreground wrapper (NO layout changes) */}
      <div
        style={{
          width: "100vw",
          height: "100vh",
          overflow: "hidden",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* ✅ Background ONLY gets brightness */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: bg,
            filter: `brightness(${brightness}%)`,
            transform: "scale(1.02)",
            zIndex: 0,
          }}
        />

        {/* ✅ Vignette overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 1,
            background: `
              radial-gradient(circle at 50% 45%, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.55) 72%, rgba(0,0,0,0.78) 100%),
              linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.05) 35%, rgba(0,0,0,0.45) 100%)
            `,
          }}
        />

        {/* ✅ Subtle grain (very low) */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 2,
            opacity: 0.1,
            backgroundImage: `
              repeating-linear-gradient(
                0deg,
                rgba(255,255,255,0.02),
                rgba(255,255,255,0.02) 1px,
                rgba(0,0,0,0.02) 2px,
                rgba(0,0,0,0.02) 3px
              )
            `,
            mixBlendMode: "overlay",
          }}
        />

        {/* Foreground wrapper */}
        <div
          style={{
            position: "relative",
            zIndex: 3,
            width: "100%",
            height: "100%",
          }}
        >
          {/* ✅ TOP TITLE (PUBLIC NAME) */}
          <div
            style={{
              position: "absolute",
              top: "2.5vh",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 30,
              pointerEvents: "none",
              textAlign: "center",
            }}
          >
            <div
              style={{
                color: "#fff",
                fontSize: "clamp(2.5rem,4vw,5rem)",
                fontWeight: 900,
                textShadow: `
                  2px 2px 2px #000,
                  -2px 2px 2px #000,
                  2px -2px 2px #000,
                  -2px -2px 2px #000
                `,
                lineHeight: 1,
              }}
            >
              {publicName}
            </div>
          </div>

          {/* ✅ PAUSED OVERLAY (all views except podium) */}
          {isPaused && view !== "podium" && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(0,0,0,0.72)",
                zIndex: 50,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  color: "#fff",
                  fontWeight: 900,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  fontSize: "clamp(2.8rem,5vw,6rem)",
                  textShadow:
                    "0 0 2px #000, 0 0 10px rgba(0,0,0,0.85), 0 0 40px rgba(255,255,255,0.15)",
                  padding: "0.35em 0.7em",
                  borderRadius: 18,
                  background:
                    "radial-gradient(circle at 50% 50%, rgba(255,255,255,0.10), rgba(255,255,255,0.00))",
                  border: "1px solid rgba(255,255,255,0.18)",
                }}
              >
                Paused
              </div>
            </div>
          )}

          {/* ✅ View transitions */}
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              style={{
                width: "100%",
                height: "100%",
                position: "relative",
              }}
            >
              {/* =======================
                  QUESTION VIEW
              ======================= */}
              {view === "question" && (
                <div
                  style={{
                    width: "100vw",
                    height: "100vh",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      width: "90vw",
                      height: "78vh",
                      maxWidth: "1800px",
                      aspectRatio: "16 / 9",
                      background: "rgba(255,255,255,0.08)",
                      backdropFilter: "blur(20px)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: 24,
                      position: "relative",
                      overflow: "hidden",
                      padding: "4vh 4vw",
                      color: "#fff",
                      boxShadow: "0 25px 90px rgba(0,0,0,0.35)",
                    }}
                  >
                    {/* ✅ Glass depth overlay */}
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        pointerEvents: "none",
                        background:
                          "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03) 35%, rgba(0,0,0,0.08) 100%)",
                        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10)",
                        zIndex: 0,
                      }}
                    />

                    {/* ✅ MAIN CONTENT: question + timer + answers in a column */}
                    <div
                      style={{
                        position: "relative",
                        zIndex: 2,
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      {/* QUESTION AREA = all space above timer bar */}
                      <div
                        style={{
                          flex: 1,
                          maxWidth: "92%",
                          margin: "0 auto",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <div
                          ref={questionRef}
                          style={{
                            width: "100%",
                            fontWeight: 900,
                            textAlign: "center",
                            wordBreak: "break-word",
                            overflowWrap: "anywhere",
                            textShadow: "0 10px 40px rgba(0,0,0,0.65)",
                            fontSize: "clamp(2.4rem,3.5vw,4.5rem)",
                            lineHeight: 1.12,
                          }}
                        >
                          {question?.question_text
                            ? question.question_text
                            : "Waiting for game to start"}
                        </div>
                      </div>

                      {/* TIMER BAR – sits right above buttons */}
                      <div
                        style={{
                          width: "100%",
                          height: 20,
                          background: "rgba(255,255,255,0.15)",
                          borderRadius: 999,
                          overflow: "hidden",
                          marginTop: "1.5vh",
                          marginBottom: "1.8vh",
                          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.10)",
                        }}
                      >
                        <div
                          style={{
                            width: `${progress * 100}%`,
                            height: "100%",
                            background:
                              revealAnswer || locked || wallPhase !== "question"
                                ? "linear-gradient(to right,#ef4444,#dc2626)"
                                : "linear-gradient(to right,#4ade80,#22c55e)",
                            position: "relative",
                            overflow: "hidden",
                            transition: isPaused
                              ? "none"
                              : "width 0.05s linear, background 0.2s ease",
                          }}
                        >
                          {!isPaused &&
                            wallPhase === "question" &&
                            !revealAnswer &&
                            !locked && <div className="fi-timer-shine" />}
                        </div>
                      </div>

                      {/* ANSWERS – directly under timer */}
                      <div
                        style={{
                          width: "100%",
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: "2.5vh",
                        }}
                      >
                        {options.length > 0
                          ? options.map((opt, idx) => {
                              const isCorrect = idx === question?.correct_index;

                              let bgc =
                                baseBgColors[idx] ?? "rgba(255,255,255,0.12)";
                              let border =
                                baseBorders[idx] ??
                                "1px solid rgba(255,255,255,0.18)";
                              let opacity = 1;
                              let boxShadow = "none";
                              let transform = "scale(1)";
                              let animation: string | undefined;

                              if (revealAnswer) {
                                if (isCorrect) {
                                  border = highlightBorders[idx] ?? border;
                                  boxShadow = `0 0 40px 8px ${
                                    glowColors[idx] ??
                                    "rgba(255,255,255,0.9)"
                                  }`;
                                  transform = "scale(1.04)";
                                  animation =
                                    "fiCorrectPulse 1.2s ease-in-out infinite";
                                } else {
                                  opacity = 0.35;
                                }
                              }

                              return (
                                <div
                                  key={idx}
                                  style={{
                                    padding: "2.4vh 2.6vw",
                                    minHeight: "14vh",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    borderRadius: 18,
                                    background: bgc,
                                    border,
                                    fontSize:
                                      "clamp(1.6rem,2vw,2.4rem)",
                                    fontWeight: 700,
                                    textAlign: "center",
                                    opacity,
                                    boxShadow,
                                    transform,
                                    animation,
                                    transition: isPaused
                                      ? "none"
                                      : "opacity 0.3s ease, border 0.3s ease, background 0.3s ease, box-shadow 0.4s ease, transform 0.4s ease",
                                    position: "relative",
                                    overflow: "hidden",
                                  }}
                                >
                                  {/* subtle inner highlight */}
                                  <div
                                    style={{
                                      position: "absolute",
                                      inset: 0,
                                      pointerEvents: "none",
                                      background:
                                        "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02) 55%, rgba(0,0,0,0.06) 100%)",
                                      opacity: 0.75,
                                    }}
                                  />
                                  <div
                                    style={{
                                      position: "relative",
                                      zIndex: 2,
                                    }}
                                  >
                                    {String.fromCharCode(65 + idx)}. {opt}
                                  </div>
                                </div>
                              );
                            })
                          : null}
                      </div>

                      {/* CURRENT RANKINGS LABEL (below buttons) */}
                      {!isFinalQuestion && (
                        <div
                          style={{
                            marginTop: "2.2vh",
                            fontSize:
                              "clamp(1.6rem,2vw,2.2rem)",
                            fontWeight: 800,
                            opacity: 0.85,
                            textShadow:
                              "0 10px 30px rgba(0,0,0,0.45)",
                            textAlign: "center",
                          }}
                        >
                          Current Rankings
                        </div>
                      )}
                    </div>

                    {/* TINTED OVERLAY + "THE ANSWER IS" */}
                    {showAnswerOverlay && (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          background: "rgba(0,0,0,0.75)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          zIndex: 15,
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
                              fontSize:
                                "clamp(3rem,5vw,5.5rem)",
                              fontWeight: 900,
                              marginBottom: "1rem",
                              color: "#e5f1ff",
                              textShadow:
                                "0 0 2px #000000, 0 0 6px #000000, 0 0 18px rgba(15,23,42,0.9), 0 0 36px rgba(15,23,42,0.9), 0 0 72px rgba(59,130,246,0.9)",
                              padding: "0.4em 0.9em",
                              borderRadius: 18,
                              background:
                                "radial-gradient(circle at 50% 50%, rgba(59,130,246,0.65), rgba(15,23,42,0.0))",
                              boxShadow:
                                "0 0 40px rgba(59,130,246,0.9), 0 0 90px rgba(59,130,246,0.85)",
                              display: "inline-block",
                              animation:
                                "fiAnswerGlow 1.8s ease-in-out infinite alternate",
                            }}
                          >
                            THE ANSWER IS
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* =======================
                  LEADERBOARD VIEW
              ======================= */}
              {view === "leaderboard" && (
                <div
                  style={{
                    width: "100vw",
                    height: "100vh",
                    color: "#fff",
                    position: "relative",
                    overflow: "hidden",
                    display: "flex",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: LEADER_UI.titleTop,
                      left: "50%",
                      transform: "translateX(-50%)",
                      fontSize: "clamp(2.5rem,4vw,4.8rem)",
                      fontWeight: 900,
                      letterSpacing: "0.02em",
                      textShadow: "0 10px 40px rgba(0,0,0,0.65)",
                    }}
                  >
                    Leaderboard
                  </div>

                  <div
                    style={{
                      position: "absolute",
                      top: LEADER_UI.listTop,
                      width: "92vw",
                      maxWidth: LEADER_UI.maxWidth,
                    }}
                  >
                    {leaderLoading && (
                      <div style={{ textAlign: "center", opacity: 0.75 }}>
                        Loading leaderboard…
                      </div>
                    )}

                    {!leaderLoading && leaderRows.length === 0 && (
                      <div style={{ textAlign: "center", opacity: 0.75 }}>
                        No scores yet.
                      </div>
                    )}

                    {!leaderLoading && leaderRows.length > 0 && (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: LEADER_UI.rowGap,
                        }}
                      >
                        {leaderRows.slice(0, 10).map((r) => {
                          const isTop3 = r.rank <= 3;

                          return (
                            <div
                              key={r.playerId}
                              style={{
                                height: LEADER_UI.rowHeight,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                borderRadius: 22,
                                padding: `0 ${LEADER_UI.rowPadX}px`,
                                background: "rgba(255,255,255,0.07)",
                                border: isTop3
                                  ? "2px solid rgba(190,242,100,0.55)"
                                  : "1px solid rgba(255,255,255,0.15)",
                                boxShadow: isTop3
                                  ? "0 0 28px rgba(190,242,100,0.22)"
                                  : "0 10px 40px rgba(0,0,0,0.18)",
                                position: "relative",
                                overflow: "hidden",
                              }}
                            >
                              {/* ✅ Glass depth overlay */}
                              <div
                                style={{
                                  position: "absolute",
                                  inset: 0,
                                  pointerEvents: "none",
                                  background:
                                    "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02) 55%, rgba(0,0,0,0.06) 100%)",
                                }}
                              />

                              {/* ✅ Top-3 sheen sweep */}
                              {isTop3 && <div className="fi-row-sheen" />}

                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 18,
                                  position: "relative",
                                  zIndex: 2,
                                }}
                              >
                                <div
                                  style={{
                                    width: LEADER_UI.avatar,
                                    height: LEADER_UI.avatar,
                                    borderRadius: "50%",
                                    overflow: "hidden",
                                    background: "rgba(255,255,255,0.12)",
                                    border: r.selfieUrl
                                      ? "2px solid rgba(255,255,255,0.45)"
                                      : "2px dashed rgba(255,255,255,0.45)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    position: "relative",
                                    boxShadow:
                                      "0 0 16px rgba(0,0,0,0.35)",
                                  }}
                                >
                                  {r.selfieUrl ? (
                                    <img
                                      src={r.selfieUrl}
                                      alt={r.name}
                                      style={{
                                        width: "100%",
                                        height: "100%",
                                        objectFit: "cover",
                                      }}
                                    />
                                  ) : (
                                    <div
                                      style={{
                                        fontWeight: 900,
                                        fontSize: "1.25rem",
                                        opacity: 0.9,
                                      }}
                                    >
                                      {r.rank}
                                    </div>
                                  )}

                                  {r.selfieUrl && (
                                    <div
                                      style={{
                                        position: "absolute",
                                        bottom: -8,
                                        right: -8,
                                        width: 30,
                                        height: 30,
                                        borderRadius: "50%",
                                        background:
                                          "rgba(0,0,0,0.75)",
                                        border:
                                          "1px solid rgba(255,255,255,0.25)",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        fontWeight: 900,
                                      }}
                                    >
                                      {r.rank}
                                    </div>
                                  )}
                                </div>

                                <div
                                  style={{
                                    fontSize:
                                      "clamp(1.3rem,2.2vw,2.4rem)",
                                    fontWeight: 900,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    maxWidth: "65vw",
                                    textShadow:
                                      "0 10px 30px rgba(0,0,0,0.55)",
                                  }}
                                >
                                  {r.name}
                                </div>
                              </div>

                              <div
                                style={{
                                  fontSize:
                                    "clamp(1.6rem,2.6vw,3rem)",
                                  fontWeight: 900,
                                  position: "relative",
                                  zIndex: 2,
                                  textShadow:
                                    "0 10px 30px rgba(0,0,0,0.55)",
                                }}
                              >
                                {r.points}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* =======================
                  PODIUM VIEW
              ======================= */}
              {view === "podium" && (
                <div
                  style={{
                    width: "100vw",
                    height: "100vh",
                    position: "relative",
                  }}
                >
                  <TriviaPodum trivia={trivia} />
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* ✅ QR CODE — hide during podium */}
          {view !== "podium" && (
            <div
              style={{
                position: "absolute",
                bottom: QR_CTRL.bottom,
                left: QR_CTRL.left,
                width: QR_CTRL.size,
                height: QR_CTRL.size,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                zIndex: 20,
                pointerEvents: "none",
              }}
            >
              <p
                style={{
                  color: "#fff",
                  fontWeight: 700,
                  marginBottom: "0.6vh",
                  fontSize: "clamp(1rem,1.4vw,1.4rem)",
                }}
              >
                Scan to Join
              </p>

              <QRCodeCanvas
                value={qrValue}
                size={QR_CTRL.size * 2}
                level="H"
                bgColor="#ffffff"
                fgColor="#000000"
                style={{ width: "100%", height: "100%", borderRadius: 20 }}
              />
            </div>
          )}

          {/* TOP 3 LEADERS (question view only, NOT final question) */}
          {view === "question" && !isFinalQuestion && (
            <div
              style={{
                position: "absolute",
                bottom: RANKINGS_CTRL.bottom,
                left: RANKINGS_CTRL.centerLeft,
                transform: `translateX(calc(-50% + ${RANKINGS_CTRL.offsetX}))`,
                display: "flex",
                gap: RANKINGS_CTRL.groupGap,
                zIndex: 20,
                pointerEvents: "none",
              }}
            >
              {[1, 2, 3].map((place) => {
                const row = topRanks.find((r) => r.place === place);
                const hasSelfie = !!row?.selfieUrl;

                const medalBorder = hasSelfie
                  ? place === 1
                    ? "3px solid rgba(212,175,55,0.95)"
                    : place === 2
                    ? "3px solid rgba(192,192,192,0.95)"
                    : "3px solid rgba(205,127,50,0.95)"
                  : "2px dashed rgba(255,255,255,0.45)";

                const medalGlow = hasSelfie
                  ? place === 1
                    ? "0 0 18px rgba(212,175,55,0.30)"
                    : place === 2
                    ? "0 0 16px rgba(192,192,192,0.22)"
                    : "0 0 16px rgba(205,127,50,0.22)"
                  : "none";

                return (
                  <div
                    key={place}
                    style={{
                      display: "grid",
                      gridTemplateColumns: `${RANKINGS_CTRL.avatarSize}px auto`,
                      gridTemplateRows: "auto auto",
                      columnGap: RANKINGS_CTRL.nameGap,
                      alignItems: "center",
                      fontWeight: 900,
                      opacity: 0.92,
                    }}
                  >
                    <div
                      className={place === 1 && hasSelfie ? "fi-medal-breathe" : ""}
                      style={{
                        gridColumn: "1 / 2",
                        gridRow: "1 / 2",
                        width: RANKINGS_CTRL.avatarSize,
                        height: RANKINGS_CTRL.avatarSize,
                        borderRadius: "50%",
                        overflow: "hidden",
                        background: "rgba(255,255,255,0.12)",
                        border: medalBorder,
                        boxShadow: hasSelfie ? medalGlow : "none",
                      }}
                    >
                      {hasSelfie ? (
                        <img
                          src={row!.selfieUrl as string}
                          alt={row!.name}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            display: "block",
                          }}
                        />
                      ) : null}
                    </div>

                    <div
                      style={{
                        gridColumn: "2 / 3",
                        gridRow: "1 / 2",
                        fontSize: "clamp(1.05rem,1.3vw,1.5rem)",
                        whiteSpace: "nowrap",
                        maxWidth: RANKINGS_CTRL.nameMaxWidth,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        color: "rgba(255,255,255,0.92)",
                        textShadow: "0 2px 10px rgba(0,0,0,0.45)",
                      }}
                    >
                      {row?.name || "—"}
                    </div>

                    <div
                      style={{
                        gridColumn: "1 / 2",
                        gridRow: "2 / 3",
                        justifySelf: "center",
                        marginTop: RANKINGS_CTRL.placeTopMargin,
                        fontSize: "clamp(1rem,1.2vw,1.25rem)",
                        opacity: 0.9,
                        textShadow: "0 8px 20px rgba(0,0,0,0.4)",
                      }}
                    >
                      {place === 1 ? "1st" : place === 2 ? "2nd" : "3rd"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* LOGO – hide during podium */}
          {view !== "podium" && (
            <div
              style={{
                position: "absolute",
                top: LOGO_CTRL.top,
                right: LOGO_CTRL.right,
                width: LOGO_CTRL.width,
                height: LOGO_CTRL.height,
                zIndex: 20,
                opacity: LOGO_CTRL.opacity,
                pointerEvents: "none",
              }}
            >
              <img
                src={logoSrc}
                alt="Host Logo"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  filter: "drop-shadow(0 0 12px rgba(0,0,0,0.65))",
                }}
              />
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fiAnswerGlow {
          0% {
            transform: scale(1);
            box-shadow: 0 0 30px rgba(59, 130, 246, 0.7),
              0 0 60px rgba(59, 130, 246, 0.5);
          }
          100% {
            transform: scale(1.06);
            box-shadow: 0 0 45px rgba(59, 130, 246, 1),
              0 0 95px rgba(59, 130, 246, 0.9);
          }
        }

        .fi-timer-shine {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 40%;
          left: -45%;
          background: linear-gradient(
            90deg,
            rgba(255,255,255,0) 0%,
            rgba(255,255,255,0.28) 50%,
            rgba(255,255,255,0) 100%
          );
          animation: fiShine 1.2s linear infinite;
          filter: blur(0.5px);
          opacity: 0.6;
        }
        @keyframes fiShine {
          to {
            transform: translateX(320%);
          }
        }

        @keyframes fiCorrectPulse {
          0% {
            transform: scale(1.04);
            filter: saturate(1) brightness(1);
          }
          50% {
            transform: scale(1.06);
            filter: saturate(1.08) brightness(1.06);
          }
          100% {
            transform: scale(1.04);
            filter: saturate(1) brightness(1);
          }
        }

        .fi-row-sheen {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.45;
          background: linear-gradient(
            120deg,
            rgba(255,255,255,0) 38%,
            rgba(255,255,255,0.16) 50%,
            rgba(255,255,255,0) 62%
          );
          transform: translateX(-120%);
          animation: fiRowSheen 2.4s ease-in-out infinite;
          mix-blend-mode: screen;
        }
        @keyframes fiRowSheen {
          0% { transform: translateX(-120%); }
          55% { transform: translateX(120%); }
          100% { transform: translateX(120%); }
        }

        .fi-medal-breathe {
          animation: fiMedalBreathe 2.6s ease-in-out infinite;
        }
        @keyframes fiMedalBreathe {
          0%   { box-shadow: 0 0 14px rgba(212,175,55,0.22); }
          50%  { box-shadow: 0 0 28px rgba(212,175,55,0.40), 0 0 60px rgba(212,175,55,0.12); }
          100% { box-shadow: 0 0 14px rgba(212,175,55,0.22); }
        }
      `}</style>
    </>
  );
}
