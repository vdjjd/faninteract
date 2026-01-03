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

  // ✅ wall authority (optional)
  wall_phase?: string | null; // 'question'|'overlay'|'reveal'|'leaderboard'|'podium'
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
  injector_enabled: boolean | null;

  // ✅ NEW: trivia ad slot toggle
  trivia_ads_enabled?: boolean | null;
};

type SlideAd = {
  id: string;
  url: string;
  type: "image" | "video";
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
  const [hostLogoUrl, setHostLogoUrl] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("Loading trivia…");

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);

  // Timer (question time only)
  const [progress, setProgress] = useState<number>(1); // 1 → 0
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);

  // Wall-authority phases (UI follows these)
  const [showAnswerOverlay, setShowAnswerOverlay] = useState(false);
  const [revealAnswer, setRevealAnswer] = useState(false);

  // View: question vs leaderboard (also wall-authority)
  const [view, setView] = useState<UIView>("question");
  const [leaderRows, setLeaderRows] = useState<LeaderRow[]>([]);
  const [leaderLoading, setLeaderLoading] = useState(false);

  // DB-anchored start time
  const [questionStartedAt, setQuestionStartedAt] = useState<string | null>(
    null
  );

  // interval id for timer
  const timerIntervalRef = useRef<number | null>(null);

  // ✅ server-time offset to prevent drift
  const [serverOffsetMs, setServerOffsetMs] = useState<number>(0);

  // ✅ Ads
  const [hostRow, setHostRow] = useState<HostRow | null>(null);
  const [ads, setAds] = useState<SlideAd[]>([]);
  const [adsLoading, setAdsLoading] = useState(false);

  // ✅ Fade ad on change + keep last displayed ad
  const [displayAd, setDisplayAd] = useState<SlideAd | null>(null);
  const [adOpacity, setAdOpacity] = useState<number>(1);
  const adFadeTimerRef = useRef<number | null>(null);

  // ✅ Avoid re-setting identical ads list every poll
  const lastAdsKeyRef = useRef<string>("");

  /* ---------------------------------------------------------
     ✅ Server clock sync (prevents drift)
     Requires SQL: public.server_time()
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
     Initial load: trivia card, host, session, player row, questions
  --------------------------------------------------------- */
  useEffect(() => {
    if (!gameId || !profile?.id) return;

    let cancelled = false;

    async function init() {
      setLoading(true);
      setLoadingMessage("Loading trivia game…");

      // 1️⃣ Load trivia card
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

      // 2️⃣ Host row (logo + master_id + injector_enabled + trivia_ads_enabled)
      let logo = "/faninteractlogo.png";
      if (card.host_id) {
        const { data: host, error: hostErr } = await supabase
          .from("hosts")
          .select(
            "id,master_id,branding_logo_url,logo_url,injector_enabled,trivia_ads_enabled"
          )
          .eq("id", card.host_id)
          .maybeSingle();

        if (!hostErr && host) {
          setHostRow(host as HostRow);
          logo =
            host.branding_logo_url?.trim() ||
            host.logo_url?.trim() ||
            logo;
        }
      }
      if (!cancelled) setHostLogoUrl(logo);

      // 3️⃣ Latest session for this card
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
      setQuestionStartedAt(sessionRow.question_started_at ?? null);

      // 4️⃣ Ensure we have this player row for the session
      setLoadingMessage("Finding your player seat…");

      const { data: playerRow, error: playerErr } = await supabase
        .from("trivia_players")
        .select("id,status")
        .eq("session_id", sessionRow.id)
        .eq("guest_id", profile.id)
        .maybeSingle();

      if (cancelled) return;

      if (playerErr || !playerRow) {
        console.error("❌ trivia_players fetch error (UI):", playerErr);
        setLoadingMessage("Could not find your player entry for this game.");
        setLoading(false);
        return;
      }

      setPlayerId(playerRow.id);

      // 5️⃣ Load active questions
      setLoadingMessage("Loading questions…");

      const { data: qs, error: qErr } = await supabase
        .from("trivia_questions")
        .select(
          "id, round_number, question_text, options, correct_index, is_active"
        )
        .eq("trivia_card_id", gameId)
        .eq("is_active", true)
        .order("round_number", { ascending: true })
        .order("created_at", { ascending: true });

      if (cancelled) return;

      if (qErr || !qs) {
        console.error("❌ trivia_questions fetch error (UI):", qErr);
        setLoadingMessage("No questions are available for this game.");
        setLoading(false);
        return;
      }

      setQuestions(qs);
      setLoading(false);
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [gameId, profile?.id, router]);

  /* ---------------------------------------------------------
     ✅ Poll hosts every 5s (keeps toggles + logo updated live)
  --------------------------------------------------------- */
  useEffect(() => {
    const hostId = trivia?.host_id as string | null;
    if (!hostId) return;

    let cancelled = false;

    const pollHost = async () => {
      const { data: host, error } = await supabase
        .from("hosts")
        .select(
          "id,master_id,branding_logo_url,logo_url,injector_enabled,trivia_ads_enabled"
        )
        .eq("id", hostId)
        .maybeSingle();

      if (cancelled) return;

      if (error || !host) {
        // don’t wipe hostRow on transient errors
        return;
      }

      setHostRow(host as HostRow);

      const logo =
        host.branding_logo_url?.trim() ||
        host.logo_url?.trim() ||
        "/faninteractlogo.png";
      setHostLogoUrl(logo);
    };

    pollHost();
    const id = window.setInterval(pollHost, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [trivia?.host_id]);

  /* ---------------------------------------------------------
     ✅ Ad slot enable logic (both toggles must be true)
  --------------------------------------------------------- */
  const showAdSlot = useMemo(() => {
    return Boolean(hostRow?.injector_enabled) && Boolean(hostRow?.trivia_ads_enabled);
  }, [hostRow?.injector_enabled, hostRow?.trivia_ads_enabled]);

  /* ---------------------------------------------------------
     ✅ Fetch ads (used by initial load + polling)
  --------------------------------------------------------- */
  const fetchAds = async (host: HostRow) => {
    if (!host?.id) return;

    // slot disabled => clear
    if (!showAdSlot) {
      setAds([]);
      return;
    }

    const hostId = host.id;
    const masterId = host.master_id;

    let query = supabase
      .from("slide_ads")
      .select(
        "id,url,type,active,order_index,global_order_index,duration_seconds,host_profile_id,master_id"
      )
      .eq("active", true)
      .eq("type", "image");

    if (masterId) {
      query = query
        .or(`master_id.eq.${masterId},host_profile_id.eq.${hostId}`)
        .order("global_order_index", { ascending: true })
        .order("order_index", { ascending: true });
    } else {
      query = query
        .eq("host_profile_id", hostId)
        .order("order_index", { ascending: true });
    }

    const { data, error } = await query;

    if (error) {
      console.warn("⚠️ slide_ads fetch error (trivia phone):", error);
      setAds([]);
      return;
    }

    const next = (data as SlideAd[]) || [];

    // only update if changed (prevents flicker)
    const key = next.map((a) => `${a.id}:${a.url}`).join("|");
    if (key !== lastAdsKeyRef.current) {
      lastAdsKeyRef.current = key;
      setAds(next);
    }
  };

  /* ---------------------------------------------------------
     ✅ Initial load ads once hostRow is present
  --------------------------------------------------------- */
  useEffect(() => {
    if (!hostRow?.id) return;

    let cancelled = false;

    async function loadAdsOnce() {
      try {
        setAdsLoading(true);
        await fetchAds(hostRow);
      } finally {
        if (!cancelled) setAdsLoading(false);
      }
    }

    loadAdsOnce();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostRow?.id, hostRow?.master_id, showAdSlot]);

  /* ---------------------------------------------------------
     ✅ Poll ads every 5s (keeps ads list updated live)
  --------------------------------------------------------- */
  useEffect(() => {
    if (!hostRow?.id) return;

    let cancelled = false;

    const pollAds = async () => {
      if (cancelled) return;
      if (!showAdSlot) return;

      try {
        setAdsLoading(true);
        await fetchAds(hostRow);
      } finally {
        if (!cancelled) setAdsLoading(false);
      }
    };

    pollAds();
    const id = window.setInterval(pollAds, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostRow?.id, hostRow?.master_id, showAdSlot]);

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

      setQuestionStartedAt(data.question_started_at ?? null);
    };

    doPoll();
    const id = window.setInterval(doPoll, 1000);
    return () => window.clearInterval(id);
  }, [session?.id, gameId]);

  /* ---------------------------------------------------------
     Derived current question (1-based index)
  --------------------------------------------------------- */
  const timerSeconds: number = trivia?.timer_seconds ?? 30;
  const scoringMode: string = trivia?.scoring_mode ?? "100s";

  const currentQuestionIndex =
    session?.current_question && questions.length > 0
      ? Math.min(
          questions.length - 1,
          Math.max(0, session.current_question - 1)
        )
      : 0;

  const currentQuestion = questions[currentQuestionIndex] || null;
  const isRunning = session?.status === "running";

  // ✅ Wall authority phase
  const wallPhase = (session?.wall_phase || "question") as
    | "question"
    | "overlay"
    | "reveal"
    | "leaderboard"
    | "podium";

  /* ---------------------------------------------------------
     ✅ Phone ad changes per question number
  --------------------------------------------------------- */
  const currentAd: SlideAd | null = useMemo(() => {
    if (!ads || ads.length === 0) return null;
    const qNum = session?.current_question ?? 1;
    const idx = ((qNum - 1) % ads.length + ads.length) % ads.length;
    return ads[idx] || null;
  }, [ads, session?.current_question]);

  /* ---------------------------------------------------------
     ✅ Smooth fade between ads (fade out -> swap -> fade in)
  --------------------------------------------------------- */
  useEffect(() => {
    if (adFadeTimerRef.current) {
      window.clearTimeout(adFadeTimerRef.current);
      adFadeTimerRef.current = null;
    }

    if (!showAdSlot) {
      setDisplayAd(null);
      setAdOpacity(1);
      return;
    }

    // while loading, keep whatever is currently displayed
    if (adsLoading) return;

    // first paint
    if (!displayAd) {
      setDisplayAd(currentAd);
      setAdOpacity(1);
      return;
    }

    // no change
    if ((currentAd?.id || null) === (displayAd?.id || null)) return;

    // fade out
    setAdOpacity(0);

    // swap then fade in
    adFadeTimerRef.current = window.setTimeout(() => {
      setDisplayAd(currentAd);
      requestAnimationFrame(() => setAdOpacity(1));
    }, 180);

    return () => {
      if (adFadeTimerRef.current) {
        window.clearTimeout(adFadeTimerRef.current);
        adFadeTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAd?.id, showAdSlot, adsLoading]);

  /* ---------------------------------------------------------
     ✅ Follow wall phase EXACTLY (no client phase timers)
  --------------------------------------------------------- */
  useEffect(() => {
    if (wallPhase === "leaderboard") {
      setView("leaderboard");
      setLeaderLoading(true);
    } else {
      setView("question");
    }

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
    setLeaderLoading(false);

    setSelectedIndex(null);
    setHasAnswered(false);

    setLocked(wallPhase !== "question");
    setProgress(1);
    setSecondsLeft(timerSeconds);
  }, [currentQuestion?.id, timerSeconds]); // keep minimal deps

  /* ---------------------------------------------------------
     TIMER: single source of truth = questionStartedAt
     ✅ Uses serverOffsetMs
     ✅ Stops updating bar when wall leaves 'question'
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
     If user refreshes mid-question, reflect existing answer
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
          typeof data.selected_index === "number" ? data.selected_index : null
        );
      }
    }

    loadExisting();
    return () => {
      cancelled = true;
    };
  }, [playerId, currentQuestion?.id]);

  /* ---------------------------------------------------------
     Load leaderboard (TOP 4) when wallPhase === 'leaderboard'
  --------------------------------------------------------- */
  useEffect(() => {
    if (!session?.id) return;
    if (wallPhase !== "leaderboard") return;

    let cancelled = false;

    async function loadLeaderboard() {
      if (!leaderRows.length) setLeaderLoading(true);

      const { data: players, error: playersErr } = await supabase
        .from("trivia_players")
        .select("id,status,guest_id,display_name,photo_url")
        .eq("session_id", session.id)
        .eq("status", "approved");

      if (playersErr || !players || players.length === 0) {
        if (!cancelled) {
          setLeaderRows([]);
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
        const pts = typeof a.points === "number" ? a.points : 0;
        totals.set(a.player_id, (totals.get(a.player_id) || 0) + pts);
      }

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
            name: safeName,
            points: totals.get(p.id) || 0,
            selfieUrl: safeSelfie,
          };
        })
        .sort((a: any, b: any) => b.points - a.points)
        .map((r: any, idx: number) => ({ ...r, rank: idx + 1 }));

      const hasPoints = built.some((r) => r.points > 0);
      const finalRows = hasPoints ? built : [];

      if (!cancelled) {
        setLeaderRows(finalRows);
        setLeaderLoading(false);
      }
    }

    loadLeaderboard();
    const id = window.setInterval(loadLeaderboard, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [session?.id, wallPhase, leaderRows.length]);

  /* ---------------------------------------------------------
     Answer submission
  --------------------------------------------------------- */
  async function handleSelectAnswer(idx: number) {
    if (!currentQuestion) return;
    if (!playerId) return;
    if (hasAnswered || locked) return;
    if (wallPhase !== "question") return;

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
        {/* HEADER ROW (LOGO + TITLE) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
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
            <div
              style={{
                fontSize: "0.75rem",
                opacity: 0.75,
                marginTop: 2,
              }}
            >
              {view === "leaderboard"
                ? "Leaderboard"
                : `Question ${currentQuestionIndex + 1} of ${questions.length}`}
            </div>
          </div>
        </div>

        {/* QUESTION / LEADERBOARD TITLE BOX */}
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

        {/* TIMER BAR — ONLY ON QUESTION VIEW */}
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

        {/* ANSWER BUTTONS / LEADERBOARD CARDS */}
        <div
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
          {view === "question" &&
            currentQuestion.options.map((opt: string, idx: number) => {
              const chosen = selectedIndex === idx;
              const isCorrect =
                typeof currentQuestion.correct_index === "number" &&
                idx === currentQuestion.correct_index;

              const disabled = hasAnswered || locked || wallPhase !== "question";

              let bgBtn = "rgba(15,23,42,0.85)";
              let border = "1px solid rgba(148,163,184,0.4)";
              let opacityBtn = 1;
              let boxShadow = "none";

              const gotItRightPulse = revealAnswer && chosen && isCorrect;

              if (!revealAnswer && chosen) {
                bgBtn = "linear-gradient(90deg,#22c55e,#15803d)";
                border = "1px solid rgba(240,253,250,0.9)";
                boxShadow = "0 0 12px rgba(74,222,128,0.6)";
              }

              if (revealAnswer) {
                if (isCorrect) {
                  bgBtn = "linear-gradient(90deg,#22c55e,#16a34a)";
                  border = "2px solid rgba(74,222,128,1)";
                  boxShadow = gotItRightPulse
                    ? "0 0 26px rgba(74,222,128,1)"
                    : "0 0 20px rgba(74,222,128,0.9)";
                } else if (chosen && !isCorrect) {
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
            })}

          {view === "leaderboard" &&
            ["1st", "2nd", "3rd", "4th"].map((label, idx) => {
              const row = leaderRows[idx];
              const isFirst = idx === 0;

              return (
                <button
                  key={idx}
                  disabled
                  style={{
                    width: "100%",
                    padding: "6px 12px",
                    borderRadius: 20,
                    background: "rgba(15,23,42,0.85)",
                    border: isFirst
                      ? "2px solid rgba(74,222,128,0.9)"
                      : "1px solid rgba(148,163,184,0.4)",
                    opacity: row ? 1 : 0.5,
                    color: "#fff",
                    textAlign: "left",
                    display: "flex",
                    alignItems: "center",
                    gap: 15,
                    fontSize: "0.95rem",
                    fontWeight: 700,
                    minHeight: 72,
                    boxShadow: isFirst
                      ? "0 0 18px rgba(74,222,128,0.7)"
                      : "none",
                  }}
                >
                  <span
                    style={{
                      position: "relative",
                      width: 60,
                      height: 60,
                      borderRadius: "999px",
                      border: row?.selfieUrl
                        ? "1px solid rgba(226,232,240,0.8)"
                        : "1px dashed rgba(226,232,240,0.8)",
                      overflow: "hidden",
                      background: "rgba(15,23,42,0.7)",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {row?.selfieUrl ? (
                      <img
                        src={row.selfieUrl}
                        alt={row.name}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
                    ) : (
                      <span
                        style={{
                          fontSize: "1.4rem",
                          fontWeight: 900,
                          opacity: 0.9,
                        }}
                      >
                        {row?.name?.[0]?.toUpperCase() || "?"}
                      </span>
                    )}

                    {row && (
                      <span
                        style={{
                          position: "absolute",
                          bottom: -6,
                          left: "50%",
                          transform: "translateX(-50%)",
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: "rgba(15,23,42,0.95)",
                          border: "1px solid rgba(226,232,240,0.9)",
                          fontSize: "0.7rem",
                          fontWeight: 800,
                        }}
                      >
                        {label}
                      </span>
                    )}
                  </span>

                  <span
                    style={{
                      flex: 1,
                      lineHeight: 1.3,
                      wordWrap: "break-word",
                      whiteSpace: "normal",
                    }}
                  >
                    {leaderLoading && !row
                      ? "Loading..."
                      : row
                      ? `${row.name} — ${row.points} pts`
                      : "—"}
                  </span>
                </button>
              );
            })}
        </div>

        {/* ✅ AD SLOT (ONLY WHEN ENABLED) */}
        {showAdSlot && (
          <div
            style={{
              marginBottom: 10,
              padding: 0,
              borderRadius: 16,
              border: "1px solid rgba(148,163,184,0.35)",
              background: "rgba(0,0,0,0.35)",
              height: 160,
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
          >
            {adsLoading ? (
              <div style={{ fontSize: "0.95rem", opacity: 0.9, padding: 16 }}>
                Loading ad…
              </div>
            ) : displayAd?.url ? (
              <img
                src={displayAd.url}
                alt="Sponsored"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain", // ✅ no cropping
                  objectPosition: "center",
                  display: "block",

                  // ✅ fade
                  opacity: adOpacity,
                  transition: "opacity 220ms ease",
                }}
              />
            ) : (
              <div style={{ fontSize: "0.95rem", opacity: 0.9, padding: 16 }}>
                No ads available.
              </div>
            )}

            {!!displayAd?.url && (
              <div
                style={{
                  position: "absolute",
                  bottom: 8,
                  right: 10,
                  padding: "3px 8px",
                  borderRadius: 999,
                  background: "rgba(0,0,0,0.55)",
                  border: "1px solid rgba(255,255,255,0.18)",
                  fontSize: "0.7rem",
                  fontWeight: 800,
                  letterSpacing: 0.2,
                  opacity: adOpacity,
                  transition: "opacity 220ms ease",
                }}
              >
                Sponsored
              </div>
            )}
          </div>
        )}

        {/* FOOTER STATUS */}
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

        {/* THE ANSWER IS OVERLAY (wall authority) */}
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
