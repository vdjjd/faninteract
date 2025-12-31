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
   MOCK DATA (for ?mock=1 dev mode only)
--------------------------------------------------------- */
const MOCK_TRIVIA = {
  id: "mock-trivia-1",
  public_name: "Mock Country Trivia",
  timer_seconds: 30,
  scoring_mode: "100s",
};

const MOCK_SESSION: TriviaSession = {
  id: "mock-session-1",
  status: "running",
  current_round: 1,
  current_question: 1,
  question_started_at: new Date().toISOString(),
};

const MOCK_QUESTIONS = [
  {
    id: "mock-q1",
    round_number: 1,
    question_text: "Which city is the capital of Australia?",
    options: ["Sydney", "Melbourne", "Canberra", "Brisbane"],
    correct_index: 2,
  },
  {
    id: "mock-q2",
    round_number: 1,
    question_text: "Which artist sings “Fast Car”?",
    options: ["Luke Combs", "Tracy Chapman", "Morgan Wallen", "Jelly Roll"],
    correct_index: 1,
  },
];

/* ---------------------------------------------------------
   Component
--------------------------------------------------------- */
export default function TriviaUserInterfacePage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const gameId = searchParams.get("game");
  const DEV_MOCK = searchParams.get("mock") === "1";

  const [profile, setProfile] = useState<any>(null);
  const [trivia, setTrivia] = useState<any>(null);
  const [session, setSession] = useState<TriviaSession | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("Loading trivia…");

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  /* ---------------------------------------------------------
     Load guest profile
  --------------------------------------------------------- */
  useEffect(() => {
    if (DEV_MOCK) {
      setProfile({
        id: "mock-guest-1",
        first_name: "Mock",
        last_name: "Player",
      });
      return;
    }

    const p = getStoredGuestProfile();
    if (!p) {
      if (gameId) {
        router.replace(`/guest/signup?trivia=${gameId}`);
      }
      return;
    }
    setProfile(p);
  }, [router, gameId, DEV_MOCK]);

  /* ---------------------------------------------------------
     Initial load (skip Supabase in MOCK mode)
  --------------------------------------------------------- */
  useEffect(() => {
    if (DEV_MOCK) {
      setTrivia(MOCK_TRIVIA);
      setSession(MOCK_SESSION);
      setQuestions(MOCK_QUESTIONS);
      setPlayerId("mock-player-1");
      setLoading(false);
      setLoadingMessage("");
      return;
    }

    if (!gameId || !profile?.id) return;

    let cancelled = false;

    async function init() {
      setLoading(true);
      setLoadingMessage("Loading trivia game…");

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

      if (cancelled) return;

      if (cardErr || !card) {
        console.error("❌ trivia_cards fetch error (UI):", cardErr);
        setLoadingMessage("Could not load trivia game.");
        setLoading(false);
        return;
      }

      setTrivia(card);

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

      if (cancelled) return;

      if (sessionErr || !sessionRow) {
        console.error("❌ trivia_sessions fetch error (UI):", sessionErr);
        setLoadingMessage("The host has not opened this trivia game yet.");
        setLoading(false);
        return;
      }

      setSession(sessionRow as TriviaSession);

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
  }, [gameId, profile?.id, DEV_MOCK]);

  /* ---------------------------------------------------------
     Poll session (skip in MOCK mode)
  --------------------------------------------------------- */
  useEffect(() => {
    if (DEV_MOCK) return;
    if (!gameId || !session?.id) return;

    const doPoll = async () => {
      const { data, error } = await supabase
        .from("trivia_sessions")
        .select("id,status,current_round,current_question,question_started_at")
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

    doPoll();
    const id = setInterval(doPoll, 2000);

    return () => clearInterval(id);
  }, [session?.id, gameId, DEV_MOCK]);

  /* ---------------------------------------------------------
     Derived question + timer
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

  useEffect(() => {
    if (!session?.question_started_at || !timerSeconds || !currentQuestion) {
      setTimeLeft(null);
      return;
    }

    setSelectedIndex(null);
    setHasAnswered(false);

    const startMs = new Date(session.question_started_at).getTime();

    const compute = () => {
      const nowMs = Date.now();
      const elapsed = Math.floor((nowMs - startMs) / 1000);
      const remaining = timerSeconds - elapsed;
      setTimeLeft(remaining > 0 ? remaining : 0);
    };

    compute();
    const id = setInterval(compute, 1000);
    return () => clearInterval(id);
  }, [session?.question_started_at, timerSeconds, currentQuestion?.id]);

  const questionLocked = useMemo(
    () => timeLeft !== null && timeLeft <= 0,
    [timeLeft]
  );

  /* ---------------------------------------------------------
     Answer submission
  --------------------------------------------------------- */
  async function handleSelectAnswer(idx: number) {
    if (!currentQuestion) return;
    if (hasAnswered || questionLocked) return;

    setSelectedIndex(idx);
    setHasAnswered(true);

    if (DEV_MOCK) return;
    if (!playerId) return;

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

    const maxPoints =
      scoringMode === "1000s"
        ? 1000
        : scoringMode === "10000s"
        ? 10000
        : 100;

    const baseSeconds = timerSeconds || 1;
    const secondsLeft =
      timeLeft === null ? baseSeconds : Math.max(0, timeLeft);
    const frac = Math.max(0, Math.min(1, secondsLeft / baseSeconds));
    const points = Math.round(maxPoints * frac);

    const isCorrect = idx === currentQuestion.correct_index;

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
  if (!gameId && !DEV_MOCK) {
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

  if (!DEV_MOCK && !profile) {
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

  if ((!session || !questions.length || !currentQuestion) && !DEV_MOCK) {
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
  const pctWidth = Math.max(
    0,
    Math.min(100, (safeTimeLeft / baseSeconds) * 100)
  );

  let footerText = "";
  if (!session?.question_started_at) {
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
      {/* HEADER ROW */}
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
          }}
        >
          LOGO
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
            Question {currentQuestionIndex + 1} of {questions.length}
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
          }}
        >
          {currentQuestion.question_text}
        </div>
      </div>

      {/* GREEN TIMER BAR */}
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
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "0.85rem",
            fontWeight: 700,
            zIndex: 2,
          }}
        >
          {minutes}:{seconds.toString().padStart(2, "0")}
        </div>
        <div
          style={{
            height: "100%",
            width: `${pctWidth}%`,
            background: "linear-gradient(90deg,#22c55e,#16a34a,#15803d)",
            transition: "width 0.25s linear",
          }}
        />
      </div>

      {/* ANSWER BUTTONS (scrolls so Ad Slot stays visible) */}
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
        {currentQuestion.options.map((opt: string, idx: number) => {
          const chosen = selectedIndex === idx;
          const disabled = hasAnswered || questionLocked;

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
                padding: "6px 12px",
                borderRadius: 20,
                background: bg,
                border,
                opacity,
                color: "#fff",
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                gap: 15,
                fontSize: "0.95rem",
                fontWeight: chosen ? 700 : 500,
                minHeight: 72,
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
                  marginTop: 0,
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
      </div>

      {/* AD SLOT PLACEHOLDER */}
      <div
        style={{
          marginBottom: 10,
          padding: 16,
          borderRadius: 16,
          border: "1px dashed rgba(148,163,184,0.6)",
          background: "rgba(15,23,42,0.7)",
          minHeight: 160,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "0.95rem",
          opacity: 0.95,
        }}
      >
        AD SLOT (from Ad Manager)
      </div>

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
    </div>
  );
}
