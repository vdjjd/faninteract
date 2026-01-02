"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";

// 🔧 adjust this path to wherever you store the engine
import { TriviaTimerEngine } from "@/lib/trivia/triviaTimerEngine";

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
  const [hostLogoUrl, setHostLogoUrl] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("Loading trivia…");

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);

  // Timer + phases (lockstep with ActiveWall style)
  const [progress, setProgress] = useState<number>(1); // 1 → 0
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [showAnswerOverlay, setShowAnswerOverlay] = useState(false);
  const [revealAnswer, setRevealAnswer] = useState(false);

  // 🎯 Timer engine ref
  const timerEngineRef = useRef<TriviaTimerEngine | null>(null);

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
     Initial load: trivia card, host logo, session, player row, questions
  --------------------------------------------------------- */
  useEffect(() => {
    if (!gameId || !profile?.id) return;

    let cancelled = false;

    async function init() {
      setLoading(true);
      setLoadingMessage("Loading trivia game…");

      // 1️⃣ Load trivia card (include host_id so we can pull logo)
      const { data: card, error: cardErr } = await supabase
        .from("trivia_cards")
        .select(
          `
          id,
          public_name,
          timer_seconds,
          scoring_mode,
          host_id
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

      // 2️⃣ Host logo (branding_logo_url → logo_url → fallback)
      let logo = "/faninteractlogo.png";
      if (card.host_id) {
        const { data: hostRow, error: hostErr } = await supabase
          .from("hosts")
          .select("branding_logo_url, logo_url")
          .eq("id", card.host_id)
          .maybeSingle();

        if (!hostErr && hostRow) {
          logo =
            hostRow.branding_logo_url?.trim() ||
            hostRow.logo_url?.trim() ||
            logo;
        }
      }
      if (!cancelled) setHostLogoUrl(logo);

      // 3️⃣ Latest session for this card (waiting or running)
      setLoadingMessage("Connecting to game session…");

      const { data: sessionRow, error: sessionErr } = await supabase
        .from("trivia_sessions")
        .select(
          "id,status,current_round,current_question,question_started_at,created_at"
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

      // 5️⃣ Load active questions for the card (ordered)
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
     Poll trivia_sessions for current_question / status
  --------------------------------------------------------- */
  useEffect(() => {
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
        ...(prev || (data as any)),
        ...(data as any),
      }));
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

  /* ---------------------------------------------------------
     DB-synced timer engine using TriviaTimerEngine
     - Engine just gives us animation ticks; we anchor time to question_started_at
  --------------------------------------------------------- */
  useEffect(() => {
    // if no running session or no question, stop engine
    if (!isRunning || !currentQuestion) {
      if (timerEngineRef.current) {
        timerEngineRef.current.stop();
        timerEngineRef.current = null;
      }
      return;
    }

    // Reset per-question UI state
    setSelectedIndex(null);
    setHasAnswered(false);
    setLocked(false);
    setShowAnswerOverlay(false);
    setRevealAnswer(false);
    setProgress(1);
    setSecondsLeft(timerSeconds);

    const durationMs = (timerSeconds || 30) * 1000;
    const maxPoints =
      scoringMode === "1000s" ? 1000 : scoringMode === "10000s" ? 10000 : 100;

    const updateFromDbTime = () => {
      const startedAtIso = session?.question_started_at;
      const startedMs = startedAtIso
        ? new Date(startedAtIso).getTime()
        : Date.now();

      const now = Date.now();
      const elapsed = now - startedMs;
      const remaining = Math.max(0, durationMs - elapsed);
      const frac = remaining / durationMs;

      setProgress(frac);
      const secs = Math.max(0, Math.ceil(remaining / 1000));
      setSecondsLeft(secs);

      if (remaining <= 0) {
        setLocked(true);
      }
    };

    // Run immediately
    updateFromDbTime();

    // Stop any previous engine
    if (timerEngineRef.current) {
      timerEngineRef.current.stop();
      timerEngineRef.current = null;
    }

    const engine = new TriviaTimerEngine(
      {
        durationMs,
        maxPoints, // fed from scoringMode so config is consistent
      },
      {
        onTick: () => {
          // We ignore engine's own internal clock and
          // keep everything anchored to question_started_at
          updateFromDbTime();
        },
        onComplete: () => {
          updateFromDbTime();
          setLocked(true);
        },
      }
    );

    timerEngineRef.current = engine;
    engine.start();

    return () => {
      engine.stop();
      timerEngineRef.current = null;
    };
  }, [
    isRunning,
    currentQuestion?.id,
    timerSeconds,
    scoringMode,
    session?.question_started_at,
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
     Answer reveal flow (overlay → reveal)
  --------------------------------------------------------- */
  useEffect(() => {
    if (!locked) {
      setShowAnswerOverlay(false);
      setRevealAnswer(false);
      return;
    }

    setShowAnswerOverlay(true);
    setRevealAnswer(false);

    const overlayId = window.setTimeout(() => {
      setShowAnswerOverlay(false);
      setRevealAnswer(true);
    }, 3000);

    return () => window.clearTimeout(overlayId);
  }, [locked]);

  /* ---------------------------------------------------------
     Points helper (DB anchored to question_started_at)
     - Uses same maxPoints logic as engine, so config is consistent
  --------------------------------------------------------- */
  const computePointsNow = useMemo(() => {
    return () => {
      const maxPoints =
        scoringMode === "1000s" ? 1000 : scoringMode === "10000s" ? 10000 : 100;

      const startedAtIso = session?.question_started_at;
      const startedMs = startedAtIso
        ? new Date(startedAtIso).getTime()
        : Date.now();
      const elapsedSec = (Date.now() - startedMs) / 1000;

      const baseSeconds = timerSeconds || 1;
      const remainingSec = Math.max(0, baseSeconds - elapsedSec);

      const frac = Math.max(0, Math.min(1, remainingSec / baseSeconds));
      return Math.round(maxPoints * frac);
    };
  }, [scoringMode, timerSeconds, session?.question_started_at]);

  /* ---------------------------------------------------------
     Answer submission
  --------------------------------------------------------- */
  async function handleSelectAnswer(idx: number) {
    if (!currentQuestion) return;
    if (!playerId) return;
    if (hasAnswered || locked) return;

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
    if (existing) return;

    const isCorrect = idx === currentQuestion.correct_index;

    // ⭐ Only award points for correct answers
    const points = isCorrect ? computePointsNow() : 0;

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

  const baseSeconds = timerSeconds || 1;
  const safeTimeLeft =
    secondsLeft === null ? baseSeconds : Math.max(0, secondsLeft);
  const minutes = Math.floor(safeTimeLeft / 60);
  const seconds = safeTimeLeft % 60;
  const pctWidth = Math.max(0, Math.min(100, progress * 100));

  let footerText = "";
  if (!isRunning) {
    footerText = "Game is paused. Waiting for the host…";
  } else if (locked && !revealAnswer) {
    footerText = "Time is up. Revealing the correct answer…";
  } else if (revealAnswer) {
    footerText = "Here’s the correct answer. Get ready for the next question…";
  } else if (hasAnswered) {
    footerText = "Answer submitted. You can’t change it for this question.";
  } else {
    footerText = "Tap an answer to lock in your choice.";
  }

  return (
    <>
      <div
        style={{
          minHeight: "100vh",
          background:
            "radial-gradient(circle at top,#1d4ed8 0,#020617 55%,#000 100%)",
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

        {/* TIMER BAR */}
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
              background:
                locked || revealAnswer
                  ? "linear-gradient(90deg,#ef4444,#dc2626)"
                  : "linear-gradient(90deg,#22c55e,#16a34a,#15803d)",
              transition: "width 0.1s linear, background 0.2s ease",
            }}
          />
        </div>

        {/* ANSWER BUTTONS */}
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
            const isCorrect =
              typeof currentQuestion.correct_index === "number" &&
              idx === currentQuestion.correct_index;

            const disabled = hasAnswered || locked;

            let bg = "rgba(15,23,42,0.85)";
            let border = "1px solid rgba(148,163,184,0.4)";
            let opacity = 1;
            let boxShadow = "none";

            const gotItRightPulse = revealAnswer && chosen && isCorrect;

            if (!revealAnswer && chosen) {
              bg = "linear-gradient(90deg,#22c55e,#15803d)";
              border = "1px solid rgba(240,253,250,0.9)";
              boxShadow = "0 0 12px rgba(74,222,128,0.6)";
            }

            if (revealAnswer) {
              if (isCorrect) {
                bg = "linear-gradient(90deg,#22c55e,#16a34a)";
                border = "2px solid rgba(74,222,128,1)";
                boxShadow = gotItRightPulse
                  ? "0 0 26px rgba(74,222,128,1)"
                  : "0 0 20px rgba(74,222,128,0.9)";
              } else if (chosen && !isCorrect) {
                bg = "linear-gradient(90deg,#ef4444,#b91c1c)";
                border = "2px solid rgba(248,113,113,1)";
                boxShadow = "0 0 16px rgba(248,113,113,0.9)";
              } else {
                opacity = 0.4;
              }
            } else if (disabled && !chosen) {
              opacity = 0.7;
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

        {/* THE ANSWER IS OVERLAY */}
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

      {/* 🔵 PULSE KEYFRAME FOR CORRECT ANSWER */}
      <style jsx global>{`
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
