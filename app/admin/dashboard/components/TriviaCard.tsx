"use client";

import { cn } from "@/lib/utils";
import * as Tabs from "@radix-ui/react-tabs";
import { supabase } from "@/lib/supabaseClient";
import { useEffect, useMemo, useRef, useState } from "react";

type LeaderRow = { playerId: string; label: string; totalPoints: number };

function sameLeaderboard(a: LeaderRow[], b: LeaderRow[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].playerId !== b[i].playerId ||
      a[i].totalPoints !== b[i].totalPoints ||
      a[i].label !== b[i].label
    ) {
      return false;
    }
  }
  return true;
}

const DEFAULT_TRIVIA_GRADIENT =
  "linear-gradient(135deg,#0d47a1cc 0%, #0d47a199 45%, #1976d299 60%, #1976d2cc 100%)";

function getTriviaCardBackground(trivia: any) {
  if (!trivia) {
    return { background: "#1b2638" };
  }

  const type = trivia.background_type || "gradient";
  const value =
    typeof trivia.background_value === "string" && trivia.background_value.length
      ? trivia.background_value
      : DEFAULT_TRIVIA_GRADIENT;

  // Image background
  if (type === "image" && value.startsWith("http")) {
    return {
      backgroundImage: `url(${value})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }

  // Gradient string
  if (value.includes("gradient(")) {
    return {
      backgroundImage: value,
    };
  }

  // Solid color
  return {
    background: value || "#1b2638",
  };
}

type WallPhase = "question" | "overlay" | "reveal" | "leaderboard" | "podium";

export default function TriviaCard({
  trivia,
  onOpenOptions,
  onDelete,
  onLaunch,
  onOpenModeration,
}: {
  trivia: any;
  onOpenOptions: (trivia: any) => void;
  onDelete: (id: string) => void;
  onLaunch: (id: string) => void;
  onOpenModeration?: (trivia: any) => void;
}) {
  if (!trivia) return null;

  /* ------------------------------------------------------------
     QUESTIONS STATE
  ------------------------------------------------------------ */
  const [questions, setQuestions] = useState<any[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  const PAGE_SIZE = 5;
  const [currentPage, setCurrentPage] = useState(0);

  /* ------------------------------------------------------------
     TRIVIA SETTINGS STATE
 ------------------------------------------------------------ */
  const [timerSeconds, setTimerSeconds] = useState<number>(
    trivia?.timer_seconds ?? 30
  );

  // Countdown timer setting (trivia_cards.countdown_seconds)
  const COUNTDOWN_OPTIONS: Array<{ label: string; value: number }> = [
    { label: "10 seconds", value: 10 },
    { label: "30 seconds", value: 30 },
    { label: "1 minute", value: 60 },
    { label: "2 minutes", value: 120 },
    { label: "3 minutes", value: 180 },
    { label: "4 minutes", value: 240 },
    { label: "5 minutes", value: 300 },
    { label: "10 minutes", value: 600 },
    { label: "15 minutes", value: 900 },
    { label: "20 minutes", value: 1200 },
    { label: "25 minutes", value: 1500 },
    { label: "30 minutes", value: 1800 },
    { label: "35 minutes", value: 2100 },
    { label: "40 minutes", value: 2400 },
    { label: "45 minutes", value: 2700 },
    { label: "50 minutes", value: 3000 },
    { label: "55 minutes", value: 3300 },
    { label: "1 hour", value: 3600 },
  ];

  const normalizeCountdownSeconds = (n: any) => {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return 10;
    return Math.max(1, Math.min(24 * 60 * 60, Math.floor(v)));
  };

  const [countdownSeconds, setCountdownSeconds] = useState<number>(
    normalizeCountdownSeconds(trivia?.countdown_seconds ?? 10)
  );

  const [playMode, setPlayMode] = useState<string>(trivia?.play_mode || "auto");
  const [scoringMode, setScoringMode] = useState<string>(
    trivia?.scoring_mode || "100s"
  );
  const [requireSelfie, setRequireSelfie] = useState<boolean>(
    trivia?.require_selfie ?? true
  );

  // Ads toggle for phone UI
  const [adsEnabled, setAdsEnabled] = useState<boolean>(!!trivia?.ads_enabled);

  const [savingSettings, setSavingSettings] = useState(false);

  /* ------------------------------------------------------------
     CARD STATUS (LIVE POLLING FROM trivia_cards)
 ------------------------------------------------------------ */
  const [cardStatus, setCardStatus] = useState<string>(trivia.status);
  const [cardCountdownActive, setCardCountdownActive] = useState<boolean>(
    !!trivia.countdown_active
  );

  /* ------------------------------------------------------------
     ✅ ACTIVE SESSION (we use this for the conductor)
  ------------------------------------------------------------ */
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  /* ------------------------------------------------------------
     PARTICIPANTS / PENDING COUNTS
 ------------------------------------------------------------ */
  const [participantsCount, setParticipantsCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);

  /* ------------------------------------------------------------
     LEADERBOARD STATE
 ------------------------------------------------------------ */
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const lastLeaderboardRef = useRef<LeaderRow[]>([]);

  const lastQuestionStartedAtRef = useRef<string | null>(null);
  const lastCurrentQuestionRef = useRef<number | null>(null);

  const questionIdsRef = useRef<Set<string>>(new Set());
  const leaderboardDebounceRef = useRef<number | null>(null);

  const playLockRef = useRef(false);
  const playTimeoutRef = useRef<number | null>(null);

  /* ------------------------------------------------------------
     ✅ BRUTE FORCE CONDUCTOR STATE (prevents skipping)
  ------------------------------------------------------------ */
  const conductorTickRef = useRef<number | null>(null);

  // Durations between phases (tweak if you want)
  const OVERLAY_MS = 900;      // "THE ANSWER IS..." screen
  const REVEAL_MS = 2600;      // show correct answer
  const LEADERBOARD_MS = 4200; // show leaderboard between questions

  /* ------------------------------------------------------------
     ACTIVE TAB
 ------------------------------------------------------------ */
  const [activeTab, setActiveTab] = useState<
    "menu" | "questions" | "leaderboard" | "settings"
  >("menu");

  /* ------------------------------------------------------------
     Keep state in sync if parent reloads trivia
 ------------------------------------------------------------ */
  useEffect(() => {
    setTimerSeconds(trivia?.timer_seconds ?? 30);
    setCountdownSeconds(normalizeCountdownSeconds(trivia?.countdown_seconds ?? 10));
    setPlayMode(trivia?.play_mode || "auto");
    setScoringMode(trivia?.scoring_mode || "100s");
    setRequireSelfie(trivia?.require_selfie ?? true);
    setAdsEnabled(!!trivia?.ads_enabled);

    setCardStatus(trivia?.status);
    setCardCountdownActive(!!trivia?.countdown_active);
  }, [
    trivia?.id,
    trivia?.timer_seconds,
    trivia?.countdown_seconds,
    trivia?.play_mode,
    trivia?.scoring_mode,
    trivia?.require_selfie,
    trivia?.ads_enabled,
    trivia?.status,
    trivia?.countdown_active,
  ]);

  /* ------------------------------------------------------------
     Poll trivia_cards.status + countdown_active every 2s
 ------------------------------------------------------------ */
  useEffect(() => {
    let isMounted = true;

    const pollCard = async () => {
      if (!trivia?.id) return;

      const { data, error } = await supabase
        .from("trivia_cards")
        .select(
          "status, countdown_active, countdown_seconds, background_type, background_value, ads_enabled"
        )
        .eq("id", trivia.id)
        .maybeSingle();

      if (error || !data) {
        if (error) console.error("❌ trivia_cards status poll error:", error);
        return;
      }

      if (!isMounted) return;
      setCardStatus(data.status);
      setCardCountdownActive(!!data.countdown_active);
      setAdsEnabled(!!data.ads_enabled);

      setCountdownSeconds(
        normalizeCountdownSeconds((data as any).countdown_seconds ?? 10)
      );

      // keep background synced
      trivia.background_type = data.background_type;
      trivia.background_value = data.background_value;
      trivia.ads_enabled = data.ads_enabled;
      trivia.countdown_seconds = (data as any).countdown_seconds;
    };

    pollCard();
    const id = setInterval(pollCard, 2000);

    return () => {
      isMounted = false;
      clearInterval(id);
    };
  }, [trivia?.id]);

  async function updateTriviaSettings(patch: {
    timer_seconds?: number;
    countdown_seconds?: number;
    play_mode?: string;
    scoring_mode?: string;
    require_selfie?: boolean;
    ads_enabled?: boolean;
  }) {
    try {
      setSavingSettings(true);
      const { error } = await supabase
        .from("trivia_cards")
        .update(patch)
        .eq("id", trivia.id);

      if (error) console.error("❌ Update trivia settings error:", error);
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleCountdownSecondsChange(e: any) {
    const raw = Number(e.target.value);
    const value = normalizeCountdownSeconds(raw);
    setCountdownSeconds(value);
    await updateTriviaSettings({ countdown_seconds: value });
  }

  async function handleTimerChange(e: any) {
    const value = Number(e.target.value) || 30;
    setTimerSeconds(value);
    await updateTriviaSettings({ timer_seconds: value });
  }

  async function handlePlayModeChange(e: any) {
    const value = e.target.value || "auto";
    setPlayMode(value);
    await updateTriviaSettings({ play_mode: value });
  }

  async function handleScoringModeChange(e: any) {
    const value = e.target.value || "100s";
    setScoringMode(value);
    await updateTriviaSettings({ scoring_mode: value });
  }

  async function handleRequireSelfieChange(e: any) {
    const value = e.target.value === "on";
    setRequireSelfie(value);
    await updateTriviaSettings({ require_selfie: value });
  }

  async function handleAdsEnabledChange(e: any) {
    const value = e.target.value === "on";
    setAdsEnabled(value);
    await updateTriviaSettings({ ads_enabled: value });
  }

  /* ------------------------------------------------------------
     FETCH QUESTIONS (ON TAB OPEN)
 ------------------------------------------------------------ */
  async function loadQuestions() {
    setLoadingQuestions(true);

    const { data, error } = await supabase
      .from("trivia_questions")
      .select("*")
      .eq("trivia_card_id", trivia.id)
      .order("round_number", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) console.error("❌ Load questions error:", error);

    if (!error && data) {
      setQuestions(data);
      setCurrentPage(0);
    }

    setLoadingQuestions(false);
  }

  /* ------------------------------------------------------------
     PARTICIPANTS / PENDING COUNTS (poll every 2s)
     ✅ ALSO sets activeSessionId
 ------------------------------------------------------------ */
  async function loadCounts() {
    const { data: session, error: sessionErr } = await supabase
      .from("trivia_sessions")
      .select("id,status,created_at")
      .eq("trivia_card_id", trivia.id)
      .neq("status", "finished")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sessionErr || !session) {
      setParticipantsCount(0);
      setPendingCount(0);
      setActiveSessionId(null);
      return;
    }

    setActiveSessionId(session.id);

    const { data: players, error: playersErr } = await supabase
      .from("trivia_players")
      .select("id,status")
      .eq("session_id", session.id);

    if (playersErr || !players) {
      setParticipantsCount(0);
      setPendingCount(0);
      return;
    }

    setParticipantsCount(players.length);
    setPendingCount(players.filter((p) => p.status === "pending").length);
  }

  useEffect(() => {
    let isMounted = true;

    const doLoad = async () => {
      if (!isMounted) return;
      await loadCounts();
    };

    doLoad();
    const id = setInterval(doLoad, 2000);

    return () => {
      isMounted = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trivia.id]);

  /* ------------------------------------------------------------
     LEADERBOARD LOADER
 ------------------------------------------------------------ */
  async function loadLeaderboard(cancelledRef?: { current: boolean }) {
    if (!trivia?.id) return;

    if (lastLeaderboardRef.current.length === 0) setLeaderboardLoading(true);

    try {
      const { data: session, error: sessionErr } = await supabase
        .from("trivia_sessions")
        .select("id,status,created_at")
        .eq("trivia_card_id", trivia.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sessionErr || !session) {
        if (
          !cancelledRef?.current &&
          !sameLeaderboard([], lastLeaderboardRef.current)
        ) {
          lastLeaderboardRef.current = [];
          setLeaderboard([]);
        }
        return;
      }

      const { data: players, error: playersErr } = await supabase
        .from("trivia_players")
        .select("id,status,display_name,photo_url")
        .eq("session_id", session.id);

      if (playersErr || !players) {
        if (
          !cancelledRef?.current &&
          !sameLeaderboard([], lastLeaderboardRef.current)
        ) {
          lastLeaderboardRef.current = [];
          setLeaderboard([]);
        }
        return;
      }

      const approved = players.filter((p) => p.status === "approved");
      if (approved.length === 0) {
        if (
          !cancelledRef?.current &&
          !sameLeaderboard([], lastLeaderboardRef.current)
        ) {
          lastLeaderboardRef.current = [];
          setLeaderboard([]);
        }
        return;
      }

      const playerIds = approved.map((p) => p.id);

      const { data: answers, error: answersErr } = await supabase
        .from("trivia_answers")
        .select("player_id,points")
        .in("player_id", playerIds);

      if (answersErr) {
        console.error("❌ leaderboard answers fetch error:", answersErr);
        return;
      }

      const totals = new Map<string, number>();
      for (const a of answers || []) {
        const pts = typeof a.points === "number" ? a.points : 0;
        totals.set(a.player_id, (totals.get(a.player_id) || 0) + pts);
      }

      const rows: LeaderRow[] = approved.map((p, index) => ({
        playerId: p.id,
        label: (p.display_name || "").trim() || `Player ${index + 1}`,
        totalPoints: totals.get(p.id) || 0,
      }));

      rows.sort((a, b) => b.totalPoints - a.totalPoints);

      if (
        !cancelledRef?.current &&
        !sameLeaderboard(rows, lastLeaderboardRef.current)
      ) {
        lastLeaderboardRef.current = rows;
        setLeaderboard(rows);
      }
    } finally {
      if (!cancelledRef?.current) setLeaderboardLoading(false);
    }
  }

  /* ------------------------------------------------------------
     LEADERBOARD AUTO-REFRESH
 ------------------------------------------------------------ */
  useEffect(() => {
    if (activeTab !== "leaderboard") return;
    if (!trivia?.id) return;

    const cancelledRef = { current: false };

    const debounceLoad = () => {
      if (leaderboardDebounceRef.current) {
        window.clearTimeout(leaderboardDebounceRef.current);
      }
      leaderboardDebounceRef.current = window.setTimeout(() => {
        loadLeaderboard(cancelledRef);
      }, 250);
    };

    const primeQuestionIds = async () => {
      const { data, error } = await supabase
        .from("trivia_questions")
        .select("id")
        .eq("trivia_card_id", trivia.id);

      if (error) {
        console.warn("⚠️ primeQuestionIds error:", error);
        questionIdsRef.current = new Set();
        return;
      }
      questionIdsRef.current = new Set((data || []).map((q: any) => q.id));
    };

    primeQuestionIds().then(() => loadLeaderboard(cancelledRef));

    const sessionChannel = supabase
      .channel(`dashboard-trivia-sessions-${trivia.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "trivia_sessions",
          filter: `trivia_card_id=eq.${trivia.id}`,
        },
        (payload: any) => {
          const next = payload?.new;
          if (!next) return;

          const startedAt = (next.question_started_at ?? null) as string | null;
          const currentQ = (next.current_question ?? null) as number | null;

          const changed =
            startedAt !== lastQuestionStartedAtRef.current ||
            currentQ !== lastCurrentQuestionRef.current;

          if (!changed) return;

          lastQuestionStartedAtRef.current = startedAt;
          lastCurrentQuestionRef.current = currentQ;

          debounceLoad();
        }
      )
      .subscribe();

    const answersChannel = supabase
      .channel(`dashboard-trivia-answers-${trivia.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "trivia_answers",
        },
        (payload: any) => {
          const qid =
            payload?.new?.question_id ?? payload?.old?.question_id ?? null;

          if (!qid) return;
          if (!questionIdsRef.current.has(qid)) return;

          debounceLoad();
        }
      )
      .subscribe();

    const pollId = window.setInterval(() => {
      loadLeaderboard(cancelledRef);
    }, 4000);

    return () => {
      cancelledRef.current = true;

      if (leaderboardDebounceRef.current) {
        window.clearTimeout(leaderboardDebounceRef.current);
        leaderboardDebounceRef.current = null;
      }

      window.clearInterval(pollId);
      supabase.removeChannel(sessionChannel);
      supabase.removeChannel(answersChannel);
    };
  }, [activeTab, trivia?.id]);

  /* ------------------------------------------------------------
     QUESTION ACTIONS
 ------------------------------------------------------------ */
  async function handleSetQuestionActive(id: string, active: boolean) {
    const { data, error } = await supabase
      .from("trivia_questions")
      .update({ is_active: active })
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) {
      console.error("❌ Toggle question active error:", error);
      return;
    }

    if (data) {
      setQuestions((prev) =>
        prev.map((q) => (q.id === id ? { ...q, is_active: data.is_active } : q))
      );
    }
  }

  async function handleAddAllQuestions() {
    const { data, error } = await supabase
      .from("trivia_questions")
      .update({ is_active: true })
      .eq("trivia_card_id", trivia.id)
      .select();

    if (error) {
      console.error("❌ Add all questions error:", error);
      return;
    }

    if (data) {
      setQuestions((prev) =>
        prev.map((q) => {
          const updated = data.find((d) => d.id === q.id);
          return updated ? { ...q, is_active: updated.is_active } : q;
        })
      );
    }
  }

  /* ------------------------------------------------------------
     DELETE TRIVIA
 ------------------------------------------------------------ */
  async function handleDeleteTrivia() {
    const yes = confirm(
      `Delete trivia "${trivia.public_name}"?\n\nThis will permanently remove:\n• The trivia game\n• All questions & answers linked to it\n\nThis cannot be undone.`
    );

    if (!yes) return;

    await supabase.from("trivia_cards").delete().eq("id", trivia.id);
    onDelete?.(trivia.id);
  }

  /* ------------------------------------------------------------
     ✅ GUARDED SESSION UPDATE (atomic, prevents double-advance)
  ------------------------------------------------------------ */
  async function guardedSessionUpdate(args: {
    sessionId: string;
    expect: {
      status?: string;
      wall_phase?: WallPhase;
      wall_phase_started_at?: string | null;
      current_question?: number | null;
    };
    patch: any;
  }): Promise<boolean> {
    let q = supabase.from("trivia_sessions").update(args.patch).eq("id", args.sessionId);

    if (typeof args.expect.status === "string") q = q.eq("status", args.expect.status);
    if (typeof args.expect.wall_phase === "string") q = q.eq("wall_phase", args.expect.wall_phase);
    if (typeof args.expect.wall_phase_started_at === "string")
      q = q.eq("wall_phase_started_at", args.expect.wall_phase_started_at);
    if (args.expect.wall_phase_started_at === null)
      q = q.is("wall_phase_started_at", null);

    if (typeof args.expect.current_question === "number")
      q = q.eq("current_question", args.expect.current_question);
    if (args.expect.current_question === null)
      q = q.is("current_question", null);

    const { data, error } = await q.select("id").limit(1);

    if (error) {
      console.error("❌ guardedSessionUpdate error:", error);
      return false;
    }

    // if update affected 0 rows, guard prevented it (someone else already advanced)
    return Array.isArray(data) && data.length > 0;
  }

  /* ------------------------------------------------------------
     ▶️ PLAY TRIVIA
     ✅ now seeds wall_phase + wall_phase_started_at too
 ------------------------------------------------------------ */
  async function handlePlayTrivia() {
    if (playLockRef.current) return;
    if (cardCountdownActive || cardStatus === "running") return;

    playLockRef.current = true;

    try {
      const { count: qCount, error: qCountErr } = await supabase
        .from("trivia_questions")
        .select("*", { count: "exact", head: true })
        .eq("trivia_card_id", trivia.id)
        .eq("is_active", true);

      if (qCountErr) console.warn("⚠️ trivia_questions count error:", qCountErr);

      if (!qCount || qCount < 1) {
        alert("This trivia has no ACTIVE questions yet.");
        return;
      }

      const { data: session, error: sessionErr } = await supabase
        .from("trivia_sessions")
        .select("id,status,created_at")
        .eq("trivia_card_id", trivia.id)
        .neq("status", "finished")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sessionErr || !session) {
        alert("No players have joined this trivia yet.");
        console.error("❌ No active session for Play:", sessionErr);
        return;
      }

      setActiveSessionId(session.id);

      const { data: players, error: playersErr } = await supabase
        .from("trivia_players")
        .select("id,status")
        .eq("session_id", session.id);

      if (playersErr) console.error("❌ trivia_players check error:", playersErr);

      const hasApproved =
        (players || []).some((p) => p.status === "approved") || false;

      if (!hasApproved) {
        alert("You must approve at least one player before starting the game.");
        return;
      }

      const nowIso = new Date().toISOString();

      await supabase
        .from("trivia_cards")
        .update({
          countdown_active: true,
          countdown_started_at: nowIso,
          status: "waiting",
          countdown_seconds: countdownSeconds,
        })
        .eq("id", trivia.id);

      setCardCountdownActive(true);
      setCardStatus("waiting");

      if (playTimeoutRef.current) {
        window.clearTimeout(playTimeoutRef.current);
        playTimeoutRef.current = null;
      }

      const ms = Math.max(1, countdownSeconds) * 1000;

      playTimeoutRef.current = window.setTimeout(async () => {
        try {
          await supabase
            .from("trivia_cards")
            .update({
              status: "running",
              countdown_active: false,
            })
            .eq("id", trivia.id);

          const startIso = new Date().toISOString();

          const { error: sessionUpdateErr } = await supabase
            .from("trivia_sessions")
            .update({
              status: "running",
              current_question: 1,
              question_started_at: startIso,
              wall_phase: "question",
              wall_phase_started_at: startIso,
            })
            .eq("id", session.id);

          if (sessionUpdateErr) {
            console.error("❌ trivia_sessions start error:", sessionUpdateErr);
          }

          setCardCountdownActive(false);
          setCardStatus("running");
        } finally {
          playTimeoutRef.current = null;
          playLockRef.current = false;
        }
      }, ms);
    } finally {
      if (!cardCountdownActive && cardStatus !== "waiting") {
        playLockRef.current = false;
      }
    }
  }

  /* ------------------------------------------------------------
     ⏹ STOP TRIVIA
 ------------------------------------------------------------ */
  async function handleStopTrivia() {
    if (playTimeoutRef.current) {
      window.clearTimeout(playTimeoutRef.current);
      playTimeoutRef.current = null;
    }
    playLockRef.current = false;

    await supabase
      .from("trivia_cards")
      .update({
        status: "finished",
        countdown_active: false,
      })
      .eq("id", trivia.id);

    await supabase
      .from("trivia_sessions")
      .update({ status: "finished" })
      .eq("trivia_card_id", trivia.id)
      .neq("status", "finished");

    setCardStatus("finished");
    setCardCountdownActive(false);
  }

  /* ------------------------------------------------------------
     ✅ BRUTE FORCE AUTO CONDUCTOR (dashboard is the authority)
     - prevents skipping by using guarded atomic updates
     - even if multiple tabs try, only one wins each transition
  ------------------------------------------------------------ */
  useEffect(() => {
    // only run in AUTO mode
    if (playMode !== "auto") return;

    // only run when game is actually running
    if (cardStatus !== "running") return;
    if (cardCountdownActive) return;
    if (!activeSessionId) return;

    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;

      const { data: session, error } = await supabase
        .from("trivia_sessions")
        .select(
          "id,status,current_question,question_started_at,wall_phase,wall_phase_started_at"
        )
        .eq("id", activeSessionId)
        .maybeSingle();

      if (error || !session) return;
      if (session.status !== "running") return;

      const nowIso = new Date().toISOString();
      const nowMs = Date.now();

      const phase = (session.wall_phase || "question") as WallPhase;
      const phaseStartedAt = session.wall_phase_started_at || session.question_started_at;
      const phaseStartMs = phaseStartedAt ? new Date(phaseStartedAt).getTime() : nowMs;

      const elapsed = Math.max(0, nowMs - phaseStartMs);
      const qIndex = Number(session.current_question || 1);

      // fetch active question count (cheap count query, once per tick is ok at 250ms? no)
      // So: only refresh count occasionally.
    };

    // ✅ lightweight active question count cache (refresh every 5s)
    const activeCountRef = { current: 1 };
    let lastCountAt = 0;

    const refreshActiveCount = async () => {
      const now = Date.now();
      if (now - lastCountAt < 5000) return;
      lastCountAt = now;

      const { count } = await supabase
        .from("trivia_questions")
        .select("*", { count: "exact", head: true })
        .eq("trivia_card_id", trivia.id)
        .eq("is_active", true);

      activeCountRef.current = Math.max(1, Number(count || 1));
    };

    const conductorTick = async () => {
      if (cancelled) return;

      await refreshActiveCount();

      const { data: session, error } = await supabase
        .from("trivia_sessions")
        .select(
          "id,status,current_question,question_started_at,wall_phase,wall_phase_started_at"
        )
        .eq("id", activeSessionId)
        .maybeSingle();

      if (error || !session) return;
      if (session.status !== "running") return;

      const nowIso = new Date().toISOString();
      const nowMs = Date.now();

      const phase = (session.wall_phase || "question") as WallPhase;
      const phaseStartedAt =
        session.wall_phase_started_at || session.question_started_at || null;

      const phaseStartMs = phaseStartedAt ? new Date(phaseStartedAt).getTime() : nowMs;
      const elapsed = Math.max(0, nowMs - phaseStartMs);

      const qIndex = Number(session.current_question || 1);
      const totalQ = activeCountRef.current;

      // hard clamp (never allow skipping beyond total)
      const safeQ = Math.max(1, Math.min(totalQ, qIndex));

      // Phase timing
      const QUESTION_MS = Math.max(1, Number(timerSeconds || 30)) * 1000;

      // Decide transition
      if (phase === "question" && elapsed >= QUESTION_MS) {
        // question -> overlay
        await guardedSessionUpdate({
          sessionId: activeSessionId,
          expect: {
            status: "running",
            wall_phase: "question",
            wall_phase_started_at: phaseStartedAt,
            current_question: safeQ,
          },
          patch: {
            wall_phase: "overlay",
            wall_phase_started_at: nowIso,
          },
        });
        return;
      }

      if (phase === "overlay" && elapsed >= OVERLAY_MS) {
        // overlay -> reveal
        await guardedSessionUpdate({
          sessionId: activeSessionId,
          expect: {
            status: "running",
            wall_phase: "overlay",
            wall_phase_started_at: phaseStartedAt,
            current_question: safeQ,
          },
          patch: {
            wall_phase: "reveal",
            wall_phase_started_at: nowIso,
          },
        });
        return;
      }

      if (phase === "reveal" && elapsed >= REVEAL_MS) {
        // reveal -> leaderboard
        await guardedSessionUpdate({
          sessionId: activeSessionId,
          expect: {
            status: "running",
            wall_phase: "reveal",
            wall_phase_started_at: phaseStartedAt,
            current_question: safeQ,
          },
          patch: {
            wall_phase: "leaderboard",
            wall_phase_started_at: nowIso,
          },
        });
        return;
      }

      if (phase === "leaderboard" && elapsed >= LEADERBOARD_MS) {
        // leaderboard -> next question (strict +1)
        const nextQ = safeQ + 1;

        if (nextQ > totalQ) {
          // end game
          await guardedSessionUpdate({
            sessionId: activeSessionId,
            expect: {
              status: "running",
              wall_phase: "leaderboard",
              wall_phase_started_at: phaseStartedAt,
              current_question: safeQ,
            },
            patch: {
              status: "finished",
              wall_phase: "podium",
              wall_phase_started_at: nowIso,
            },
          });

          await supabase
            .from("trivia_cards")
            .update({ status: "finished" })
            .eq("id", trivia.id);

          return;
        }

        // next question
        await guardedSessionUpdate({
          sessionId: activeSessionId,
          expect: {
            status: "running",
            wall_phase: "leaderboard",
            wall_phase_started_at: phaseStartedAt,
            current_question: safeQ,
          },
          patch: {
            current_question: nextQ,
            question_started_at: nowIso,
            wall_phase: "question",
            wall_phase_started_at: nowIso,
          },
        });
        return;
      }
    };

    // run fast, but transitions are guarded so no double-advancing
    conductorTickRef.current = window.setInterval(conductorTick, 250);

    return () => {
      cancelled = true;
      if (conductorTickRef.current) {
        window.clearInterval(conductorTickRef.current);
        conductorTickRef.current = null;
      }
    };
  }, [playMode, cardStatus, cardCountdownActive, activeSessionId, timerSeconds, trivia.id]);

  /* ------------------------------------------------------------
     PAGINATION DERIVED VALUES
 ------------------------------------------------------------ */
  const totalPages =
    questions.length > 0 ? Math.ceil(questions.length / PAGE_SIZE) : 1;

  const safePage = Math.min(currentPage, totalPages - 1);
  const startIndex = safePage * PAGE_SIZE;
  const visibleQuestions = questions.slice(startIndex, startIndex + PAGE_SIZE);

  const isActiveBorder = cardStatus === "running" || cardCountdownActive;
  const cardBgStyle = getTriviaCardBackground(trivia);

  return (
    <div
      className={cn(
        "rounded-xl p-5 shadow-lg",
        "col-span-2 row-span-2 min-h-[420px] w-full",
        isActiveBorder
          ? "border-4 border-lime-400 shadow-[0_0_28px_rgba(190,242,100,0.7)]"
          : "border border-white/10"
      )}
      style={cardBgStyle}
    >
      <Tabs.Root
        value={activeTab}
        onValueChange={(val) =>
          setActiveTab(val as "menu" | "questions" | "leaderboard" | "settings")
        }
      >
        <Tabs.List
          className={cn(
            "flex",
            "gap-6",
            "mb-4",
            "border-b",
            "border-white/10",
            "pb-2"
          )}
        >
          {[
            { value: "menu", label: "Home" },
            { value: "questions", label: "Questions" },
            { value: "leaderboard", label: "Leaderboard" },
            { value: "settings", label: "Trivia Settings" },
          ].map((tab) => (
            <Tabs.Trigger
              key={tab.value}
              value={tab.value}
              onClick={tab.value === "questions" ? loadQuestions : undefined}
              className={cn(
                "px-2",
                "py-1",
                "text-sm",
                "font-medium",
                "data-[state=active]:text-blue-400"
              )}
            >
              {tab.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        {/* ---------------- HOME ---------------- */}
        <Tabs.Content value="menu">
          <div
            className={cn("grid", "grid-cols-3", "gap-2", "mb-4", "items-center")}
          >
            <div>
              <p className={cn("text-sm", "opacity-70")}>Difficulty</p>
              <p className="font-semibold">{trivia.difficulty}</p>
            </div>
            <div className="text-center">
              <p className={cn("text-lg", "font-semibold")}>
                {trivia.public_name}
              </p>
            </div>
            <div className="text-right">
              <p className={cn("text-sm", "opacity-70")}>Topic</p>
              <p className="font-semibold">{trivia.topic_prompt || "—"}</p>
            </div>
          </div>

          <div className={cn("grid", "grid-cols-3", "gap-3", "mt-4")}>
            <button
              onClick={() => onLaunch(trivia.id)}
              className={cn(
                "bg-blue-600",
                "hover:bg-blue-700",
                "py-2",
                "rounded-lg",
                "font-semibold"
              )}
            >
              Launch
            </button>

            <button
              onClick={() => onOpenOptions(trivia)}
              className={cn(
                "bg-gray-700",
                "hover:bg-gray-600",
                "py-2",
                "rounded-lg",
                "font-semibold"
              )}
            >
              Options
            </button>

            <div
              className={cn(
                "bg-gray-800/80",
                "p-3",
                "rounded-lg",
                "flex",
                "flex-col",
                "items-center",
                "justify-center",
                "backdrop-blur-sm"
              )}
            >
              <p className={cn("text-xs", "opacity-75")}>Participants</p>
              <p className={cn("text-lg", "font-bold")}>{participantsCount}</p>
            </div>

            <div className={cn("flex", "flex-col", "gap-2")}>
              <button
                onClick={handlePlayTrivia}
                className={cn(
                  "bg-green-600",
                  "hover:bg-green-700",
                  "py-2",
                  "rounded-lg",
                  "font-semibold"
                )}
              >
                ▶ Play
              </button>
              <button
                onClick={handleStopTrivia}
                className={cn(
                  "bg-red-600",
                  "hover:bg-red-700",
                  "py-2",
                  "rounded-lg",
                  "font-semibold"
                )}
              >
                ⏹ Stop
              </button>
            </div>

            <div className={cn("flex", "flex-col", "gap-2")}>
              <div
                className={cn(
                  "py-2",
                  "rounded-lg",
                  "font-semibold",
                  "opacity-0",
                  "pointer-events-none"
                )}
              >
                spacer
              </div>
              <button
                onClick={handleDeleteTrivia}
                className={cn(
                  "bg-red-700",
                  "hover:bg-red-800",
                  "py-2",
                  "rounded-lg",
                  "font-semibold"
                )}
              >
                ❌ Delete
              </button>
            </div>

            <button
              onClick={() => onOpenModeration?.(trivia)}
              className={cn(
                "bg-purple-600",
                "hover:bg-purple-700",
                "py-2",
                "rounded-lg",
                "font-semibold",
                "w-full",
                "flex",
                "flex-col",
                "items-center",
                "justify-content",
                "text-sm"
              )}
            >
              <span>Moderate Players</span>
              <span className={cn("text-[11px]", "opacity-80", "mt-0.5")}>
                {`(Waiting ${pendingCount} Players)`}
              </span>
            </button>
          </div>

          <div className="mt-3 text-[11px] opacity-70">
            Auto Conductor:{" "}
            {playMode === "auto" && cardStatus === "running" && !cardCountdownActive
              ? "ON (dashboard driving phases)"
              : "OFF"}
          </div>
        </Tabs.Content>

        {/* ---------------- QUESTIONS ---------------- */}
        <Tabs.Content value="questions" className={cn("mt-4", "space-y-3")}>
          <div className={cn("flex", "items-center", "justify-between")}>
            <div className={cn("text-xs", "opacity-70")}>
              Total questions: {questions.length}
            </div>

            <button
              type="button"
              onClick={handleAddAllQuestions}
              disabled={questions.length === 0}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-semibold",
                "border border-blue-400/60",
                "bg-blue-500/20 hover:bg-blue-500/30",
                questions.length === 0 && "opacity-40 cursor-not-allowed"
              )}
            >
              ➕ Add All to Game
            </button>
          </div>

          {loadingQuestions && <p className="opacity-70">Loading questions…</p>}

          {!loadingQuestions && questions.length === 0 && (
            <p className={cn("opacity-70", "italic")}>No questions found.</p>
          )}

          {!loadingQuestions && questions.length > 0 && (
            <>
              <div
                className={cn(
                  "max-h-80",
                  "overflow-y-auto",
                  "space-y-3",
                  "pr-1"
                )}
              >
                {visibleQuestions.map((q) => {
                  const isActive = !!q.is_active;

                  return (
                    <div
                      key={q.id}
                      className={cn(
                        "border rounded-lg p-4 bg-gray-900/70 backdrop-blur-sm",
                        isActive
                          ? "border-green-500/40"
                          : "border-red-500/40 opacity-80"
                      )}
                    >
                      <div
                        className={cn(
                          "flex",
                          "items-start",
                          "justify-between",
                          "gap-2",
                          "mb-2"
                        )}
                      >
                        <div>
                          <p className={cn("font-semibold")}>
                            R{q.round_number}. {q.question_text}
                          </p>
                          <p
                            className={cn(
                              "text-[0.7rem] mt-1",
                              isActive ? "text-green-300/80" : "text-red-300/80"
                            )}
                          >
                            {isActive ? "Included in game" : "Not in game"}
                          </p>
                        </div>

                        <div className={cn("flex", "flex-col", "gap-1")}>
                          <button
                            type="button"
                            onClick={() => handleSetQuestionActive(q.id, true)}
                            disabled={isActive}
                            className={cn(
                              "w-7 h-7 flex items-center justify-center",
                              "rounded-md text-xs font-bold",
                              isActive
                                ? "bg-gray-600/50 text-gray-300 cursor-not-allowed"
                                : "bg-green-600 hover:bg-green-700 text-white"
                            )}
                            title="Add this question to the game"
                          >
                            +
                          </button>

                          <button
                            type="button"
                            onClick={() => handleSetQuestionActive(q.id, false)}
                            disabled={!isActive}
                            className={cn(
                              "w-7 h-7 flex items-center justify-center",
                              "rounded-md text-xs font-bold",
                              !isActive
                                ? "bg-gray-600/50 text-gray-300 cursor-not-allowed"
                                : "bg-red-600 hover:bg-red-700 text-white"
                            )}
                            title="Remove this question from the game"
                          >
                            −
                          </button>
                        </div>
                      </div>

                      <ul className={cn("grid", "grid-cols-2", "gap-2")}>
                        {q.options.map((opt: string, i: number) => (
                          <li
                            key={i}
                            className={cn(
                              "p-2 rounded-md text-sm",
                              i === q.correct_index
                                ? "bg-green-600/30 border border-green-500/40"
                                : "bg-black/30"
                            )}
                          >
                            {String.fromCharCode(65 + i)}. {opt}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>

              {questions.length > PAGE_SIZE && (
                <div
                  className={cn(
                    "flex",
                    "items-center",
                    "justify-between",
                    "mt-2",
                    "text-xs"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                    disabled={safePage === 0}
                    className={cn(
                      "px-2 py-1 rounded-md border border-white/10",
                      safePage === 0
                        ? "opacity-40 cursor-not-allowed"
                        : "hover:bg-white/5"
                    )}
                  >
                    ◀ Prev 5
                  </button>

                  <span className="opacity-70">
                    Page {safePage + 1} of {totalPages}
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages - 1, p + 1))
                    }
                    disabled={safePage >= totalPages - 1}
                    className={cn(
                      "px-2 py-1 rounded-md border border-white/10",
                      safePage >= totalPages - 1
                        ? "opacity-40 cursor-not-allowed"
                        : "hover:bg-white/5"
                    )}
                  >
                    Next 5 ▶
                  </button>
                </div>
              )}
            </>
          )}
        </Tabs.Content>

        {/* ---------------- LEADERBOARD ---------------- */}
        <Tabs.Content value="leaderboard" className={cn("mt-4", "space-y-3")}>
          {leaderboardLoading && (
            <p className={cn("text-xs", "opacity-70")}>Loading leaderboard…</p>
          )}

          {!leaderboardLoading && leaderboard.length === 0 && (
            <p className={cn("text-sm", "opacity-75", "italic")}>
              No scores yet. Leaderboard will appear once players start answering
              questions.
            </p>
          )}

          {!leaderboardLoading && leaderboard.length > 0 && (
            <div className="space-y-2">
              {leaderboard.map((row, idx) => (
                <div
                  key={row.playerId}
                  className={cn(
                    "flex",
                    "items-center",
                    "justify-between",
                    "rounded-lg",
                    "bg-gray-900/70",
                    "border",
                    "border-white/10",
                    "px-3",
                    "py-2"
                  )}
                >
                  <div className={cn("flex", "items-center", "gap-3")}>
                    <div
                      className={cn(
                        "w-8",
                        "h-8",
                        "rounded-full",
                        "bg-blue-500/40",
                        "flex",
                        "items-center",
                        "justify-center",
                        "font-bold",
                        "text-xs"
                      )}
                    >
                      {idx + 1}
                    </div>

                    <div className={cn("text-sm", "font-semibold")}>
                      {row.label}
                    </div>
                  </div>

                  <div className={cn("text-lg", "font-bold")}>
                    {row.totalPoints}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Tabs.Content>

        {/* ---------------- SETTINGS ---------------- */}
        <Tabs.Content value="settings" className={cn("mt-4", "space-y-4")}>
          <div
            className={cn("flex", "items-center", "justify-between", "gap-4")}
          >
            <div>
              <p className={cn("text-sm", "font-semibold")}>Countdown Timer</p>
              <p className={cn("text-xs", "opacity-70")}>
                How long the wall stays on the QR / "Starting soon" screen after you press Play.
              </p>
            </div>
            <select
              value={countdownSeconds}
              onChange={handleCountdownSecondsChange}
              className={cn(
                "bg-gray-800",
                "border",
                "border-white/20",
                "rounded-md",
                "px-3",
                "py-1.5",
                "text-sm",
                "outline-none",
                "focus:border-blue-400"
              )}
            >
              {COUNTDOWN_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className={cn("flex", "items-center", "justify-between", "gap-4")}>
            <div>
              <p className={cn("text-sm", "font-semibold")}>Question Timer</p>
              <p className={cn("text-xs", "opacity-70")}>
                How long each question stays open before locking.
              </p>
            </div>
            <select
              value={timerSeconds}
              onChange={handleTimerChange}
              className={cn(
                "bg-gray-800",
                "border",
                "border-white/20",
                "rounded-md",
                "px-3",
                "py-1.5",
                "text-sm",
                "outline-none",
                "focus:border-blue-400"
              )}
            >
              <option value={10}>10 seconds</option>
              <option value={15}>15 seconds</option>
              <option value={30}>30 seconds</option>
            </select>
          </div>

          <div className={cn("flex", "items-center", "justify-between", "gap-4")}>
            <div>
              <p className={cn("text-sm", "font-semibold")}>Game Flow Mode</p>
              <p className={cn("text-xs", "opacity-70")}>
                Auto = dashboard advances phases/questions. Manual = you advance with space bar (if you have that wired).
              </p>
            </div>
            <select
              value={playMode}
              onChange={handlePlayModeChange}
              className={cn(
                "bg-gray-800",
                "border",
                "border-white/20",
                "rounded-md",
                "px-3",
                "py-1.5",
                "text-sm",
                "outline-none",
                "focus:border-blue-400"
              )}
            >
              <option value="auto">Auto (dashboard conductor)</option>
              <option value="manual">Manual</option>
            </select>
          </div>

          <div className={cn("flex", "items-center", "justify-between", "gap-4")}>
            <div>
              <p className={cn("text-sm", "font-semibold")}>Scoring Mode</p>
              <p className={cn("text-xs", "opacity-70")}>
                Choose the point scale per question (faster answers earn more).
              </p>
            </div>
            <select
              value={scoringMode}
              onChange={handleScoringModeChange}
              className={cn(
                "bg-gray-800",
                "border",
                "border-white/20",
                "rounded-md",
                "px-3",
                "py-1.5",
                "text-sm",
                "outline-none",
                "focus:border-blue-400"
              )}
            >
              <option value="100s">100s (max 100 pts / Q)</option>
              <option value="1000s">1000s (max 1,000 pts / Q)</option>
              <option value="10000s">10000s (max 10,000 pts / Q)</option>
            </select>
          </div>

          <div className={cn("flex", "items-center", "justify-between", "gap-4")}>
            <div>
              <p className={cn("text-sm", "font-semibold")}>Require Selfie</p>
              <p className={cn("text-xs", "opacity-70")}>
                When enabled, players must upload a selfie and go through moderation before appearing on the wall.
              </p>
            </div>
            <select
              value={requireSelfie ? "on" : "off"}
              onChange={handleRequireSelfieChange}
              className={cn(
                "bg-gray-800",
                "border",
                "border-white/20",
                "rounded-md",
                "px-3",
                "py-1.5",
                "text-sm",
                "outline-none",
                "focus:border-blue-400"
              )}
            >
              <option value="on">On</option>
              <option value="off">Off</option>
            </select>
          </div>

          <div className={cn("flex", "items-center", "justify-between", "gap-4")}>
            <div>
              <p className={cn("text-sm", "font-semibold")}>Show Ads on Phone</p>
              <p className={cn("text-xs", "opacity-70")}>
                When enabled, the phone UI shows an ad image that changes each new question.
              </p>
            </div>
            <select
              value={adsEnabled ? "on" : "off"}
              onChange={handleAdsEnabledChange}
              className={cn(
                "bg-gray-800",
                "border",
                "border-white/20",
                "rounded-md",
                "px-3",
                "py-1.5",
                "text-sm",
                "outline-none",
                "focus:border-blue-400"
              )}
            >
              <option value="on">On</option>
              <option value="off">Off</option>
            </select>
          </div>

          {savingSettings && (
            <p className={cn("text-xs", "opacity-70")}>Saving settings…</p>
          )}
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
