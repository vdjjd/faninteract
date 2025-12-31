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

/* -------------------------------------------------------------------------- */
/* 🎮 TRIVIA ACTIVE WALL                                                       */
/* -------------------------------------------------------------------------- */

export default function TriviaActiveWall({ trivia }: TriviaActiveWallProps) {
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

  // ✅ DB-synced timer anchor
  const [questionStartedAt, setQuestionStartedAt] = useState<string | null>(null);

  const [progress, setProgress] = useState(1);
  const [locked, setLocked] = useState(false);

  // Answer reveal phases
  const [showAnswerOverlay, setShowAnswerOverlay] = useState(false);
  const [revealAnswer, setRevealAnswer] = useState(false);

  // 🔠 Question text DOM ref (for auto-scaling to ~2 lines)
  const questionRef = useRef<HTMLDivElement | null>(null);

  // Top 3 ranks for Current Rankings
  const [topRanks, setTopRanks] = useState<TopRankRow[]>([]);
  const topRanksRef = useRef<TopRankRow[]>([]);

  /* -------------------------------------------------- */
  /* FETCH CURRENT QUESTION (POLLING)                    */
  /* -------------------------------------------------- */
  useEffect(() => {
    if (!trivia?.id) return;

    let alive = true;

    async function fetchCurrentQuestion() {
      // 1️⃣ Get the running session for this trivia card (DB source of truth)
      const { data: session, error: sessionErr } = await supabase
        .from("trivia_sessions")
        .select("current_question, question_started_at")
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
          setQuestionStartedAt(null);
        }
        return;
      }

      const index = Math.max(0, session.current_question - 1);
      setCurrentQuestionNumber(session.current_question);
      setQuestionStartedAt(session.question_started_at ?? null);

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
        .select("id")
        .eq("trivia_card_id", trivia.id)
        .eq("status", "running")
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
        .select("id,status,guest_id")
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
          .select("*")
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
          return {
            playerId: p.id,
            guestId: p.guest_id,
            name: guest?.name || "Player",
            selfieUrl: guest?.selfieUrl || null,
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
  /* TIMER ENGINE — DB-SYNCED                             */
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

    // ✅ DB start time (falls back to now if missing)
    const startedMs = questionStartedAt
      ? new Date(questionStartedAt).getTime()
      : Date.now();

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
  }, [isRunning, currentQuestionNumber, trivia?.timer_seconds, questionStartedAt]);

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
  /* AUTO-ADVANCE QUESTION AFTER 8s OF REVEAL            */
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
            question_started_at: new Date().toISOString(), // ✅ critical
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

  const options: string[] = Array.isArray(question?.options) ? question.options : [];

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
    "2px solid rgba(96, 165, 250, 1)", // lighter blue
    "2px solid rgba(74, 222, 128, 1)", // lighter green
    "2px solid rgba(253, 224, 71, 1)", // lighter yellow
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
            {question?.question_text ? question.question_text : "Waiting for game to start"}
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
                  let bg = baseBgColors[idx] ?? "rgba(255,255,255,0.12)";
                  let border = baseBorders[idx] ?? "1px solid rgba(255,255,255,0.18)";
                  let opacity = 1;
                  let boxShadow = "none";
                  let transform = "scale(1)";

                  // When revealing the answer:
                  if (revealAnswer) {
                    if (isCorrect) {
                      border = highlightBorders[idx] ?? border;
                      boxShadow = `0 0 40px 8px ${glowColors[idx] ?? "rgba(255,255,255,0.9)"}`;
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
              : null}
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

        {/* TOP 3 LEADERS (ALIGNED + ADJUSTABLE) */}
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
                {/* Avatar (col 1, row 1) */}
                <div
                  style={{
                    gridColumn: "1 / 2",
                    gridRow: "1 / 2",
                    width: RANKINGS_CTRL.avatarSize,
                    height: RANKINGS_CTRL.avatarSize,
                    borderRadius: "50%",
                    overflow: "hidden",
                    background: "rgba(255,255,255,0.12)",
                    border: hasSelfie
                      ? "2px solid rgba(255,255,255,0.45)"
                      : "2px dashed rgba(255,255,255,0.45)",
                    boxShadow: hasSelfie ? "0 0 16px rgba(0,0,0,0.45)" : "none",
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

                {/* Name (col 2, row 1) */}
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

                {/* Place (col 1, row 2) — centered UNDER the circle */}
                <div
                  style={{
                    gridColumn: "1 / 2",
                    gridRow: "2 / 3",
                    justifySelf: "center",
                    marginTop: RANKINGS_CTRL.placeTopMargin,
                    fontSize: "clamp(1rem,1.2vw,1.25rem)",
                    opacity: 0.9,
                  }}
                >
                  {place === 1 ? "1st" : place === 2 ? "2nd" : "3rd"}
                </div>
              </div>
            );
          })}
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
            box-shadow: 0 0 30px rgba(59, 130, 246, 0.7),
              0 0 60px rgba(59, 130, 246, 0.5);
          }
          100% {
            transform: scale(1.06);
            box-shadow: 0 0 45px rgba(59, 130, 246, 1),
              0 0 95px rgba(59, 130, 246, 0.9);
          }
        }
      `}</style>
    </>
  );
}
