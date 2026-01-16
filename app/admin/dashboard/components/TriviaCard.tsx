"use client";

import { cn } from "@/lib/utils";
import * as Tabs from "@radix-ui/react-tabs";
import { supabase } from "@/lib/supabaseClient";
import { useEffect, useRef, useState } from "react";
import { Home, HelpCircle, UserRound, Settings, X, Upload, Trash2 } from "lucide-react";

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

/* ------------------------------------------------------------
   Minimal CSV parser (supports quotes + commas inside quotes)
------------------------------------------------------------ */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      // escaped quote
      if (inQuotes && next === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && (ch === "," || ch === "\t")) {
      row.push(field.trim());
      field = "";
      continue;
    }

    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      // handle CRLF
      if (ch === "\r" && next === "\n") i++;
      row.push(field.trim());
      field = "";
      // ignore totally blank rows
      if (row.some((c) => String(c || "").trim().length > 0)) rows.push(row);
      row = [];
      continue;
    }

    field += ch;
  }

  // flush last field/row
  row.push(field.trim());
  if (row.some((c) => String(c || "").trim().length > 0)) rows.push(row);

  return rows;
}

function toBoolLoose(v: any, fallback = true) {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return fallback;
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return fallback;
}

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
     HANDHELD DETECTION (phone / small tablet)
     - Used to disable Launch on mobile / iPad
  ------------------------------------------------------------ */
  const [isHandheld, setIsHandheld] = useState(false);

  useEffect(() => {
    const checkHandheld = () => {
      if (typeof window === "undefined") return;

      const ua = window.navigator?.userAgent || "";
      const looksMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
      const smallViewport = window.innerWidth < 1024; // treat sub-laptop as handheld

      setIsHandheld(looksMobile || smallViewport);
    };

    checkHandheld();
    window.addEventListener("resize", checkHandheld);

    return () => {
      window.removeEventListener("resize", checkHandheld);
    };
  }, []);

  const canLaunchFromThisDevice = !isHandheld;

  /* ------------------------------------------------------------
     TOAST (local, dependency-free)
  ------------------------------------------------------------ */
  const [toastOpen, setToastOpen] = useState(false);
  const [toastTone, setToastTone] = useState<"warn" | "success" | "error">("success");
  const [toastMsg, setToastMsg] = useState<string>("");
  const toastTimerRef = useRef<number | null>(null);

  const showToast = (message: string, tone: "warn" | "success" | "error" = "success", ms = 3500) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToastMsg(message);
    setToastTone(tone);
    setToastOpen(true);

    toastTimerRef.current = window.setTimeout(() => {
      setToastOpen(false);
      toastTimerRef.current = null;
    }, ms);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, []);

  /* ------------------------------------------------------------
     QUESTIONS STATE
  ------------------------------------------------------------ */
  const [questions, setQuestions] = useState<any[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  const PAGE_SIZE = 5;
  const [currentPage, setCurrentPage] = useState(0);

  // NEW: Clear-all confirmation arm + busy
  const [clearAllArmed, setClearAllArmed] = useState(false);
  const [clearAllBusy, setClearAllBusy] = useState(false);
  const clearAllDisarmRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (clearAllDisarmRef.current) {
        window.clearTimeout(clearAllDisarmRef.current);
        clearAllDisarmRef.current = null;
      }
    };
  }, []);

  /* ------------------------------------------------------------
     MANUAL ADD / CSV IMPORT
  ------------------------------------------------------------ */
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addMode, setAddMode] = useState<"single" | "csv">("single");

  const defaultDifficulty = (String(trivia?.difficulty || "").trim() || "medium") as string;
  const defaultCategory =
    (String(trivia?.topic_prompt || "").trim() ||
      String(trivia?.public_name || "").trim() ||
      "General") as string;

  // NEW helper for Option B: default-fill difficulty/category
  const normalizeDifficulty = (raw: any) => {
    const s = String(raw ?? "").trim();
    return s || defaultDifficulty;
  };
  const normalizeCategory = (raw: any) => {
    const s = String(raw ?? "").trim();
    return s || defaultCategory;
  };

  const [newRound, setNewRound] = useState<number>(1);
  const [newQuestionText, setNewQuestionText] = useState<string>("");
  const [newOptA, setNewOptA] = useState<string>("");
  const [newOptB, setNewOptB] = useState<string>("");
  const [newOptC, setNewOptC] = useState<string>("");
  const [newOptD, setNewOptD] = useState<string>("");
  const [newCorrectIndex, setNewCorrectIndex] = useState<number>(0);
  const [newDifficulty, setNewDifficulty] = useState<string>(defaultDifficulty);
  const [newCategory, setNewCategory] = useState<string>(defaultCategory);
  const [newIsActive, setNewIsActive] = useState<boolean>(true);

  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addOkMsg, setAddOkMsg] = useState<string | null>(null);

  const [csvBusy, setCsvBusy] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [csvOkMsg, setCsvOkMsg] = useState<string | null>(null);

  const resetSingleForm = () => {
    setNewRound(1);
    setNewQuestionText("");
    setNewOptA("");
    setNewOptB("");
    setNewOptC("");
    setNewOptD("");
    setNewCorrectIndex(0);
    setNewDifficulty(defaultDifficulty);
    setNewCategory(defaultCategory);
    setNewIsActive(true);
    setAddError(null);
    setAddOkMsg(null);
  };

  const openAddModal = () => {
    setAddModalOpen(true);
    setAddMode("single");
    resetSingleForm();
    setCsvError(null);
    setCsvOkMsg(null);
  };

  async function insertSingleQuestion() {
    if (!trivia?.id) return;

    const qText = String(newQuestionText || "").trim();
    const a = String(newOptA || "").trim();
    const b = String(newOptB || "").trim();
    const c = String(newOptC || "").trim();
    const d = String(newOptD || "").trim();

    // Option B: default-fill if blank
    const difficulty = normalizeDifficulty(newDifficulty);
    const category = normalizeCategory(newCategory);

    const round = Number(newRound);

    setAddError(null);
    setAddOkMsg(null);

    if (!qText) return setAddError("Question text is required.");
    if (!a || !b || !c || !d) return setAddError("All 4 answer options are required.");
    if (!Number.isFinite(round) || round < 1) return setAddError("Round number must be 1 or higher.");
    if (!Number.isFinite(newCorrectIndex) || newCorrectIndex < 0 || newCorrectIndex > 3) {
      return setAddError("Correct answer must be A, B, C, or D.");
    }

    // No longer error on blank difficulty/category: they are default-filled above
    setAddBusy(true);
    try {
      const payload = {
        trivia_card_id: trivia.id,
        round_number: Math.floor(round),
        question_text: qText,
        options: [a, b, c, d],
        correct_index: Math.floor(newCorrectIndex),
        difficulty,
        category,
        is_active: !!newIsActive,
      };

      const { error } = await supabase.from("trivia_questions").insert(payload);
      if (error) {
        console.error("❌ insert trivia_question error:", error);
        setAddError(error.message || "Insert failed.");
        return;
      }

      setAddOkMsg("Saved!");
      await loadQuestions();

      // reset for quick entry
      setNewQuestionText("");
      setNewOptA("");
      setNewOptB("");
      setNewOptC("");
      setNewOptD("");
      setNewCorrectIndex(0);

      // keep defaults populated (Option B)
      setNewDifficulty(difficulty);
      setNewCategory(category);
    } finally {
      setAddBusy(false);
    }
  }

  async function insertCsvQuestionsFromText(csvText: string) {
    if (!trivia?.id) return;

    setCsvError(null);
    setCsvOkMsg(null);

    const rows = parseCsv(csvText);

    if (!rows.length) {
      setCsvError("No rows found in the CSV.");
      return;
    }

    // Allow optional header row if it contains "question" or "question_text"
    let startIndex = 0;
    const header = rows[0].map((c) => String(c || "").toLowerCase());
    const looksLikeHeader =
      header.some((h) => h.includes("question")) || header.some((h) => h.includes("option"));
    if (looksLikeHeader) startIndex = 1;

    // Expected columns:
    // round_number, question_text, optionA, optionB, optionC, optionD, correct_index, difficulty, category, is_active(optional)
    const toInsert: any[] = [];
    const errors: string[] = [];

    for (let i = startIndex; i < rows.length; i++) {
      const r = rows[i] || [];
      const roundRaw = r[0];
      const qText = String(r[1] || "").trim();
      const a = String(r[2] || "").trim();
      const b = String(r[3] || "").trim();
      const c = String(r[4] || "").trim();
      const d = String(r[5] || "").trim();
      const correctRaw = r[6];

      // Option B: default-fill if missing OR blank
      const difficulty = normalizeDifficulty(r[7]);
      const category = normalizeCategory(r[8]);

      const isActive = r.length >= 10 ? toBoolLoose(r[9], true) : true;

      const round = Number(roundRaw);
      const correctIndex = Number(correctRaw);

      const rowNum = i + 1; // 1-based for humans

      if (!Number.isFinite(round) || round < 1) {
        errors.push(`Row ${rowNum}: round_number must be >= 1`);
        continue;
      }
      if (!qText) {
        errors.push(`Row ${rowNum}: question_text is required`);
        continue;
      }
      if (!a || !b || !c || !d) {
        errors.push(`Row ${rowNum}: options A–D are required`);
        continue;
      }
      if (!Number.isFinite(correctIndex) || correctIndex < 0 || correctIndex > 3) {
        errors.push(`Row ${rowNum}: correct_index must be 0–3`);
        continue;
      }

      // No longer error on missing/blank difficulty/category; they are default-filled above

      toInsert.push({
        trivia_card_id: trivia.id,
        round_number: Math.floor(round),
        question_text: qText,
        options: [a, b, c, d],
        correct_index: Math.floor(correctIndex),
        difficulty,
        category,
        is_active: !!isActive,
      });
    }

    if (errors.length) {
      setCsvError(
        errors.slice(0, 8).join("\n") + (errors.length > 8 ? `\n…and ${errors.length - 8} more` : "")
      );
      // still allow import if there are valid rows
    }

    if (toInsert.length === 0) {
      if (!errors.length) setCsvError("No valid rows to import.");
      return;
    }

    setCsvBusy(true);
    try {
      // Chunk inserts to avoid payload limits
      const CHUNK = 100;
      let inserted = 0;

      for (let i = 0; i < toInsert.length; i += CHUNK) {
        const chunk = toInsert.slice(i, i + CHUNK);
        const { error } = await supabase.from("trivia_questions").insert(chunk);
        if (error) {
          console.error("❌ CSV import insert error:", error);
          setCsvError(error.message || "CSV import failed.");
          return;
        }
        inserted += chunk.length;
      }

      setCsvOkMsg(`Imported ${inserted} question(s).`);
      await loadQuestions();
    } finally {
      setCsvBusy(false);
    }
  }

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

  const [requireSelfie, setRequireSelfie] = useState<boolean>(trivia?.require_selfie ?? true);

  const [adsEnabled, setAdsEnabled] = useState<boolean>(!!trivia?.ads_enabled);

  const [progressiveWrongRemovalEnabled, setProgressiveWrongRemovalEnabled] =
    useState<boolean>(!!trivia?.progressive_wrong_removal_enabled);

  const [highlightTheHerdEnabled, setHighlightTheHerdEnabled] =
    useState<boolean>(!!trivia?.highlight_the_herd_enabled);

  const [streakMultiplierEnabled, setStreakMultiplierEnabled] =
    useState<boolean>(!!trivia?.streak_multiplier_enabled);

  // ✅ points_type in DB is "100s" | "1000s" | "10000s"
  const [pointsType, setPointsType] = useState<string>(trivia?.points_type || "100s");

  const [savingSettings, setSavingSettings] = useState(false);

  /* ------------------------------------------------------------
     CARD STATUS
  ------------------------------------------------------------ */
  const [cardStatus, setCardStatus] = useState<string>(trivia.status);
  const [cardCountdownActive, setCardCountdownActive] = useState<boolean>(!!trivia.countdown_active);

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
  const [activeTab, setActiveTab] = useState<"menu" | "questions" | "leaderboard" | "settings1" | "settings2">(
    "menu"
  );

  /* ------------------------------------------------------------
     Sync with trivia props
  ------------------------------------------------------------ */
  useEffect(() => {
    setTimerSeconds(normalizeTimerSeconds(trivia?.timer_seconds ?? 30));
    setCountdownSeconds(normalizeCountdownSeconds(trivia?.countdown_seconds ?? 10));
    setPlayMode(trivia?.play_mode || "auto");

    // ✅ FIX: normalize scoring_mode from DB
    setScoringMode(normalizeScoringMode(trivia?.scoring_mode));

    setRequireSelfie(trivia?.require_selfie ?? true);
    setAdsEnabled(!!trivia?.ads_enabled);

    setProgressiveWrongRemovalEnabled(!!trivia?.progressive_wrong_removal_enabled);
    setHighlightTheHerdEnabled(!!trivia?.highlight_the_herd_enabled);
    setStreakMultiplierEnabled(!!trivia?.streak_multiplier_enabled);
    setPointsType(trivia?.points_type || "100s");

    setCardStatus(trivia?.status);
    setCardCountdownActive(!!trivia?.countdown_active);

    // keep add defaults synced too
    setNewDifficulty(defaultDifficulty);
    setNewCategory(defaultCategory);
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
    trivia?.difficulty,
    trivia?.topic_prompt,
    trivia?.public_name,
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

      // ✅ include scoring_mode + points_type + play_mode
      const { data, error } = await supabase
        .from("trivia_cards")
        .select(
          "status, countdown_active, countdown_seconds, background_type, background_value, ads_enabled, progressive_wrong_removal_enabled, highlight_the_herd_enabled, streak_multiplier_enabled, points_type, scoring_mode, play_mode"
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

      setProgressiveWrongRemovalEnabled(!!(data as any).progressive_wrong_removal_enabled);
      setHighlightTheHerdEnabled(!!(data as any).highlight_the_herd_enabled);
      setStreakMultiplierEnabled(!!(data as any).streak_multiplier_enabled);

      setCountdownSeconds(normalizeCountdownSeconds((data as any).countdown_seconds ?? 10));

      setPointsType((data as any).points_type || "100s");
      setScoringMode(normalizeScoringMode((data as any).scoring_mode));
      setPlayMode((data as any).play_mode || "auto");

      // keep local trivia object in sync (since you mutate it elsewhere)
      trivia.background_type = data.background_type;
      trivia.background_value = data.background_value;
      trivia.ads_enabled = data.ads_enabled;
      trivia.countdown_seconds = (data as any).countdown_seconds;
      trivia.progressive_wrong_removal_enabled = (data as any).progressive_wrong_removal_enabled;
      trivia.highlight_the_herd_enabled = (data as any).highlight_the_herd_enabled;
      trivia.streak_multiplier_enabled = (data as any).streak_multiplier_enabled;
      trivia.points_type = (data as any).points_type;
      trivia.scoring_mode = (data as any).scoring_mode;
      trivia.play_mode = (data as any).play_mode;
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
      const { error } = await supabase.from("trivia_cards").update(patch).eq("id", trivia.id);

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
     CLEAR ALL QUESTIONS
  ------------------------------------------------------------ */
  async function handleClearAllQuestions() {
    if (!trivia?.id) return;
    if (loadingQuestions) return;
    if (clearAllBusy) return;

    // First click: arm + warn
    if (!clearAllArmed) {
      setClearAllArmed(true);

      showToast(
        `⚠️ Clear ALL questions? This deletes them permanently. Click "Clear All" again to confirm.`,
        "warn",
        6000
      );

      if (clearAllDisarmRef.current) {
        window.clearTimeout(clearAllDisarmRef.current);
        clearAllDisarmRef.current = null;
      }

      clearAllDisarmRef.current = window.setTimeout(() => {
        setClearAllArmed(false);
        clearAllDisarmRef.current = null;
      }, 6500);

      return;
    }

    // Second click: do the delete
    setClearAllBusy(true);
    setClearAllArmed(false);

    if (clearAllDisarmRef.current) {
      window.clearTimeout(clearAllDisarmRef.current);
      clearAllDisarmRef.current = null;
    }

    try {
      // 1) pull question ids for this trivia (for deleting answers that may FK to question_id)
      const { data: qrows, error: qidsErr } = await supabase
        .from("trivia_questions")
        .select("id")
        .eq("trivia_card_id", trivia.id);

      if (qidsErr) {
        console.error("❌ clear all: fetch question ids error:", qidsErr);
        showToast(qidsErr.message || "Failed to fetch questions.", "error", 5000);
        return;
      }

      const qids = (qrows || []).map((r: any) => r?.id).filter(Boolean) as string[];
      const totalToDelete = qids.length;

      if (totalToDelete === 0) {
        showToast("No questions to clear.", "warn", 3000);
        setQuestions([]);
        setCurrentPage(0);
        return;
      }

      // 2) delete answers for those questions (if your DB doesn't cascade)
      const ANSWER_CHUNK = 1000;
      for (let i = 0; i < qids.length; i += ANSWER_CHUNK) {
        const chunk = qids.slice(i, i + ANSWER_CHUNK);
        const { error: ansErr } = await supabase.from("trivia_answers").delete().in("question_id", chunk);

        // If this fails due to schema differences, we log + keep going to still clear questions
        if (ansErr) {
          console.warn("⚠️ clear all: delete trivia_answers warning:", ansErr);
        }
      }

      // 3) delete all questions
      const { error: delQErr } = await supabase.from("trivia_questions").delete().eq("trivia_card_id", trivia.id);

      if (delQErr) {
        console.error("❌ clear all: delete trivia_questions error:", delQErr);
        showToast(delQErr.message || "Failed to delete questions.", "error", 6000);
        return;
      }

      setQuestions([]);
      setCurrentPage(0);

      showToast(`✅ Deleted ${totalToDelete} question(s).`, "success", 4000);
    } finally {
      setClearAllBusy(false);
    }
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

    const { data: answers, error: answersErr } = await supabase.from("trivia_answers").select("player_id").in(
      "player_id",
      playerIds
    );

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
        if (!cancelledRef?.current && !sameLeaderboard([], lastLeaderboardRef.current)) {
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
        if (!cancelledRef?.current && !sameLeaderboard([], lastLeaderboardRef.current)) {
          lastLeaderboardRef.current = [];
          setLeaderboard([]);
        }
        return;
      }

      const approved = players.filter((p) => p.status === "approved");
      if (approved.length === 0) {
        if (!cancelledRef?.current && !sameLeaderboard([], lastLeaderboardRef.current)) {
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

      if (!cancelledRef?.current && !sameLeaderboard(rows, lastLeaderboardRef.current)) {
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
      const { data, error } = await supabase.from("trivia_questions").select("id").eq("trivia_card_id", trivia.id);

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
            startedAt !== lastQuestionStartedAtRef.current || currentQ !== lastCurrentQuestionRef.current;

          if (!changed) return;

          lastQuestionStartedAtRef.current = startedAt;
          lastCurrentQuestionRef.current = currentQ;

          debounceLoad();
        }
      )
      .subscribe();

    const answersChannel = supabase
      .channel(`dashboard-trivia-answers-${trivia.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "trivia_answers" }, (payload: any) => {
        const qid = payload?.new?.question_id ?? payload?.old?.question_id ?? null;

        if (!qid) return;
        if (!questionIdsRef.current.has(qid)) return;

        debounceLoad();
      })
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
      setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, is_active: data.is_active } : q)));
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
    !cardCountdownActive && (cardStatus === "running" || cardStatus === "paused") && !!trivia?.id;

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
        await supabase.from("trivia_cards").update({ status: "paused" }).eq("id", trivia.id);

        await supabase.from("trivia_sessions").update({ status: "paused", paused_at: nowIso }).eq("id", session.id);

        setCardStatus("paused");
        return;
      }

      if (cardStatus === "paused") {
        const pausedAtIso = (session.paused_at ?? null) as string | null;

        let nextQuestionStartedAt: string | null = session.question_started_at ?? null;
        let nextWallPhaseStartedAt: string | null = session.wall_phase_started_at ?? null;

        if (pausedAtIso) {
          const pausedAtMs = new Date(pausedAtIso).getTime();
          const deltaMs = Math.max(0, nowMs - pausedAtMs);

          const shiftIso = (iso: string | null) =>
            iso ? new Date(new Date(iso).getTime() + deltaMs).toISOString() : null;

          nextQuestionStartedAt = shiftIso(nextQuestionStartedAt);
          nextWallPhaseStartedAt = shiftIso(nextWallPhaseStartedAt);
        }

        await supabase.from("trivia_cards").update({ status: "running" }).eq("id", trivia.id);

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
    if (cardCountdownActive || cardStatus === "running" || cardStatus === "paused") return;

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

      const { data: players, error: playersErr } = await supabase.from("trivia_players").select("id,status").eq(
        "session_id",
        session.id
      );

      if (playersErr) console.error("❌ trivia_players check error:", playersErr);

      const hasApproved = (players || []).some((p) => p.status === "approved") || false;

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
          await supabase.from("trivia_cards").update({ status: "running", countdown_active: false }).eq("id", trivia.id);

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
      const { data: players, error: playersErr } = await supabase.from("trivia_players").select("id").eq(
        "session_id",
        session.id
      );

      if (playersErr) console.error("❌ stop: load trivia_players error:", playersErr);

      if (!playersErr && players && players.length) {
        const playerIds = players.map((p: any) => p.id).filter(Boolean);

        if (playerIds.length > 0) {
          const { error: delErr } = await supabase.from("trivia_answers").delete().in("player_id", playerIds);

          if (delErr) console.error("❌ stop: delete trivia_answers error:", delErr);
        }

        const { error: resetPlayersErr } = await supabase
          .from("trivia_players")
          .update({ score: 0, current_streak: 0, best_streak: 0 })
          .eq("session_id", session.id);

        if (resetPlayersErr) {
          console.error("❌ stop: reset trivia_players score/streak error:", resetPlayersErr);
        }
      }

      const { error: sessUpErr } = await supabase
        .from("trivia_sessions")
        .update({ status: "stopped", paused_at: null })
        .eq("id", session.id);

      if (sessUpErr) console.error("❌ stop: update trivia_sessions error:", sessUpErr);
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
     MANUAL ADVANCE (button only, no space bar)
  ------------------------------------------------------------ */
  const isManualMode = playMode === "manual";

  async function handleManualAdvance() {
    if (!isManualMode) return;
    if (cardStatus !== "running") return;
    if (!trivia?.id) return;

    const { data: session, error: sessionErr } = await supabase
      .from("trivia_sessions")
      .select("id,status,wall_phase,current_question")
      .eq("trivia_card_id", trivia.id)
      .neq("status", "finished")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sessionErr || !session?.id) {
      console.warn("⚠️ manual advance: no active session:", sessionErr);
      return;
    }

    const currentPhase = (session.wall_phase as string) || "question";
    const currentQuestion = (session.current_question as number) || 1;

    let nextPhase: "question" | "overlay" | "reveal" | "leaderboard" | "podium" = currentPhase as any;
    let nextQuestion = currentQuestion;

    if (!currentPhase || currentPhase === "question") {
      nextPhase = "overlay";
    } else if (currentPhase === "overlay") {
      nextPhase = "reveal";
    } else if (currentPhase === "reveal") {
      nextPhase = "leaderboard";
    } else if (currentPhase === "leaderboard") {
      nextPhase = "question";
      nextQuestion = currentQuestion + 1;
    } else if (currentPhase === "podium") {
      return;
    } else {
      nextPhase = "question";
    }

    const nowIso = await getServerIsoNow();

    const updatePayload: any = {
      wall_phase: nextPhase,
      wall_phase_started_at: nowIso,
      current_question: nextQuestion,
    };

    if (nextPhase === "question" && nextQuestion !== currentQuestion) {
      updatePayload.question_started_at = nowIso;
      updatePayload.status = "running";
    }

    const { error: updateErr } = await supabase.from("trivia_sessions").update(updatePayload).eq("id", session.id);

    if (updateErr) {
      console.error("❌ manual advance: update trivia_sessions error:", updateErr);
    }
  }

  /* ------------------------------------------------------------
     PAGINATION DERIVED VALUES
  ------------------------------------------------------------ */
  const totalPages = questions.length > 0 ? Math.ceil(questions.length / PAGE_SIZE) : 1;

  const safePage = Math.min(currentPage, totalPages - 1);
  const startIndex = safePage * PAGE_SIZE;
  const visibleQuestions = questions.slice(startIndex, startIndex + PAGE_SIZE);

  const isActiveBorder = cardStatus === "running" || cardStatus === "paused" || cardCountdownActive;

  const cardBgStyle = getTriviaCardBackground(trivia);

  return (
    <div
      className={cn(
        "rounded-xl p-5 shadow-lg",
        "col-span-2 row-span-2 min-h-[420px] w-full",
        isActiveBorder ? "border-4 border-lime-400 shadow-[0_0_28px_rgba(190,242,100,0.7)]" : "border border-white/10"
      )}
      style={cardBgStyle}
    >
      {/* ---------------- TOAST ---------------- */}
      {toastOpen && (
        <div
          className={cn(
            "fixed z-[10000] top-4 right-4",
            "max-w-[92vw] sm:max-w-sm",
            "rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-sm",
            toastTone === "success" && "border-green-500/40 bg-green-500/10 text-green-100",
            toastTone === "warn" && "border-yellow-500/40 bg-yellow-500/10 text-yellow-100",
            toastTone === "error" && "border-red-500/40 bg-red-500/10 text-red-100"
          )}
          role="status"
          aria-live="polite"
        >
          <div className={cn("flex items-start justify-between gap-3")}>
            <p className={cn("text-sm whitespace-pre-line")}>{toastMsg}</p>
            <button
              type="button"
              onClick={() => setToastOpen(false)}
              className={cn(
                "h-8 w-8 rounded-lg",
                "inline-flex items-center justify-center",
                "bg-white/5 hover:bg-white/10"
              )}
              aria-label="Close toast"
              title="Close"
            >
              <X className={cn("h-4 w-4")} />
            </button>
          </div>
        </div>
      )}

      {/* ---------------- ADD / IMPORT MODAL ---------------- */}
      {addModalOpen && (
        <div
          className={cn(
            "fixed inset-0 z-[9999]",
            "bg-black/70 backdrop-blur-sm",
            "flex items-center justify-center p-4"
          )}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setAddModalOpen(false);
              setAddError(null);
              setAddOkMsg(null);
              setCsvError(null);
              setCsvOkMsg(null);
            }
          }}
        >
          <div
            className={cn(
              "w-full max-w-3xl",
              "rounded-xl border border-white/10",
              "bg-gray-950/95 shadow-2xl"
            )}
          >
            <div className={cn("flex items-center justify-between px-4 py-3 border-b border-white/10")}>
              <div>
                <p className={cn("text-sm font-semibold")}>Add Trivia Questions</p>
                <p className={cn("text-xs opacity-70")}>Add one at a time, or import a CSV.</p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setAddModalOpen(false);
                  setAddError(null);
                  setAddOkMsg(null);
                  setCsvError(null);
                  setCsvOkMsg(null);
                }}
                className={cn(
                  "h-9 w-9 rounded-lg",
                  "inline-flex items-center justify-center",
                  "bg-white/5 hover:bg-white/10"
                )}
                aria-label="Close"
                title="Close"
              >
                <X className={cn("h-4", "w-4")} />
              </button>
            </div>

            <div className={cn("px-4 pt-3")}>
              <div className={cn("flex items-center gap-2")}>
                <button
                  type="button"
                  onClick={() => {
                    setAddMode("single");
                    setAddError(null);
                    setAddOkMsg(null);
                    setCsvError(null);
                    setCsvOkMsg(null);
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-xs font-semibold",
                    addMode === "single" ? "bg-blue-600" : "bg-white/5 hover:bg-white/10"
                  )}
                >
                  Single Question
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddMode("csv");
                    setAddError(null);
                    setAddOkMsg(null);
                    setCsvError(null);
                    setCsvOkMsg(null);
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-xs font-semibold",
                    addMode === "csv" ? "bg-blue-600" : "bg-white/5 hover:bg-white/10"
                  )}
                >
                  CSV Import
                </button>
              </div>
            </div>

            {addMode === "single" ? (
              <div className={cn("p-4 space-y-3")}>
                <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-3")}>
                  <div>
                    <label className={cn("text-xs opacity-70")}>Round Number</label>
                    <input
                      type="number"
                      min={1}
                      value={newRound}
                      onChange={(e) => setNewRound(Number(e.target.value))}
                      className={cn(
                        "mt-1 w-full rounded-md bg-gray-900 border border-white/10",
                        "px-3 py-2 text-sm outline-none focus:border-blue-400"
                      )}
                    />
                  </div>

                  <div className={cn("flex items-end gap-3")}>
                    <div className={cn("flex-1")}>
                      <label className={cn("text-xs opacity-70")}>Correct Answer</label>
                      <select
                        value={newCorrectIndex}
                        onChange={(e) => setNewCorrectIndex(Number(e.target.value))}
                        className={cn(
                          "mt-1 w-full rounded-md bg-gray-900 border border-white/10",
                          "px-3 py-2 text-sm outline-none focus:border-blue-400"
                        )}
                      >
                        <option value={0}>A</option>
                        <option value={1}>B</option>
                        <option value={2}>C</option>
                        <option value={3}>D</option>
                      </select>
                    </div>

                    <div className={cn("pb-1")}>
                      <label className={cn("text-xs opacity-70")}>Included</label>
                      <div className={cn("mt-2")}>
                        <button
                          type="button"
                          onClick={() => setNewIsActive((v) => !v)}
                          className={cn(
                            "px-3 py-2 rounded-md text-xs font-semibold",
                            newIsActive
                              ? "bg-green-600 hover:bg-green-700"
                              : "bg-gray-700 hover:bg-gray-600"
                          )}
                        >
                          {newIsActive ? "ON" : "OFF"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <label className={cn("text-xs opacity-70")}>Question Text</label>
                  <textarea
                    value={newQuestionText}
                    onChange={(e) => setNewQuestionText(e.target.value)}
                    rows={3}
                    className={cn(
                      "mt-1 w-full rounded-md bg-gray-900 border border-white/10",
                      "px-3 py-2 text-sm outline-none focus:border-blue-400"
                    )}
                    placeholder="Type the question..."
                  />
                </div>

                <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-3")}>
                  <div>
                    <label className={cn("text-xs opacity-70")}>Option A</label>
                    <input
                      value={newOptA}
                      onChange={(e) => setNewOptA(e.target.value)}
                      className={cn(
                        "mt-1 w-full rounded-md bg-gray-900 border border-white/10",
                        "px-3 py-2 text-sm outline-none focus:border-blue-400"
                      )}
                      placeholder="Answer A"
                    />
                  </div>
                  <div>
                    <label className={cn("text-xs opacity-70")}>Option B</label>
                    <input
                      value={newOptB}
                      onChange={(e) => setNewOptB(e.target.value)}
                      className={cn(
                        "mt-1 w-full rounded-md bg-gray-900 border border-white/10",
                        "px-3 py-2 text-sm outline-none focus:border-blue-400"
                      )}
                      placeholder="Answer B"
                    />
                  </div>
                  <div>
                    <label className={cn("text-xs opacity-70")}>Option C</label>
                    <input
                      value={newOptC}
                      onChange={(e) => setNewOptC(e.target.value)}
                      className={cn(
                        "mt-1 w-full rounded-md bg-gray-900 border border-white/10",
                        "px-3 py-2 text-sm outline-none focus:border-blue-400"
                      )}
                      placeholder="Answer C"
                    />
                  </div>
                  <div>
                    <label className={cn("text-xs opacity-70")}>Option D</label>
                    <input
                      value={newOptD}
                      onChange={(e) => setNewOptD(e.target.value)}
                      className={cn(
                        "mt-1 w-full rounded-md bg-gray-900 border border-white/10",
                        "px-3 py-2 text-sm outline-none focus:border-blue-400"
                      )}
                      placeholder="Answer D"
                    />
                  </div>
                </div>

                <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-3")}>
                  <div>
                    <label className={cn("text-xs opacity-70")}>Difficulty (default-fills)</label>
                    <input
                      value={newDifficulty}
                      onChange={(e) => setNewDifficulty(e.target.value)}
                      className={cn(
                        "mt-1 w-full rounded-md bg-gray-900 border border-white/10",
                        "px-3 py-2 text-sm outline-none focus:border-blue-400"
                      )}
                      placeholder={defaultDifficulty}
                    />
                    <p className={cn("text-[0.7rem] opacity-60 mt-1")}>
                      If left blank, it will save as: <span className="font-mono">{defaultDifficulty}</span>
                    </p>
                  </div>
                  <div>
                    <label className={cn("text-xs opacity-70")}>Category (default-fills)</label>
                    <input
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      className={cn(
                        "mt-1 w-full rounded-md bg-gray-900 border border-white/10",
                        "px-3 py-2 text-sm outline-none focus:border-blue-400"
                      )}
                      placeholder={defaultCategory}
                    />
                    <p className={cn("text-[0.7rem] opacity-60 mt-1")}>
                      If left blank, it will save as: <span className="font-mono">{defaultCategory}</span>
                    </p>
                  </div>
                </div>

                {(addError || addOkMsg) && (
                  <div
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm whitespace-pre-line",
                      addError
                        ? "border-red-500/40 bg-red-500/10 text-red-200"
                        : "border-green-500/40 bg-green-500/10 text-green-200"
                    )}
                  >
                    {addError || addOkMsg}
                  </div>
                )}

                <div className={cn("flex items-center justify-between pt-2 border-t border-white/10")}>
                  <button
                    type="button"
                    onClick={() => {
                      resetSingleForm();
                      setAddMode("single");
                    }}
                    className={cn("px-3 py-2 rounded-md text-xs font-semibold", "bg-white/5 hover:bg-white/10")}
                  >
                    Reset
                  </button>

                  <div className={cn("flex items-center gap-2")}>
                    <button
                      type="button"
                      onClick={() => setAddModalOpen(false)}
                      className={cn("px-3 py-2 rounded-md text-xs font-semibold", "bg-gray-700 hover:bg-gray-600")}
                    >
                      Close
                    </button>

                    <button
                      type="button"
                      onClick={insertSingleQuestion}
                      disabled={addBusy}
                      className={cn(
                        "px-4 py-2 rounded-md text-xs font-semibold",
                        addBusy ? "bg-blue-600/60 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
                      )}
                    >
                      {addBusy ? "Saving..." : "Save Question"}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className={cn("p-4 space-y-3")}>
                <div className={cn("rounded-lg border border-white/10 bg-white/5 p-3 text-xs leading-relaxed")}>
                  <p className={cn("font-semibold mb-1")}>CSV format</p>
                  <p className={cn("opacity-80")}>
                    Columns (comma-separated):<br />
                    <span className={cn("font-mono opacity-90")}>
                      round_number, question_text, optionA, optionB, optionC, optionD, correct_index, difficulty,
                      category, is_active(optional)
                    </span>
                    <br />
                    <span className={cn("opacity-70")}>
                      • correct_index is 0–3 (A=0, B=1, C=2, D=3)
                      <br />• is_active can be true/false/1/0 (optional; defaults true)
                      <br />• difficulty/category: if missing or blank, they auto-fill from this trivia card defaults
                    </span>
                  </p>
                </div>

                <div className={cn("flex items-center gap-3 flex-wrap")}>
                  <label
                    className={cn(
                      "inline-flex items-center gap-2",
                      "px-3 py-2 rounded-md text-xs font-semibold",
                      "bg-blue-600 hover:bg-blue-700 cursor-pointer"
                    )}
                  >
                    <Upload className={cn("h-4", "w-4")} />
                    Choose CSV File
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setCsvError(null);
                        setCsvOkMsg(null);

                        const text = await file.text();
                        await insertCsvQuestionsFromText(text);

                        e.currentTarget.value = "";
                      }}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={async () => {
                      const raw = window.prompt(
                        "Paste CSV rows here.\n\nFormat:\nround_number,question_text,optionA,optionB,optionC,optionD,correct_index,difficulty,category,is_active(optional)"
                      );
                      if (!raw) return;
                      await insertCsvQuestionsFromText(raw);
                    }}
                    className={cn("px-3 py-2 rounded-md text-xs font-semibold", "bg-white/5 hover:bg-white/10")}
                  >
                    Paste CSV
                  </button>
                </div>

                {(csvError || csvOkMsg) && (
                  <div
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm whitespace-pre-line",
                      csvError
                        ? "border-red-500/40 bg-red-500/10 text-red-200"
                        : "border-green-500/40 bg-green-500/10 text-green-200"
                    )}
                  >
                    {csvError || csvOkMsg}
                  </div>
                )}

                <div className={cn("flex items-center justify-end pt-2 border-t border-white/10")}>
                  <button
                    type="button"
                    onClick={() => setAddModalOpen(false)}
                    className={cn("px-3 py-2 rounded-md text-xs font-semibold", "bg-gray-700 hover:bg-gray-600")}
                  >
                    Close
                  </button>
                </div>

                {csvBusy && <p className={cn("text-xs opacity-70")}>Importing…</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------------- TABS ---------------- */}
      <Tabs.Root
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as "menu" | "questions" | "leaderboard" | "settings1" | "settings2")}
      >
        {/* ✅ icon-only on phones, full text on desktop (wraps, no horizontal scroll) */}
        <Tabs.List
          className={cn(
            "flex flex-wrap sm:flex-nowrap",
            "items-center",
            "gap-1 sm:gap-6",
            "mb-4",
            "border-b",
            "border-white/10",
            "pb-2"
          )}
        >
          {[
            { value: "menu", label: "Home", Icon: Home },
            { value: "questions", label: "Questions", Icon: HelpCircle },
            { value: "leaderboard", label: "Leaderboard", Icon: UserRound },
            { value: "settings1", label: "Settings One", Icon: Settings, desktopBadge: "1", mobileSuffix: "1" },
            { value: "settings2", label: "Settings Two", Icon: Settings, desktopBadge: "2", mobileSuffix: "2" },
          ].map((tab) => (
            <Tabs.Trigger
              key={tab.value}
              value={tab.value}
              aria-label={tab.label}
              onClick={tab.value === "questions" ? loadQuestions : undefined}
              className={cn(
                "inline-flex items-center justify-center",
                "rounded-md",
                "min-h-[36px]",
                "px-2",
                "text-xs sm:text-sm",
                "font-medium",
                "whitespace-nowrap",
                "data-[state=active]:text-blue-400",
                "data-[state=active]:bg-white/5"
              )}
            >
              <span className={cn("sm:hidden", "inline-flex", "items-center", "gap-1")}>
                <tab.Icon className={cn("h-4", "w-4")} />
                {"mobileSuffix" in tab && (tab as any).mobileSuffix ? (
                  <span className={cn("text-[0.7rem]", "font-bold", "leading-none")}>{(tab as any).mobileSuffix}</span>
                ) : null}
              </span>

              <span className={cn("hidden", "sm:inline")}>
                {"desktopBadge" in tab && (tab as any).desktopBadge ? (
                  <span className={cn("inline-flex", "items-center", "gap-1.5")}>
                    <tab.Icon className={cn("h-4", "w-4")} />
                    <span
                      className={cn(
                        "inline-flex",
                        "items-center",
                        "justify-center",
                        "h-4",
                        "min-w-[16px]",
                        "px-1",
                        "rounded",
                        "text-[0.7rem]",
                        "font-bold",
                        "leading-none",
                        "bg-white/10",
                        "border",
                        "border-white/20"
                      )}
                    >
                      {(tab as any).desktopBadge}
                    </span>
                  </span>
                ) : (
                  tab.label
                )}
              </span>
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        {/* ---------------- HOME ---------------- */}
        <Tabs.Content value="menu">
          <div className={cn("grid", "grid-cols-3", "gap-2", "mb-4", "items-center")}>
            <div>
              <p className={cn("text-sm", "opacity-70")}>Difficulty</p>
              <p className="font-semibold">{trivia.difficulty}</p>
            </div>
            <div className="text-center">
              <p className={cn("text-lg", "font-semibold")}>{trivia.public_name}</p>
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
            {/* COL 1 */}
            <div className={cn("flex", "flex-col", "gap-2")}>
              <button
                onClick={() => {
                  if (!canLaunchFromThisDevice) {
                    alert("To launch this wall, please use a laptop or desktop with a second screen connected.");
                    return;
                  }
                  onLaunch(trivia.id);
                }}
                disabled={!canLaunchFromThisDevice}
                className={cn(
                  "py-2 rounded-lg font-semibold h-10 flex items-center justify-center",
                  canLaunchFromThisDevice ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-700/70 cursor-not-allowed opacity-60"
                )}
              >
                Launch
              </button>

              <button
                onClick={handlePlayTrivia}
                disabled={cardStatus === "paused"}
                className={cn(
                  "bg-green-600 hover:bg-green-700 py-2 rounded-lg font-semibold h-10",
                  "flex items-center justify-center",
                  cardStatus === "paused" && "opacity-40 cursor-not-allowed"
                )}
              >
                ▶ Play
              </button>

              <button
                onClick={handleStopTrivia}
                className={cn(
                  "bg-red-600 hover:bg-red-700 py-2 rounded-lg font-semibold h-10",
                  "flex items-center justify-center"
                )}
              >
                ⏹ Stop
              </button>

              <button
                onClick={handleTogglePauseTrivia}
                disabled={!canPause || pauseBusy}
                className={cn(
                  "py-2 rounded-lg font-semibold h-10 flex items-center justify-center",
                  cardStatus === "paused" ? "bg-amber-600 hover:bg-amber-700" : "bg-yellow-600 hover:bg-yellow-700",
                  (!canPause || pauseBusy) && "opacity-40 cursor-not-allowed"
                )}
              >
                {cardStatus === "paused" ? "▶ Resume" : "⏸ Pause"}
              </button>
            </div>

            {/* COL 2 */}
            <div className={cn("flex", "flex-col", "gap-2")}>
              <button
                onClick={() => onOpenOptions(trivia)}
                className={cn(
                  "bg-gray-700 hover:bg-gray-600 py-2 rounded-lg font-semibold h-10",
                  "flex items-center justify-center"
                )}
              >
                Options
              </button>

              <button
                onClick={() => onRegenerateQuestions?.(trivia)}
                disabled={!onRegenerateQuestions}
                className={cn(
                  "py-2 rounded-lg font-semibold h-10",
                  "flex items-center justify-center",
                  "text-xs",
                  "whitespace-nowrap",
                  onRegenerateQuestions ? "bg-orange-500 hover:bg-orange-600 text-black" : "bg-gray-700/60 cursor-not-allowed opacity-60"
                )}
                aria-label="New Questions Or Topic"
                title="New Questions Or Topic"
              >
                <span className={cn("sm:hidden", "inline-flex", "items-center", "justify-center")}>
                  <HelpCircle className={cn("h-5", "w-5")} />
                </span>
                <span className={cn("hidden", "sm:inline")}>New Questions Or Topic</span>
              </button>

              <button
                onClick={handleDeleteTrivia}
                className={cn(
                  "bg-red-700 hover:bg-red-800 py-2 rounded-lg font-semibold h-10",
                  "flex items-center justify-center"
                )}
              >
                ❌ Delete
              </button>
            </div>

            {/* COL 3 */}
            <div className={cn("flex", "flex-col", "gap-2")}>
              <div
                className={cn(
                  "bg-gray-800/80 p-3 rounded-lg",
                  "flex flex-col items-center justify-center",
                  "backdrop-blur-sm min-h-[72px]"
                )}
              >
                <p className={cn("text-xs", "opacity-75")}>Players</p>
                <p className={cn("text-lg", "font-bold")}>{participantsCount}</p>
                <p className={cn("text-[0.7rem]", "opacity-75", "mt-1")}>
                  Active: <span className="font-semibold">{activePlayersCount}</span>
                </p>
              </div>

              <button
                onClick={() => onOpenModeration?.(trivia)}
                className={cn(
                  "py-2 rounded-lg font-semibold w-full h-10",
                  "flex items-center justify-center text-sm",
                  pendingCount > 0 ? "bg-yellow-400 hover:bg-yellow-500 text-black" : "bg-purple-600 hover:bg-purple-700 text-white"
                )}
              >
                {pendingCount > 0 ? `Moderate (${pendingCount} waiting)` : "Moderate Players"}
              </button>

              <button
                type="button"
                onClick={handleManualAdvance}
                disabled={!isManualMode || cardStatus !== "running"}
                className={cn(
                  "mt-2",
                  "w-full",
                  "rounded-lg",
                  "font-semibold",
                  "flex",
                  "flex-col",
                  "items-center",
                  "justify-center",
                  "py-3",
                  "sm:py-4",
                  isManualMode && cardStatus === "running"
                    ? "bg-blue-600 hover:bg-blue-700"
                    : "bg-gray-700/60 cursor-not-allowed opacity-60"
                )}
              >
                <span className={cn("text-xs", "uppercase", "tracking-wide")}>Next</span>
                <span className={cn("leading-none", "text-2xl", "sm:text-3xl", "text-orange-400")}>▶</span>
              </button>
            </div>
          </div>
        </Tabs.Content>

        {/* ---------------- QUESTIONS ---------------- */}
        <Tabs.Content value="questions" className={cn("mt-4", "space-y-3")}>
          <div className={cn("flex", "items-center", "justify-between", "gap-2", "flex-wrap")}>
            <div className={cn("text-xs", "opacity-70")}>Total questions: {questions.length}</div>

            <div className={cn("flex items-center gap-2 flex-wrap")}>
              <button
                type="button"
                onClick={openAddModal}
                className={cn("px-3 py-1 rounded-md text-xs font-semibold", "border border-white/10", "bg-white/5 hover:bg-white/10")}
              >
                ➕ Add / Import
              </button>

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

              <button
                type="button"
                onClick={handleClearAllQuestions}
                disabled={questions.length === 0 || clearAllBusy || loadingQuestions}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-semibold",
                  "border",
                  clearAllArmed ? "border-red-400/80 bg-red-600/40 hover:bg-red-600/50" : "border-red-400/40 bg-red-600/20 hover:bg-red-600/30",
                  (questions.length === 0 || clearAllBusy || loadingQuestions) && "opacity-40 cursor-not-allowed"
                )}
                title="Delete all questions for this trivia"
              >
                <span className={cn("inline-flex items-center gap-2")}>
                  <Trash2 className={cn("h-4 w-4")} />
                  {clearAllBusy ? "Clearing..." : clearAllArmed ? "Confirm Clear All" : "Clear All Questions"}
                </span>
              </button>
            </div>
          </div>

          {loadingQuestions && <p className="opacity-70">Loading questions…</p>}
          {!loadingQuestions && questions.length === 0 && <p className={cn("opacity-70", "italic")}>No questions found.</p>}

          {!loadingQuestions && questions.length > 0 && (
            <>
              <div className={cn("max-h-80", "overflow-y-auto", "space-y-3", "pr-1")}>
                {visibleQuestions.map((q) => {
                  const isActive = !!q.is_active;

                  return (
                    <div
                      key={q.id}
                      className={cn(
                        "border rounded-lg p-4 bg-gray-900/70 backdrop-blur-sm",
                        isActive ? "border-green-500/40" : "border-red-500/40 opacity-80"
                      )}
                    >
                      <div className={cn("flex", "items-start", "justify-between", "gap-2", "mb-2")}>
                        <div>
                          <p className={cn("font-semibold")}>
                            R{q.round_number}. {q.question_text}
                          </p>
                          <p className={cn("text-[0.7rem] mt-1", isActive ? "text-green-300/80" : "text-red-300/80")}>
                            {isActive ? "Included in game" : "Not in game"}
                          </p>
                        </div>

                        <div className={cn("flex", "flex-col", "gap-1")}>
                          <button
                            type="button"
                            onClick={() => handleSetQuestionActive(q.id, true)}
                            disabled={isActive}
                            className={cn(
                              "w-7 h-7 flex items-center justify-center rounded-md text-xs font-bold",
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
                              "w-7 h-7 flex items-center justify-center rounded-md text-xs font-bold",
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
                              i === q.correct_index ? "bg-green-600/30 border border-green-500/40" : "bg-black/30"
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
                <div className={cn("flex", "items-center", "justify-between", "mt-2", "text-xs")}>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                    disabled={safePage === 0}
                    className={cn(
                      "px-2 py-1 rounded-md border border-white/10",
                      safePage === 0 && "opacity-40 cursor-not-allowed",
                      safePage !== 0 && "hover:bg-white/5"
                    )}
                  >
                    ◀ Prev 5
                  </button>

                  <span className="opacity-70">
                    Page {safePage + 1} of {totalPages}
                  </span>

                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={safePage >= totalPages - 1}
                    className={cn(
                      "px-2 py-1 rounded-md border border-white/10",
                      safePage >= totalPages - 1 && "opacity-40 cursor-not-allowed",
                      safePage < totalPages - 1 && "hover:bg-white/5"
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
          {leaderboardLoading && <p className={cn("text-xs", "opacity-70")}>Loading leaderboard…</p>}

          {!leaderboardLoading && leaderboard.length === 0 && (
            <p className={cn("text-sm", "opacity-75", "italic")}>
              No scores yet. Leaderboard will appear once players start answering questions.
            </p>
          )}

          {!leaderboardLoading && leaderboard.length > 0 && (
            <div className="space-y-2">
              {leaderboard.map((row, idx) => (
                <div
                  key={row.playerId}
                  className={cn(
                    "flex items-center justify-between rounded-lg bg-gray-900/70",
                    "border border-white/10 px-3 py-2"
                  )}
                >
                  <div className={cn("flex items-center gap-3")}>
                    <div
                      className={cn(
                        "w-8 h-8 rounded-full bg-blue-500/40",
                        "flex items-center justify-center font-bold text-xs"
                      )}
                    >
                      {idx + 1}
                    </div>

                    <div className={cn("text-sm", "font-semibold")}>{row.label}</div>
                  </div>

                  <div className={cn("text-lg", "font-bold")}>{row.totalPoints}</div>
                </div>
              ))}
            </div>
          )}
        </Tabs.Content>

        {/* ---------------- SETTINGS ONE ---------------- */}
        <Tabs.Content value="settings1" className={cn("mt-4")}>
          <div className={cn("space-y-5")}>
            <div className={cn("flex items-center justify-between gap-4")}>
              <div>
                <p className={cn("text-sm", "font-semibold")}>Question Timer</p>
                <p className={cn("text-xs", "opacity-70")}>
                  How many seconds players have to answer each question on the wall.
                </p>
              </div>

              <select
                value={timerSeconds}
                onChange={handleTimerChange}
                className={cn(
                  "bg-gray-800 border border-white/20 rounded-md",
                  "px-3 py-1.5 text-sm outline-none focus:border-blue-400"
                )}
              >
                {TIMER_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt} seconds
                  </option>
                ))}
              </select>
            </div>

            <div className={cn("flex items-center justify-between gap-4")}>
              <div>
                <p className={cn("text-sm", "font-semibold")}>Lobby Countdown</p>
                <p className={cn("text-xs", "opacity-70")}>How long the pre-game countdown runs before the first question.</p>
              </div>

              <select
                value={countdownSeconds}
                onChange={handleCountdownSecondsChange}
                className={cn(
                  "bg-gray-800 border border-white/20 rounded-md",
                  "px-3 py-1.5 text-sm outline-none focus:border-blue-400"
                )}
              >
                {COUNTDOWN_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={cn("flex items-center justify-between gap-4")}>
              <div>
                <p className={cn("text-sm", "font-semibold")}>Play Mode</p>
                <p className={cn("text-xs", "opacity-70")}>Auto-advance or manual control between questions.</p>
              </div>

              <select
                value={playMode}
                onChange={handlePlayModeChange}
                className={cn(
                  "bg-gray-800 border border-white/20 rounded-md",
                  "px-3 py-1.5 text-sm outline-none focus:border-blue-400"
                )}
              >
                <option value="auto">Auto (host taps Play once)</option>
                <option value="manual">Manual (host advances each question)</option>
              </select>
            </div>

            <div className={cn("flex items-center justify-between gap-4")}>
              <div>
                <p className={cn("text-sm", "font-semibold")}>Scoring Mode</p>
                <p className={cn("text-xs", "opacity-70")}>Flat always awards max points. Speed rewards faster answers.</p>
              </div>

              <select
                value={scoringMode}
                onChange={handleScoringModeChange}
                className={cn(
                  "bg-gray-800 border border-white/20 rounded-md",
                  "px-3 py-1.5 text-sm outline-none focus:border-blue-400"
                )}
              >
                <option value="flat">Flat (always max points)</option>
                <option value="speed">Speed-based (faster = more)</option>
              </select>
            </div>

            <div className={cn("flex items-center justify-between gap-4")}>
              <div>
                <p className={cn("text-sm", "font-semibold")}>Require Selfie</p>
                <p className={cn("text-xs", "opacity-70")}>Force players to upload a selfie before joining the game.</p>
              </div>

              <select
                value={requireSelfie ? "on" : "off"}
                onChange={handleRequireSelfieChange}
                className={cn(
                  "bg-gray-800 border border-white/20 rounded-md",
                  "px-3 py-1.5 text-sm outline-none focus:border-blue-400"
                )}
              >
                <option value="on">On</option>
                <option value="off">Off</option>
              </select>
            </div>

            <div className={cn("flex items-center justify-between gap-4")}>
              <div>
                <p className={cn("text-sm", "font-semibold")}>Show Ads / Sponsor Bar</p>
                <p className={cn("text-xs", "opacity-70")}>Turn on sponsor/ads integrations (where supported).</p>
              </div>

              <select
                value={adsEnabled ? "on" : "off"}
                onChange={handleAdsEnabledChange}
                className={cn(
                  "bg-gray-800 border border-white/20 rounded-md",
                  "px-3 py-1.5 text-sm outline-none focus:border-blue-400"
                )}
              >
                <option value="on">On</option>
                <option value="off">Off</option>
              </select>
            </div>

            {savingSettings && <p className={cn("text-xs", "opacity-70")}>Saving settings…</p>}
          </div>
        </Tabs.Content>

        {/* ---------------- SETTINGS TWO ---------------- */}
        <Tabs.Content value="settings2" className={cn("mt-4", "space-y-4")}>
          <div className={cn("flex items-center justify-between gap-4")}>
            <div>
              <p className={cn("text-sm", "font-semibold")}>Points Type</p>
              <p className={cn("text-xs", "opacity-70")}>Cosmetic points scale: 100s, 1,000s, or 10,000s.</p>
            </div>
            <select
              value={pointsType}
              onChange={handlePointsTypeChange}
              className={cn(
                "bg-gray-800 border border-white/20 rounded-md",
                "px-3 py-1.5 text-sm outline-none focus:border-blue-400"
              )}
            >
              <option value="100s">100&apos;s</option>
              <option value="1000s">1,000&apos;s</option>
              <option value="10000s">10,000&apos;s</option>
            </select>
          </div>

          <div className={cn("flex items-center justify-between gap-4")}>
            <div>
              <p className={cn("text-sm", "font-semibold")}>Progressive Wrong-Answer Removal</p>
              <p className={cn("text-xs", "opacity-70")}>
                At 50% elapsed time, one wrong answer is removed. At 75%, another wrong answer is removed.
              </p>
            </div>
            <select
              value={progressiveWrongRemovalEnabled ? "on" : "off"}
              onChange={handleProgressiveWrongRemovalChange}
              className={cn(
                "bg-gray-800 border border-white/20 rounded-md",
                "px-3 py-1.5 text-sm outline-none focus:border-blue-400"
              )}
            >
              <option value="on">On</option>
              <option value="off">Off</option>
            </select>
          </div>

          <div className={cn("flex items-center justify-between gap-4")}>
            <div>
              <p className={cn("text-sm", "font-semibold")}>Highlight The Herd</p>
              <p className={cn("text-xs", "opacity-70")}>
                Highlights the most-chosen answer on the wall during the question.
              </p>
            </div>
            <select
              value={highlightTheHerdEnabled ? "on" : "off"}
              onChange={handleHighlightTheHerdChange}
              className={cn(
                "bg-gray-800 border border-white/20 rounded-md",
                "px-3 py-1.5 text-sm outline-none focus:border-blue-400"
              )}
            >
              <option value="on">On</option>
              <option value="off">Off</option>
            </select>
          </div>

          <div className={cn("flex items-center justify-between gap-4")}>
            <div>
              <p className={cn("text-sm", "font-semibold")}>Streak Multiplier</p>
              <p className={cn("text-xs", "opacity-70")}>
                Rewards players with extra points as they build longer correct-answer streaks.
              </p>
            </div>
            <select
              value={streakMultiplierEnabled ? "on" : "off"}
              onChange={handleStreakMultiplierChange}
              className={cn(
                "bg-gray-800 border border-white/20 rounded-md",
                "px-3 py-1.5 text-sm outline-none focus:border-blue-400"
              )}
            >
              <option value="on">On</option>
              <option value="off">Off</option>
            </select>
          </div>

          {savingSettings && <p className={cn("text-xs", "opacity-70")}>Saving settings…</p>}
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
