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
/* RANKINGS CONTROL                                     */
/* ---------------------------------------------------- */
const RANKINGS_CTRL = {
  bottom: "12vh",
  left: "calc(15vw + 240px)",
  gap: "12vw",
  avatarSize: 72,
};

/* ---------------------------------------------------- */
/* TEMP HOST LOGO STUB                                  */
/* ---------------------------------------------------- */
const fallbackLogo = "/faninteractlogo.png";

/* ---------------------------------------------------- */
/* TIMER CONFIG (DEFAULT/FALLBACK)                      */
/* ---------------------------------------------------- */
const QUESTION_DURATION_MS = 30000;

/* -------------------------------------------------------------------------- */
/* 🎮 TRIVIA ACTIVE WALL                                                       */
/* -------------------------------------------------------------------------- */

export default function TriviaActiveWall({
  trivia,
}: TriviaActiveWallProps) {
  const logoSrc =
    trivia?.host?.branding_logo_url?.trim() ||
    trivia?.host?.logo_url?.trim() ||
    fallbackLogo;

  // ✅ True when the DB row says this game is actually running
  const isRunning =
    trivia?.status === "running" && trivia?.countdown_active === false;

  const [question, setQuestion] = useState<any>(null);
  const [currentQuestionNumber, setCurrentQuestionNumber] =
    useState<number | null>(null);
  const [totalQuestions, setTotalQuestions] = useState<number | null>(null);

  const [progress, setProgress] = useState(1);
  const [locked, setLocked] = useState(false);

  // Answer reveal phases
  const [showAnswerOverlay, setShowAnswerOverlay] = useState(false);
  const [revealAnswer, setRevealAnswer] = useState(false);

  // 🔠 Question text DOM ref (for auto-scaling to ~2 lines)
  const questionRef = useRef<HTMLDivElement | null>(null);

  /* -------------------------------------------------- */
  /* FETCH CURRENT QUESTION (POLLING)                    */
  /* -------------------------------------------------- */
  useEffect(() => {
    if (!trivia?.id) return;

    let alive = true;

    async function fetchCurrentQuestion() {
      // 1️⃣ Get the running session for this trivia card
      const { data: session, error: sessionErr } = await supabase
        .from("trivia_sessions")
        .select("current_question")
        .eq("trivia_card_id", trivia.id)
        .eq("status", "running")
        .maybeSingle();

      if (sessionErr) {
        console.error("❌ trivia_sessions fetch error:", sessionErr);
        return;
      }

      if (!session || !session.current_question) {
        if (alive) {
          setQuestion(null);
          setCurrentQuestionNumber(null);
          setTotalQuestions(null);
        }
        return;
      }

      const index = Math.max(0, session.current_question - 1);
      setCurrentQuestionNumber(session.current_question);

      // 2️⃣ Load all questions for this card
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

    // initial load + poll
    fetchCurrentQuestion();
    const interval = setInterval(fetchCurrentQuestion, 1000);

    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [trivia?.id]);

  /* -------------------------------------------------- */
  /* TIMER ENGINE — INTERVAL BASED (FULLSCREEN SAFE)     */
  /* -------------------------------------------------- */
  useEffect(() => {
    // Only run timer when:
    // 1) the game is marked running
    // 2) we know which question number we're on
    if (!isRunning || currentQuestionNumber == null) return;

    // Reset all state for new question
    setLocked(false);
    setProgress(1);
    setShowAnswerOverlay(false);
    setRevealAnswer(false);

    // ⏱️ Respect per-game timer_seconds (10 / 15 / 30), fallback to 30s
    const durationMs =
      typeof trivia?.timer_seconds === "number" && trivia.timer_seconds > 0
        ? trivia.timer_seconds * 1000
        : QUESTION_DURATION_MS;

    const start = performance.now();

    const id = window.setInterval(() => {
      const elapsed = performance.now() - start;
      const remaining = Math.max(0, durationMs - elapsed);
      const p = remaining / durationMs;

      setProgress(p);

      if (remaining <= 0) {
        setLocked(true);
        window.clearInterval(id);
      }
    }, 50); // update ~20x per second

    return () => {
      window.clearInterval(id);
    };
  }, [isRunning, currentQuestionNumber, trivia?.timer_seconds]);

  /* -------------------------------------------------- */
  /* ANSWER REVEAL FLOW                                  */
  /* -------------------------------------------------- */
  useEffect(() => {
    if (!locked) {
      // Reset reveal state when not locked
      setShowAnswerOverlay(false);
      setRevealAnswer(false);
      return;
    }

    // Step 1: show overlay
    setShowAnswerOverlay(true);
    setRevealAnswer(false);

    const timeoutId = window.setTimeout(() => {
      // Step 2: hide overlay, show highlight
      setShowAnswerOverlay(false);
      setRevealAnswer(true);
    }, 5000); // 5 seconds

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [locked]);

  /* -------------------------------------------------- */
  /* AUTO-ADVANCE QUESTION AFTER 8s OF REVEAL           */
  /* -------------------------------------------------- */
  useEffect(() => {
    // Only auto-advance once the correct answer is being shown
    if (!revealAnswer) return;
    if (!isRunning) return;
    if (currentQuestionNumber == null) return;

    // If we know total questions and we’re at / past the end, don’t advance
    if (totalQuestions != null && currentQuestionNumber >= totalQuestions) {
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        await supabase
          .from("trivia_sessions")
          .update({
            current_question: currentQuestionNumber + 1,
          })
          .eq("trivia_card_id", trivia.id)
          .eq("status", "running");
      } catch (err) {
        console.error("❌ auto-advance error:", err);
      }
    }, 8000); // 8 seconds of showing the correct answer

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [revealAnswer, isRunning, currentQuestionNumber, totalQuestions, trivia?.id]);

  /* -------------------------------------------------- */
  /* AUTO-SCALE QUESTION TEXT TO ~2 LINES               */
  /* -------------------------------------------------- */
  useEffect(() => {
    const el = questionRef.current;
    if (!el) return;

    if (typeof window === "undefined") return;

    // Base font size starting point from viewport width
    let baseSize = Math.max(32, Math.min(88, window.innerWidth * 0.035)); // ~3.5vw
    let size = baseSize;

    el.style.fontSize = `${size}px`;
    el.style.lineHeight = "1.15";
    el.style.whiteSpace = "normal";

    const maxLines = 2;

    const fit = () => {
      const node = questionRef.current;
      if (!node) return;

      const lineHeightPx = size * 1.15;
      const maxHeight = lineHeightPx * maxLines + 4; // small buffer

      if (node.scrollHeight > maxHeight && size > 24) {
        size -= 2;
        node.style.fontSize = `${size}px`;
        node.style.lineHeight = "1.15";
        requestAnimationFrame(fit);
      }
    };

    requestAnimationFrame(fit);
  }, [question?.question_text]);

  const options: string[] = Array.isArray(question?.options)
    ? question.options
    : [];

  // Base colors for A/B/C/D
  const baseBgColors = [
    "rgba(239, 68, 68, 0.30)", // A - Red
    "rgba(59, 130, 246, 0.30)", // B - Blue
    "rgba(34, 197, 94, 0.30)", // C - Green
    "rgba(250, 204, 21, 0.35)", // D - Yellow
  ];

  const baseBorders = [
    "1px solid rgba(239, 68, 68, 0.80)",
    "1px solid rgba(59, 130, 246, 0.80)",
    "1px solid rgba(34, 197, 94, 0.80)",
    "1px solid rgba(250, 204, 21, 0.90)",
  ];

  // Slightly lighter borders for the correct-answer highlight
  const highlightBorders = [
    "2px solid rgba(248, 113, 113, 1)", // lighter red
    "2px solid rgba(96, 165, 250, 1)",  // lighter blue
    "2px solid rgba(74, 222, 128, 1)",  // lighter green
    "2px solid rgba(253, 224, 71, 1)",  // lighter yellow
  ];

  // Glow colors for each answer when correct
  const glowColors = [
    "rgba(248, 113, 113, 0.9)",
    "rgba(96, 165, 250, 0.9)",
    "rgba(74, 222, 128, 0.9)",
    "rgba(253, 224, 71, 0.9)",
  ];

  // ✅ SAME QR FORMAT AS INACTIVE WALL
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://faninteract.vercel.app";

  const qrValue = `${origin}/trivia/${trivia?.id}/join`;

  return (
    <>
      <div
        style={{
          background: "linear-gradient(to bottom right,#1b2735,#090a0f)",
          width: "100vw",
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* FROSTED GLASS PANEL */}
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
          }}
        >
          {/* QUESTION */}
          <div
            ref={questionRef}
            style={{
              // fontSize is managed dynamically to keep max ~2 lines
              fontWeight: 900,
              lineHeight: 1.15,
              textAlign: "center",
              maxWidth: "90%",
              margin: "0 auto 3vh auto",
            }}
          >
            {question?.question_text
              ? question.question_text
              : "Waiting for game to start"}
          </div>

          {/* TIMER BAR */}
          <div
            style={{
              width: "100%",
              height: 20,
              background: "rgba(255,255,255,0.15)",
              borderRadius: 999,
              overflow: "hidden",
              marginBottom: "4vh",
            }}
          >
            <div
              style={{
                width: `${progress * 100}%`,
                height: "100%",
                background:
                  revealAnswer || locked
                    ? "linear-gradient(to right,#ef4444,#dc2626)"
                    : "linear-gradient(to right,#4ade80,#22c55e)",
                transition: "width 0.1s linear, background 0.2s ease",
              }}
            />
          </div>

          {/* ANSWERS */}
          <div
            style={{
              position: "absolute",
              bottom: "21vh",
              left: "4vw",
              right: "4vw",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "2.5vh",
            }}
          >
            {options.length > 0
              ? options.map((opt, idx) => {
                  const isCorrect = idx === question?.correct_index;

                  // Base per-answer styles
                  let bg =
                    baseBgColors[idx] ?? "rgba(255,255,255,0.12)";
                  let border =
                    baseBorders[idx] ?? "1px solid rgba(255,255,255,0.18)";
                  let opacity = 1;
                  let boxShadow = "none";
                  let transform = "scale(1)";

                  // When revealing the answer:
                  if (revealAnswer) {
                    if (isCorrect) {
                      border = highlightBorders[idx] ?? border;
                      boxShadow = `0 0 40px 8px ${
                        glowColors[idx] ?? "rgba(255,255,255,0.9)"
                      }`;
                      transform = "scale(1.04)";
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
                        background: bg,
                        border,
                        fontSize: "clamp(1.6rem,2vw,2.4rem)",
                        fontWeight: 700,
                        textAlign: "center",
                        opacity,
                        boxShadow,
                        transform,
                        transition:
                          "opacity 0.3s ease, border 0.3s ease, background 0.3s ease, box-shadow 0.4s ease, transform 0.4s ease",
                      }}
                    >
                      {String.fromCharCode(65 + idx)}. {opt}
                    </div>
                  );
                })
              : ["A", "B", "C", "D"].map((letter, idx) => {
                  const bg =
                    baseBgColors[idx] ?? "rgba(255,255,255,0.12)";
                  const border =
                    baseBorders[idx] ?? "1px solid rgba(255,255,255,0.18)";

                  return (
                    <div
                      key={letter}
                      style={{
                        padding: "2.4vh 2.6vw",
                        minHeight: "14vh",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 18,
                        background: bg,
                        border,
                        fontSize: "clamp(1.6rem,2vw,2.4rem)",
                        fontWeight: 700,
                        textAlign: "center",
                        opacity: locked ? 0.45 : 1,
                        transition: "opacity 0.3s ease",
                      }}
                    >
                      {letter}. Answer option
                    </div>
                  );
                })}
          </div>

          {/* CURRENT RANKINGS LABEL */}
          <div
            style={{
              position: "absolute",
              bottom: "13vh",
              left: "50%",
              transform: "translateX(-50%)",
              fontSize: "clamp(1.6rem,2vw,2.2rem)",
              fontWeight: 800,
              opacity: 0.85,
            }}
          >
            Current Rankings
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
                    fontSize: "clamp(3rem,5vw,5.5rem)",
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
                    animation: "fiAnswerGlow 1.8s ease-in-out infinite alternate",
                  }}
                >
                  THE ANSWER IS
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ✅ QR CODE — BOTTOM LEFT, BRIGHT */}
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
            style={{
              width: "100%",
              height: "100%",
              borderRadius: 20,
            }}
          />
        </div>

        {/* TOP 3 LEADER PLACEHOLDERS */}
        <div
          style={{
            position: "absolute",
            bottom: RANKINGS_CTRL.bottom,
            left: RANKINGS_CTRL.left,
            display: "flex",
            gap: RANKINGS_CTRL.gap,
            zIndex: 20,
            pointerEvents: "none",
          }}
        >
          {[1, 2, 3].map((place) => (
            <div
              key={place}
              style={{
                width: RANKINGS_CTRL.avatarSize,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                fontWeight: 800,
                opacity: 0.85,
              }}
            >
              <div
                style={{
                  width: RANKINGS_CTRL.avatarSize,
                  height: RANKINGS_CTRL.avatarSize,
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.12)",
                  border: "2px dashed rgba(255,255,255,0.45)",
                  marginBottom: "0.6vh",
                }}
              />
              {place === 1 ? "1st" : place === 2 ? "2nd" : "3rd"}
            </div>
          ))}
        </div>

        {/* LOGO */}
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
      </div>

      {/* 🔵 FANINTERACT PULSE GLOW KEYFRAMES */}
      <style jsx global>{`
        @keyframes fiAnswerGlow {
          0% {
            transform: scale(1);
            box-shadow:
              0 0 30px rgba(59, 130, 246, 0.7),
              0 0 60px rgba(59, 130, 246, 0.5);
          }
          100% {
            transform: scale(1.06);
            box-shadow:
              0 0 45px rgba(59, 130, 246, 1),
              0 0 95px rgba(59, 130, 246, 0.9);
          }
        }
      `}</style>
    </>
  );
}
