"use client";

import { cn } from "@/lib/utils";
import * as Tabs from "@radix-ui/react-tabs";
import { supabase } from "@/lib/supabaseClient";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Home, HelpCircle, UserRound, Settings } from "lucide-react";

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

  if (type === "image" && value.startsWith("http")) {
    return {
      backgroundImage: `url(${value})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }

  if (value.includes("gradient(")) {
    return { backgroundImage: value };
  }

  return { background: value || "#1b2638" };
}

type TabValue = "menu" | "questions" | "leaderboard" | "settings1" | "settings2";
type TabDef = {
  value: TabValue;
  label: string;
  icon: ReactNode;
  mobileSuffix?: string;
};

export default function TriviaCard({
  trivia,
  onOpenOptions,
  onDelete,
  onLaunch,
  onOpenModeration,
  onRegenerateQuestions,
}: {
  trivia: any;
  onOpenOptions: (trivia: any) => void;
  onDelete: (id: string) => void;
  onLaunch: (id: string) => void;
  onOpenModeration?: (trivia: any) => void;
  onRegenerateQuestions?: (trivia: any) => void;
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
  const TIMER_OPTIONS = [30, 15, 12, 10];

  const normalizeTimerSeconds = (n: any) => {
    const v = Number(n);
    if (TIMER_OPTIONS.includes(v)) return v;
    return 30;
  };

  // ✅ scoring_mode in DB is "flat" | "speed"
  const normalizeScoringMode = (raw: any): "flat" | "speed" => {
    const v = String(raw || "").trim();

    // allow legacy/old values to safely map to flat
    if (v === "speed") return "speed";
    if (v === "flat") return "flat";
    if (v === "hundreds" || v === "100s" || v === "100") return "flat";

    return "flat";
  };

  const [timerSeconds, setTimerSeconds] = useState<number>(
    normalizeTimerSeconds(trivia?.timer_seconds ?? 30)
  );

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

  // ✅ FIX: this must be "flat" | "speed" (NOT "100s")
  const [scoringMode, setScoringMode] = useState<"flat" | "speed">(
    normalizeScoringMode(trivia?.scoring_mode)
  );

  const [requireSelfie, setRequireSelfie] = useState<boolean>(
    trivia?.require_selfie ?? true
  );

  const [adsEnabled, setAdsEnabled] = useState<boolean>(!!trivia?.ads_enabled);

  const [progressiveWrongRemovalEnabled, setProgressiveWrongRemovalEnabled] =
    useState<boolean>(!!trivia?.progressive_wrong_removal_enabled);

  const [highlightTheHerdEnabled, setHighlightTheHerdEnabled] =
    useState<boolean>(!!trivia?.highlight_the_herd_enabled);

  const [streakMultiplierEnabled, setStreakMultiplierEnabled] =
    useState<boolean>(!!trivia?.streak_multiplier_enabled);

  // ✅ points_type in DB is "100s" | "1000s" | "10000s"
  const [pointsType, setPointsType] = useState<string>(
    trivia?.points_type || "100s"
  );

  const [savingSettings, setSavingSettings] = useState(false);

  /* ------------------------------------------------------------
     CARD STATUS
  ------------------------------------------------------------ */
  const [cardStatus, setCardStatus] = useState<string>(trivia.status);
  const [cardCountdownActive, setCardCountdownActive] = useState<boolean>(
    !!trivia.countdown_active
  );

  /* ------------------------------------------------------------
     ACTIVE SESSION
  ------------------------------------------------------------ */
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  /* ------------------------------------------------------------
     PAUSE STATE
  ------------------------------------------------------------ */
  const [pauseBusy, setPauseBusy] = useState(false);

  /* ------------------------------------------------------------
     PARTICIPANTS / PENDING / ACTIVE COUNTS
  ------------------------------------------------------------ */
  const [participantsCount, setParticipantsCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [activePlayersCount, setActivePlayersCount] = useState(0);

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
     ACTIVE TAB
  ------------------------------------------------------------ */
  const [activeTab, setActiveTab] = useState<TabValue>("menu");

  /* ------------------------------------------------------------
     Sync with trivia props
  ------------------------------------------------------------ */
  useEffect(() => {
    setTimerSeconds(normalizeTimerSeconds(trivia?.timer_seconds ?? 30));
    setCountdownSeconds(
      normalizeCountdownSeconds(trivia?.countdown_seconds ?? 10)
    );
    setPlayMode(trivia?.play_mode || "auto");

    // ✅ FIX: normalize scoring_mode from DB
    setScoringMode(normalizeScoringMode(trivia?.scoring_mode));

    setRequireSelfie(trivia?.require_selfie ?? true);
    setAdsEnabled(!!trivia?.ads_enabled);

    setProgressiveWrongRemovalEnabled(
      !!trivia?.progressive_wrong_removal_enabled
    );
    setHighlightTheHerdEnabled(!!trivia?.highlight_the_herd_enabled);
    setStreakMultiplierEnabled(!!trivia?.streak_multiplier_enabled);
    setPointsType(trivia?.points_type || "100s");

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
    trivia?.progressive_wrong_removal_enabled,
    trivia?.highlight_the_herd_enabled,
    trivia?.streak_multiplier_enabled,
    trivia?.points_type,
    trivia?.status,
    trivia?.countdown_active,
  ]);

  /* ------------------------------------------------------------
     SERVER TIME HELPER
  ------------------------------------------------------------ */
  const getServerIsoNow = async (): Promise<string> => {
    try {
      let { data, error } = await supabase.rpc("server_time");
      if (error || !data) {
        const fallback = await supabase.rpc("trivia_server_time");
        data = fallback.data;
        error = fallback.error;
      }
      if (!error && data) return new Date(data as any).toISOString();
    } catch {
      // ignore
    }
    return new Date().toISOString();
  };

  /* ------------------------------------------------------------
     Poll trivia_cards
  ------------------------------------------------------------ */
  useEffect(() => {
    let isMounted = true;

    const pollCard = async () => {
      if (!trivia?.id) return;

      // ✅ FIX: include scoring_mode + points_type
      const { data, error } = await supabase
        .from("trivia_cards")
        .select(
          "status, countdown_active, countdown_seconds, background_type, background_value, ads_enabled, progressive_wrong_removal_enabled, highlight_the_herd_enabled, streak_multiplier_enabled, points_type, scoring_mode"
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

      setProgressiveWrongRemovalEnabled(
        !!(data as any).progressive_wrong_removal_enabled
      );
      setHighlightTheHerdEnabled(!!(data as any).highlight_the_herd_enabled);
      setStreakMultiplierEnabled(!!(data as any).streak_multiplier_enabled);

      setCountdownSeconds(
        normalizeCountdownSeconds((data as any).countdown_seconds ?? 10)
      );

      setPointsType((data as any).points_type || "100s");
      setScoringMode(normalizeScoringMode((data as any).scoring_mode));

      // keep local trivia object in sync (since you mutate it elsewhere)
      trivia.background_type = data.background_type;
      trivia.background_value = data.background_value;
      trivia.ads_enabled = data.ads_enabled;
      trivia.countdown_seconds = (data as any).countdown_seconds;
      trivia.progressive_wrong_removal_enabled = (data as any)
        .progressive_wrong_removal_enabled;
      trivia.highlight_the_herd_enabled = (data as any).highlight_the_herd_enabled;
      trivia.streak_multiplier_enabled = (data as any).streak_multiplier_enabled;
      trivia.points_type = (data as any).points_type;
      trivia.scoring_mode = (data as any).scoring_mode;
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
    scoring_mode?: "flat" | "speed";
    require_selfie?: boolean;
    ads_enabled?: boolean;
    progressive_wrong_removal_enabled?: boolean;
    highlight_the_herd_enabled?: boolean;
    streak_multiplier_enabled?: boolean;
    points_type?: "100s" | "1000s" | "10000s" | string;
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

  // ✅ FIX: scoring_mode must be "flat" | "speed"
  async function handleScoringModeChange(e: any) {
    const value = normalizeScoringMode(e.target.value);
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

  async function handleProgressiveWrongRemovalChange(e: any) {
    const value = e.target.value === "on";
    setProgressiveWrongRemovalEnabled(value);
    await updateTriviaSettings({ progressive_wrong_removal_enabled: value });
  }

  async function handleHighlightTheHerdChange(e: any) {
    const value = e.target.value === "on";
    setHighlightTheHerdEnabled(value);
    await updateTriviaSettings({ highlight_the_herd_enabled: value });
  }

  async function handleStreakMultiplierChange(e: any) {
    const value = e.target.value === "on";
    setStreakMultiplierEnabled(value);
    await updateTriviaSettings({ streak_multiplier_enabled: value });
  }

  async function handlePointsTypeChange(e: any) {
    const value = e.target.value || "100s";
    setPointsType(value);
    await updateTriviaSettings({ points_type: value });
  }

  /* ------------------------------------------------------------
     FETCH QUESTIONS
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
     PARTICIPANTS / PENDING / ACTIVE COUNTS
  ------------------------------------------------------------ */
  async function loadCounts() {
    const { data: session, error: sessionErr } = await supabase
      .from("trivia_sessions")
      .select("id,status,created_at")
      .eq("trivia_card_id", trivia.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sessionErr || !session) {
      setParticipantsCount(0);
      setPendingCount(0);
      setActivePlayersCount(0);
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
      setActivePlayersCount(0);
      return;
    }

    setParticipantsCount(players.length);
    setPendingCount(players.filter((p) => p.status === "pending").length);

    if (!players.length) {
      setActivePlayersCount(0);
      return;
    }

    const playerIds = players.map((p) => p.id);

    const { data: answers, error: answersErr } = await supabase
      .from("trivia_answers")
      .select("player_id")
      .in("player_id", playerIds);

    if (answersErr || !answers) {
      setActivePlayersCount(0);
      return;
    }

    const activeSet = new Set<string>();
    for (const a of answers) {
      if (a.player_id) activeSet.add(a.player_id as string);
    }

    setActivePlayersCount(activeSet.size);
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
        { event: "*", schema: "public", table: "trivia_answers" },
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
     PAUSE / RESUME TRIVIA
  ------------------------------------------------------------ */
  const canPause =
    !cardCountdownActive &&
    (cardStatus === "running" || cardStatus === "paused") &&
    !!trivia?.id;

  async function handleTogglePauseTrivia() {
    if (!canPause) return;
    if (pauseBusy) return;

    setPauseBusy(true);
    try {
      const { data: session, error: sessionErr } = await supabase
        .from("trivia_sessions")
        .select("id,status,paused_at,question_started_at,wall_phase_started_at")
        .eq("trivia_card_id", trivia.id)
        .neq("status", "finished")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sessionErr || !session?.id) {
        console.warn("⚠️ pause: no active session:", sessionErr);
        return;
      }

      const nowIso = await getServerIsoNow();
      const nowMs = new Date(nowIso).getTime();

      if (cardStatus === "running") {
        await supabase
          .from("trivia_cards")
          .update({ status: "paused" })
          .eq("id", trivia.id);

        await supabase
          .from("trivia_sessions")
          .update({ status: "paused", paused_at: nowIso })
          .eq("id", session.id);

        setCardStatus("paused");
        return;
      }

      if (cardStatus === "paused") {
        const pausedAtIso = (session.paused_at ?? null) as string | null;

        let nextQuestionStartedAt: string | null =
          session.question_started_at ?? null;
        let nextWallPhaseStartedAt: string | null =
          session.wall_phase_started_at ?? null;

        if (pausedAtIso) {
          const pausedAtMs = new Date(pausedAtIso).getTime();
          const deltaMs = Math.max(0, nowMs - pausedAtMs);

          const shiftIso = (iso: string | null) =>
            iso
              ? new Date(new Date(iso).getTime() + deltaMs).toISOString()
              : null;

          nextQuestionStartedAt = shiftIso(nextQuestionStartedAt);
          nextWallPhaseStartedAt = shiftIso(nextWallPhaseStartedAt);
        }

        await supabase
          .from("trivia_cards")
          .update({ status: "running" })
          .eq("id", trivia.id);

        await supabase
          .from("trivia_sessions")
          .update({
            status: "running",
            paused_at: null,
            question_started_at: nextQuestionStartedAt,
            wall_phase_started_at: nextWallPhaseStartedAt,
          })
          .eq("id", session.id);

        setCardStatus("running");
        return;
      }
    } finally {
      setPauseBusy(false);
    }
  }

  /* ------------------------------------------------------------
     PLAY TRIVIA
  ------------------------------------------------------------ */
  async function handlePlayTrivia() {
    if (playLockRef.current) return;
    if (
      cardCountdownActive ||
      cardStatus === "running" ||
      cardStatus === "paused"
    )
      return;

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

      const countdownStartIso = await getServerIsoNow();

      await supabase
        .from("trivia_cards")
        .update({
          countdown_active: true,
          countdown_started_at: countdownStartIso,
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

          const questionStartIso = await getServerIsoNow();

          const { error: sessionUpdateErr } = await supabase
            .from("trivia_sessions")
            .update({
              status: "running",
              current_question: 1,
              question_started_at: questionStartIso,
              wall_phase: "question",
              wall_phase_started_at: questionStartIso,
              paused_at: null,
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
     STOP TRIVIA
  ------------------------------------------------------------ */
  async function handleStopTrivia() {
    if (playTimeoutRef.current) {
      window.clearTimeout(playTimeoutRef.current);
      playTimeoutRef.current = null;
    }
    playLockRef.current = false;

    const { data: session, error: sessionErr } = await supabase
      .from("trivia_sessions")
      .select("id,created_at")
      .eq("trivia_card_id", trivia.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!sessionErr && session?.id) {
      const { data: players, error: playersErr } = await supabase
        .from("trivia_players")
        .select("id")
        .eq("session_id", session.id);

      if (playersErr) {
        console.error("❌ stop: load trivia_players error:", playersErr);
      }

      if (!playersErr && players && players.length) {
        const playerIds = players.map((p: any) => p.id).filter(Boolean);

        if (playerIds.length > 0) {
          const { error: delErr } = await supabase
            .from("trivia_answers")
            .delete()
            .in("player_id", playerIds);

          if (delErr) {
            console.error("❌ stop: delete trivia_answers error:", delErr);
          }
        }

        const { error: resetPlayersErr } = await supabase
          .from("trivia_players")
          .update({
            score: 0,
            current_streak: 0,
            best_streak: 0,
          })
          .eq("session_id", session.id);

        if (resetPlayersErr) {
          console.error(
            "❌ stop: reset trivia_players score/streak error:",
            resetPlayersErr
          );
        }
      }

      const { error: sessUpErr } = await supabase
        .from("trivia_sessions")
        .update({
          status: "stopped",
          paused_at: null,
        })
        .eq("id", session.id);

      if (sessUpErr) {
        console.error("❌ stop: update trivia_sessions error:", sessUpErr);
      }
    }

    const { error: cardErr } = await supabase
      .from("trivia_cards")
      .update({
        status: "inactive",
        countdown_active: false,
        countdown_started_at: null,
      })
      .eq("id", trivia.id);

    if (cardErr) console.error("❌ stop: update trivia_cards error:", cardErr);

    setCardStatus("inactive");
    setCardCountdownActive(false);
    lastLeaderboardRef.current = [];
    setLeaderboard([]);
  }

  /* ------------------------------------------------------------
     PAGINATION DERIVED VALUES
  ------------------------------------------------------------ */
  const totalPages =
    questions.length > 0 ? Math.ceil(questions.length / PAGE_SIZE) : 1;

  const safePage = Math.min(currentPage, totalPages - 1);
  const startIndex = safePage * PAGE_SIZE;
  const visibleQuestions = questions.slice(startIndex, startIndex + PAGE_SIZE);

  const isActiveBorder =
    cardStatus === "running" || cardStatus === "paused" || cardCountdownActive;

  const cardBgStyle = getTriviaCardBackground(trivia);

  const tabDefs: TabDef[] = [
    { value: "menu", label: "Home", icon: <Home className={cn('h-5', 'w-5')} /> },
    {
      value: "questions",
      label: "Questions",
      icon: <HelpCircle className={cn('h-5', 'w-5')} />,
    },
    {
      value: "leaderboard",
      label: "Leaderboard",
      icon: <UserRound className={cn('h-5', 'w-5')} />,
    },
    {
      value: "settings1",
      label: "Settings One",
      icon: <Settings className={cn('h-5', 'w-5')} />,
      mobileSuffix: "1",
    },
    {
      value: "settings2",
      label: "Settings Two",
      icon: <Settings className={cn('h-5', 'w-5')} />,
      mobileSuffix: "2",
    },
  ];

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
        onValueChange={(val) => setActiveTab(val as TabValue)}
      >
        {/* ✅ TABS HEADER: icon-only on mobile to prevent spillover */}
        <Tabs.List
          className={cn(
            "flex items-center",
            "gap-0.5 sm:gap-6",
            "mb-4",
            "border-b border-white/10",
            "pb-2",
            "overflow-x-auto",
            "[-webkit-overflow-scrolling:touch]"
          )}
        >
          {tabDefs.map((tab) => (
            <Tabs.Trigger
              key={tab.value}
              value={tab.value}
              aria-label={tab.label}
              onClick={tab.value === "questions" ? loadQuestions : undefined}
              className={cn(
                "inline-flex items-center justify-center",
                "rounded-md",
                "min-h-[40px]",
                "w-10 sm:w-auto",
                "px-2 py-1",
                "text-xs sm:text-sm",
                "font-medium",
                "whitespace-nowrap",
                "data-[state=active]:text-blue-400",
                "data-[state=active]:bg-white/5"
              )}
            >
              {/* Mobile */}
              <span className={cn('sm:hidden', 'inline-flex', 'items-center', 'gap-1')}>
                {tab.icon}
                {tab.mobileSuffix ? (
                  <span className={cn('text-[0.7rem]', 'font-bold', 'leading-none')}>
                    {tab.mobileSuffix}
                  </span>
                ) : null}
              </span>

              {/* Desktop */}
              <span className={cn('hidden', 'sm:inline')}>{tab.label}</span>
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        {/* ---------------- HOME ---------------- */}
        <Tabs.Content value="menu">
          <div
            className={cn(
              "grid",
              "grid-cols-3",
              "gap-2",
              "mb-4",
              "items-center"
            )}
          >
            <div>
              <p className={cn("text-sm", "opacity-70")}>Difficulty</p>
              <p className="font-semibold">{trivia.difficulty}</p>
            </div>
            <div className="text-center">
              <p className={cn("text-lg", "font-semibold")}>
                {trivia.public_name}
              </p>
              {(cardStatus === "paused" || cardStatus === "waiting") && (
                <p className={cn("text-xs", "opacity-80", "mt-0.5")}>
                  {cardStatus === "paused" ? "PAUSED" : "Starting soon…"}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className={cn("text-sm", "opacity-70")}>Topic</p>
              <p className="font-semibold">{trivia.topic_prompt || "—"}</p>
            </div>
          </div>

          <div className={cn("grid", "grid-cols-3", "gap-3", "mt-4")}>
            {/* COL 1: Launch + Play / Stop / Pause */}
            <div className={cn("flex", "flex-col", "gap-2")}>
              <button
                onClick={() => onLaunch(trivia.id)}
                className={cn(
                  "bg-blue-600",
                  "hover:bg-blue-700",
                  "py-2",
                  "rounded-lg",
                  "font-semibold",
                  "h-10",
                  "flex",
                  "items-center",
                  "justify-center"
                )}
              >
                Launch
              </button>

              <button
                onClick={handlePlayTrivia}
                disabled={cardStatus === "paused"}
                className={cn(
                  "bg-green-600",
                  "hover:bg-green-700",
                  "py-2",
                  "rounded-lg",
                  "font-semibold",
                  "h-10",
                  "flex",
                  "items-center",
                  "justify-center",
                  cardStatus === "paused" && "opacity-40 cursor-not-allowed"
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
                  "font-semibold",
                  "h-10",
                  "flex",
                  "items-center",
                  "justify-center"
                )}
              >
                ⏹ Stop
              </button>

              <button
                onClick={handleTogglePauseTrivia}
                disabled={!canPause || pauseBusy}
                className={cn(
                  "py-2",
                  "rounded-lg",
                  "font-semibold",
                  "h-10",
                  "flex",
                  "items-center",
                  "justify-center",
                  cardStatus === "paused"
                    ? "bg-amber-600 hover:bg-amber-700"
                    : "bg-yellow-600 hover:bg-yellow-700",
                  (!canPause || pauseBusy) && "opacity-40 cursor-not-allowed"
                )}
              >
                {cardStatus === "paused" ? "▶ Resume" : "⏸ Pause"}
              </button>
            </div>

            {/* COL 2: Options + New AI + Delete */}
            <div className={cn("flex", "flex-col", "gap-2")}>
              <button
                onClick={() => onOpenOptions(trivia)}
                className={cn(
                  "bg-gray-700",
                  "hover:bg-gray-600",
                  "py-2",
                  "rounded-lg",
                  "font-semibold",
                  "h-10",
                  "flex",
                  "items-center",
                  "justify-center"
                )}
              >
                Options
              </button>

              <button
                onClick={() => onRegenerateQuestions?.(trivia)}
                disabled={!onRegenerateQuestions}
                className={cn(
                  "py-2",
                  "rounded-lg",
                  "font-semibold",
                  "h-10",
                  "flex",
                  "items-center",
                  "justify-center",
                  "text-xs",
                  "whitespace-nowrap",
                  onRegenerateQuestions
                    ? "bg-orange-500 hover:bg-orange-600 text-black"
                    : "bg-gray-700/60 cursor-not-allowed opacity-60"
                )}
              >
                New Questions Or Topic
              </button>

              <button
                onClick={handleDeleteTrivia}
                className={cn(
                  "bg-red-700",
                  "hover:bg-red-800",
                  "py-2",
                  "rounded-lg",
                  "font-semibold",
                  "h-10",
                  "flex",
                  "items-center",
                  "justify-center"
                )}
              >
                ❌ Delete
              </button>
            </div>

            {/* COL 3: Players + Moderate Players */}
            <div className={cn("flex", "flex-col", "gap-2")}>
              <div
                className={cn(
                  "bg-gray-800/80",
                  "p-3",
                  "rounded-lg",
                  "flex",
                  "flex-col",
                  "items-center",
                  "justify-center",
                  "backdrop-blur-sm",
                  "min-h-[72px]"
                )}
              >
                <p className={cn("text-xs", "opacity-75")}>Players</p>
                <p className={cn("text-lg", "font-bold")}>{participantsCount}</p>
                <p className={cn("text-[0.7rem]", "opacity-75", "mt-1")}>
                  Active:{" "}
                  <span className="font-semibold">{activePlayersCount}</span>
                </p>
              </div>

              <button
                onClick={() => onOpenModeration?.(trivia)}
                className={cn(
                  "py-2",
                  "rounded-lg",
                  "font-semibold",
                  "w-full",
                  "h-10",
                  "flex",
                  "items-center",
                  "justify-center",
                  "text-sm",
                  pendingCount > 0
                    ? "bg-yellow-400 hover:bg-yellow-500 text-black"
                    : "bg-purple-600 hover:bg-purple-700 text-white"
                )}
              >
                {pendingCount > 0
                  ? `Moderate (${pendingCount} waiting)`
                  : "Moderate Players"}
              </button>
            </div>
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

          {/* ... rest of your Questions / Leaderboard / Settings content unchanged ... */}

        </Tabs.Content>

        {/* NOTE:
            Your original file continues with Leaderboard + Settings One + Settings Two exactly as you pasted.
            Keep those sections the same — the only changes needed for the “spill” issue are the icon-only Tabs header above.
        */}
      </Tabs.Root>
    </div>
  );
}
