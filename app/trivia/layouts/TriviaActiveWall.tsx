"use client";

import { useEffect, useState, useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { getSupabaseClient } from "@/lib/supabaseClient";

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

type WallView = "question" | "leaderboard"; // (we'll add podium later)

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
/* RANKINGS CONTROL (ADJUST HERE)                       */
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
/* TIMER CONFIG (DEFAULT/FALLBACK)                      */
/* ---------------------------------------------------- */
const QUESTION_DURATION_MS = 30000;

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

/* -------------------------------------------------------------------------- */
/* 🎮 TRIVIA ACTIVE WALL                                                      */
/* -------------------------------------------------------------------------- */

export default function TriviaActiveWall({ trivia }: TriviaActiveWallProps) {
  const logoSrc =
    trivia?.host?.branding_logo_url?.trim() ||
    trivia?.host?.logo_url?.trim() ||
    fallbackLogo;

  // Card-level running flag (still used for some guards)
  const isRunning =
    trivia?.status === "running" && trivia?.countdown_active === false;

  const [view, setView] = useState<WallView>("question");

  const [sessionId, setSessionId] = useState<string | null>(null);

  const [question, setQuestion] = useState<any>(null);
  const [currentQuestionNumber, setCurrentQuestionNumber] =
    useState<number | null>(null);
  const [totalQuestions, setTotalQuestions] = useState<number | null>(null);

  const [questionStartedAt, setQuestionStartedAt] = useState<string | null>(null);

  const [progress, setProgress] = useState(1);
  const [locked, setLocked] = useState(false);

  const [showAnswerOverlay, setShowAnswerOverlay] = useState(false);
  const [revealAnswer, setRevealAnswer] = useState(false);

  const questionRef = useRef<HTMLDivElement | null>(null);

  const [topRanks, setTopRanks] = useState<TopRankRow[]>([]);
  const topRanksRef = useRef<TopRankRow[]>([]);

  // Full leaderboard rows (top 10)
  const [leaderRows, setLeaderRows] = useState<LeaderRow[]>([]);
  const leaderRowsRef = useRef<LeaderRow[]>([]);
  const [leaderLoading, setLeaderLoading] = useState(false);

  // prevent duplicate transitions
  const transitionLockRef = useRef(false);

  /* -------------------------------------------------- */
  /* FETCH CURRENT QUESTION (POLLING)                    */
  /* -------------------------------------------------- */
  useEffect(() => {
    if (!trivia?.id) return;

    let alive = true;

    async function fetchCurrentQuestion() {
      const { data: session, error: sessionErr } = await supabase
        .from("trivia_sessions")
        .select("id,current_question,question_started_at,created_at,status")
        .eq("trivia_card_id", trivia.id)
        .eq("status", "running")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sessionErr) {
        console.error("❌ trivia_sessions fetch error:", sessionErr);
        return;
      }

      if (!session || !session.current_question) {
        if (alive) {
          setSessionId(null);
          setQuestion(null);
          setCurrentQuestionNumber(null);
          setTotalQuestions(null);
          setQuestionStartedAt(null);
        }
        return;
      }

      if (alive) setSessionId(session.id);

      const index = Math.max(0, session.current_question - 1);
      if (alive) {
        setCurrentQuestionNumber(session.current_question);
        setQuestionStartedAt(session.question_started_at ?? null);
      }

      const { data: qs, error: qErr } = await supabase
        .from("trivia_questions")
        .select("*")
        .eq("trivia_card_id", trivia.id)
        .order("round_number", { ascending: true })
        .order("created_at", { ascending: true });

      if (qErr) {
        console.error("❌ trivia_questions fetch error:", qErr);
        return;
      }

      if (!qs || qs.length === 0) {
        if (alive) {
          setQuestion(null);
          setTotalQuestions(0);
        }
        return;
      }

      const safeIndex = Math.min(index, qs.length - 1);
      const current = qs[safeIndex];

      if (alive) {
        setQuestion(current);
        setTotalQuestions(qs.length);
      }
    }

    fetchCurrentQuestion();
    const interval = setInterval(fetchCurrentQuestion, 1000);

    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [trivia?.id]);

  /* -------------------------------------------------- */
  /* TOP 3 RANKINGS (AUTO UPDATE)                        */
  /* -------------------------------------------------- */
  useEffect(() => {
    if (!trivia?.id) return;

    let cancelled = false;

    async function loadTopRanks() {
      if (!isRunning) {
        if (!cancelled && topRanksRef.current.length) {
          topRanksRef.current = [];
          setTopRanks([]);
        }
        return;
      }

      const { data: session, error: sessionErr } = await supabase
        .from("trivia_sessions")
        .select("id,created_at,status")
        .eq("trivia_card_id", trivia.id)
        .eq("status", "running")
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
  }, [trivia?.id, isRunning]);

  /* -------------------------------------------------- */
  /* FULL LEADERBOARD LOADER (ONLY USED IN VIEW=leaderboard) */
  /* -------------------------------------------------- */
  useEffect(() => {
    if (!trivia?.id) return;
    if (!isRunning) return;
    if (view !== "leaderboard") return;

    let cancelled = false;

    async function loadLeaderboard() {
      if (!leaderRowsRef.current.length) setLeaderLoading(true);

      const { data: session, error: sessionErr } = await supabase
        .from("trivia_sessions")
        .select("id,status,created_at")
        .eq("trivia_card_id", trivia.id)
        .neq("status", "finished")
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

      if (!cancelled && !sameLeaderRows(built, leaderRowsRef.current)) {
        leaderRowsRef.current = built;
        setLeaderRows(built);
      }

      if (!cancelled) setLeaderLoading(false);
    }

    loadLeaderboard();
    const id = window.setInterval(loadLeaderboard, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [trivia?.id, isRunning, view]);

  /* -------------------------------------------------- */
  /* TIMER ENGINE — DB-SYNCED                            */
  /* -------------------------------------------------- */
  useEffect(() => {
    if (!isRunning || currentQuestionNumber == null) return;
    if (view !== "question") return; // don't run timer while leaderboard is up

    setLocked(false);
    setProgress(1);
    setShowAnswerOverlay(false);
    setRevealAnswer(false);
    transitionLockRef.current = false;

    const durationMs =
      typeof trivia?.timer_seconds === "number" && trivia.timer_seconds > 0
        ? trivia.timer_seconds * 1000
        : QUESTION_DURATION_MS;

    const startedMs = questionStartedAt
      ? new Date(questionStartedAt).getTime()
      : Date.now(); // wall visuals fallback only

    const id = window.setInterval(() => {
      const elapsed = Date.now() - startedMs;
      const remaining = Math.max(0, durationMs - elapsed);
      const p = remaining / durationMs;

      setProgress(p);

      if (remaining <= 0) {
        setLocked(true);
        window.clearInterval(id);
      }
    }, 100);

    return () => {
      window.clearInterval(id);
    };
  }, [
    isRunning,
    currentQuestionNumber,
    trivia?.timer_seconds,
    questionStartedAt,
    view,
  ]);

  /* -------------------------------------------------- */
  /* ANSWER REVEAL FLOW                                  */
  /* -------------------------------------------------- */
  useEffect(() => {
    if (view !== "question") return;

    if (!locked) {
      setShowAnswerOverlay(false);
      setRevealAnswer(false);
      return;
    }

    setShowAnswerOverlay(true);
    setRevealAnswer(false);

    const timeoutId = window.setTimeout(() => {
      setShowAnswerOverlay(false);
      setRevealAnswer(true);
    }, 5000);

    return () => window.clearTimeout(timeoutId);
  }, [locked, view]);

  /* -------------------------------------------------- */
  /* AFTER 8s REVEAL → SHOW LEADERBOARD (NO NAVIGATION)   */
  /* -------------------------------------------------- */
  useEffect(() => {
    if (view !== "question") return;
    if (!revealAnswer) return;
    if (!isRunning) return;
    if (currentQuestionNumber == null) return;

    if (transitionLockRef.current) return;
    transitionLockRef.current = true;

    const toLeaderboard = window.setTimeout(() => {
      setView("leaderboard");
      setLeaderLoading(true);
    }, 8000);

    return () => window.clearTimeout(toLeaderboard);
  }, [revealAnswer, isRunning, currentQuestionNumber, view]);

  /* -------------------------------------------------- */
  /* LEADERBOARD VIEW TIMER (15s) THEN ADVANCE QUESTION   */
  /* -------------------------------------------------- */
  useEffect(() => {
    if (view !== "leaderboard") return;
    if (!isRunning) return;
    if (currentQuestionNumber == null) return;

    const timeoutId = window.setTimeout(async () => {
      try {
        if (totalQuestions != null && currentQuestionNumber >= totalQuestions) {
          return;
        }

        if (!sessionId) {
          console.error("❌ advance blocked: missing sessionId");
          setView("question");
          return;
        }

        // ✅ SERVER-AUTHORITATIVE ADVANCE (sets question_started_at = now())
        const { error } = await supabase.rpc("advance_trivia_question", {
          p_session_id: sessionId,
          p_next_question: currentQuestionNumber + 1,
        });

        if (error) console.error("❌ advance_trivia_question RPC error:", error);

        setView("question");
      } catch (err) {
        console.error("❌ leaderboard advance error:", err);
        setView("question");
      }
    }, 15000);

    return () => window.clearTimeout(timeoutId);
  }, [view, isRunning, currentQuestionNumber, totalQuestions, trivia?.id, sessionId]);

  /* -------------------------------------------------- */
  /* AUTO-SCALE QUESTION TEXT TO ~2 LINES               */
  /* -------------------------------------------------- */
  useEffect(() => {
    if (view !== "question") return;

    const el = questionRef.current;
    if (!el) return;
    if (typeof window === "undefined") return;

    let baseSize = Math.max(32, Math.min(88, window.innerWidth * 0.035));
    let size = baseSize;

    el.style.fontSize = `${size}px`;
    el.style.lineHeight = "1.15";
    el.style.whiteSpace = "normal";

    const maxLines = 2;

    const fit = () => {
      const node = questionRef.current;
      if (!node) return;

      const lineHeightPx = size * 1.15;
      const maxHeight = lineHeightPx * maxLines + 4;

      if (node.scrollHeight > maxHeight && size > 24) {
        size -= 2;
        node.style.fontSize = `${size}px`;
        node.style.lineHeight = "1.15";
        requestAnimationFrame(fit);
      }
    };

    requestAnimationFrame(fit);
  }, [question?.question_text, view]);

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
      {/* KEEP YOUR EXISTING RENDER / JSX BELOW THIS LINE */}
      {/* (All of your existing layout, QR, options, rankings UI, etc.) */}
    </>
  );
}
