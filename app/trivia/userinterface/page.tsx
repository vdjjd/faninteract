"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";

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
}

/* ---------------------------------------------------------
   Component
--------------------------------------------------------- */
export default function TriviaUserInterfacePage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const gameId = searchParams.get("game"); // trivia_cards.id

  const [profile, setProfile] = useState<any>(null);
  const [trivia, setTrivia] = useState<any>(null);
  const [session, setSession] = useState<TriviaSession | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("Loading trivia…");

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);

  // ⏱ time left for the current question (in seconds), derived from DB time
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  /* ---------------------------------------------------------
     Load guest profile
  --------------------------------------------------------- */
  useEffect(() => {
    const p = getStoredGuestProfile();
    if (!p) {
      if (gameId) {
        router.replace(`/guest/signup?trivia=${gameId}`);
      }
      return;
    }
    setProfile(p);
  }, [router, gameId]);

  /* ---------------------------------------------------------
     Initial load: trivia card, session, questions, player row
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
          scoring_mode
        `
        )
        .eq("id", gameId)
        .maybeSingle();

      if (cardErr || !card) {
        console.error("❌ trivia_cards fetch error (UI):", cardErr);
        if (!cancelled) {
          setLoadingMessage("Could not load trivia game.");
        }
        return;
      }

      if (cancelled) return;
      setTrivia(card);

      // 2️⃣ Get latest session for this card
      setLoadingMessage("Connecting to game session…");

      const { data: sessionRow, error: sessionErr } = await supabase
        .from("trivia_sessions")
        .select(
          "id,status,current_round,current_question,question_started_at,created_at"
        )
        .eq("trivia_card_id", gameId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sessionErr || !sessionRow) {
        console.error("❌ trivia_sessions fetch error (UI):", sessionErr);
        if (!cancelled) {
          setLoadingMessage(
            "The host has not opened this trivia game yet."
          );
        }
        return;
      }

      if (cancelled) return;
      setSession(sessionRow as TriviaSession);

      // 3️⃣ Ensure we have this player row for the session
      setLoadingMessage("Finding your player seat…");

      const { data: playerRow, error: playerErr } = await supabase
        .from("trivia_players")
        .select("id,status")
        .eq("session_id", sessionRow.id)
        .eq("guest_id", profile.id)
        .maybeSingle();

      if (playerErr || !playerRow) {
        console.error("❌ trivia_players fetch error (UI):", playerErr);
        if (!cancelled) {
          setLoadingMessage(
            "Could not find your player entry for this game."
          );
        }
        return;
      }

      if (cancelled) return;
      setPlayerId(playerRow.id);

      // 4️⃣ Load active questions for the card
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

      if (qErr || !qs) {
        console.error("❌ trivia_questions fetch error (UI):", qErr);
        if (!cancelled) {
          setLoadingMessage("No questions are available for this game.");
        }
        return;
      }

      if (cancelled) return;
      setQuestions(qs);
      setLoading(false);
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [gameId, profile?.id]);

  /* ---------------------------------------------------------
     Poll trivia_sessions for current_question / status / start time
  --------------------------------------------------------- */
  useEffect(() => {
    if (!gameId || !session?.id) return;

    const doPoll = async () => {
      const { data, error } = await supabase
        .from("trivia_sessions")
        .select(
          "id,status,current_round,current_question,question_started_at"
        )
        .eq("id", session.id)
        .maybeSingle();

      if (error || !data) {
        console.error("❌ trivia_sessions poll error:", error);
        return;
      }

      setSession((prev) => ({
        ...(prev || data),
        ...data,
      }));
    };

    // Immediate poll, then every 2s
    doPoll();
    const id = setInterval(doPoll, 2000);

    return () => {
      clearInterval(id);
    };
  }, [session?.id, gameId]);

  /* ---------------------------------------------------------
     Derive current question index + object
     - current_question is 1-based across active questions
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

  /* ---------------------------------------------------------
     Question timer: derived from question_started_at in DB
     - This keeps ALL devices in sync.
  --------------------------------------------------------- */
  useEffect(() => {
    if (!session?.question_started_at || !timerSeconds || !currentQuestion) {
      setTimeLeft(null);
      return;
    }

    // New question started → reset local UI state
    setSelectedIndex(null);
    setHasAnswered(false);

    const startMs = new Date(session.question_started_at).getTime();

    const compute = () => {
      const nowMs = Date.now();
      const elapsed = Math.floor((nowMs - startMs) / 1000);
      const remaining = timerSeconds - elapsed;
      setTimeLeft(remaining > 0 ? remaining : 0);
    };

    // Initial compute + interval
    compute();
    const id = setInterval(compute, 1000);

    return () => {
      clearInterval(id);
    };
  }, [session?.question_started_at, timerSeconds, currentQuestion?.id]);

  const questionLocked = useMemo(() => {
    if (timeLeft === null) return false;
    return timeLeft <= 0;
  }, [timeLeft]);

  // ✅ Question is considered "open" only if host has started it AND timer > 0
  const questionOpen = !!session?.question_started_at && !questionLocked;

  /* ---------------------------------------------------------
     Answer submission
  --------------------------------------------------------- */
  async function handleSelectAnswer(idx: number) {
    if (!playerId || !currentQuestion) return;

    // ❌ Don't allow answers before host opens the question or after time is up
    if (!session?.question_started_at || questionLocked) return;
    if (hasAnswered) return;

    setSelectedIndex(idx);
    setHasAnswered(true);

    // Prevent duplicate answers
    const { data: existing, error: existingErr } = await supabase
      .from("trivia_answers")
      .select("id")
      .eq("player_id", playerId)
      .eq("question_id", currentQuestion.id)
      .maybeSingle();

    if (existingErr) {
      console.error("❌ trivia_answers existing check error:", existingErr);
    }

    if (existing) {
      return;
    }

    const maxPoints =
      scoringMode === "1000s"
        ? 1000
        : scoringMode === "10000s"
        ? 10000
        : 100;

    const baseSeconds = timerSeconds || 1;
    const secondsLeft =
      timeLeft === null ? baseSeconds : Math.max(0, timeLeft);
    const frac = Math.max(
      0,
      Math.min(1, secondsLeft / baseSeconds)
    );
    const points = Math.round(maxPoints * frac);

    const isCorrect = idx === currentQuestion.correct_index;

    const { error: insertErr } = await supabase
      .from("trivia_answers")
      .insert({
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

  const baseSeconds = timerSeconds || 1;
  const safeTimeLeft =
    timeLeft === null ? baseSeconds : Math.max(0, timeLeft);
  const minutes = Math.floor(safeTimeLeft / 60);
  const seconds = safeTimeLeft % 60;

  let footerText = "";
  if (!session.question_started_at) {
    footerText = "Host hasn't opened this question yet. Get ready…";
  } else if (questionLocked) {
    footerText = "Time is up. Wait for the next question…";
  } else if (hasAnswered) {
    footerText = "Answer submitted. You can’t change it for this question.";
  } else {
    footerText = "Tap an answer to lock in your choice.";
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top,#1d4ed8 0,#020617 55%,#000 100%)",
        color: "#fff",
        padding: 20,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          textAlign: "center",
          marginBottom: 16,
        }}
      >
        <div
          style={{
            fontSize: "0.9rem",
            opacity: 0.8,
          }}
        >
          {trivia?.public_name || "Trivia Game"}
        </div>
        <div
          style={{
            fontSize: "0.8rem",
            opacity: 0.7,
            marginTop: 4,
          }}
        >
          Question {currentQuestionIndex + 1} of {questions.length}
        </div>
      </div>

      {/* Timer */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          marginBottom: 12,
        }}
      >
        <div
          style={{
            borderRadius: 999,
            padding: "8px 18px",
            background:
              safeTimeLeft <= 5
                ? "rgba(220,38,38,0.2)"
                : "rgba(15,118,110,0.25)",
            border:
              safeTimeLeft <= 5
                ? "1px solid rgba(248,113,113,0.9)"
                : "1px solid rgba(34,197,94,0.8)",
            fontWeight: 700,
            letterSpacing: 1,
            fontSize: "1.2rem",
          }}
        >
          {minutes}:{seconds.toString().padStart(2, "0")}
        </div>
      </div>

      {/* Question */}
      <div
        style={{
          padding: 16,
          borderRadius: 16,
          background: "rgba(15,23,42,0.9)",
          border: "1px solid rgba(148,163,184,0.4)",
          marginBottom: 16,
        }}
      >
        <div
          style={{
            fontSize: "0.8rem",
            opacity: 0.8,
            marginBottom: 6,
          }}
        >
          Round {currentQuestion.round_number}
        </div>
        <div
          style={{
            fontSize: "1.1rem",
            fontWeight: 700,
            lineHeight: 1.35,
          }}
        >
          {currentQuestion.question_text}
        </div>
      </div>

      {/* Options */}
      <div
        style={{
          display: "grid",
          gap: 10,
          marginBottom: 16,
          flexGrow: 1,
        }}
      >
        {currentQuestion.options.map((opt: string, idx: number) => {
          const chosen = selectedIndex === idx;

          // 🔒 Now also disabled if host hasn't opened question yet
          const disabled =
            hasAnswered || questionLocked || !session.question_started_at;

          let bg = "rgba(15,23,42,0.85)";
          let border = "1px solid rgba(148,163,184,0.4)";
          let opacity = 1;

          if (disabled && !chosen) {
            opacity = 0.6;
          }

          if (chosen) {
            bg = "linear-gradient(90deg,#22c55e,#15803d)";
            border = "1px solid rgba(240,253,250,0.9)";
          }

          return (
            <button
              key={idx}
              onClick={() => handleSelectAnswer(idx)}
              disabled={disabled}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 14,
                background: bg,
                border,
                opacity,
                color: "#fff",
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: "0.98rem",
                fontWeight: chosen ? 700 : 500,
              }}
            >
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "999px",
                  border: "1px solid rgba(226,232,240,0.8)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.75rem",
                  background: chosen
                    ? "rgba(15,23,42,0.2)"
                    : "rgba(15,23,42,0.7)",
                }}
              >
                {String.fromCharCode(65 + idx)}
              </span>
              <span>{opt}</span>
            </button>
          );
        })}
      </div>

      {/* Footer status */}
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
    </div>
  );
}
