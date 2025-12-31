"use client";

import { cn } from "@/lib/utils";
import * as Tabs from "@radix-ui/react-tabs";
import { supabase } from "@/lib/supabaseClient";
import { useEffect, useRef, useState } from "react";

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
  const [playMode, setPlayMode] = useState<string>(trivia?.play_mode || "auto");
  const [scoringMode, setScoringMode] = useState<string>(
    trivia?.scoring_mode || "100s"
  );
  const [requireSelfie, setRequireSelfie] = useState<boolean>(
    trivia?.require_selfie ?? true
  );
  const [savingSettings, setSavingSettings] = useState(false);

  /* ------------------------------------------------------------
     CARD STATUS (LIVE POLLING FROM trivia_cards)
  ------------------------------------------------------------ */
  const [cardStatus, setCardStatus] = useState<string>(trivia.status);
  const [cardCountdownActive, setCardCountdownActive] = useState<boolean>(
    !!trivia.countdown_active
  );

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

  // ✅ track last session trigger so we only refresh when a question advances
  const lastQuestionStartedAtRef = useRef<string | null>(null);
  const lastCurrentQuestionRef = useRef<number | null>(null);

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
    setPlayMode(trivia?.play_mode || "auto");
    setScoringMode(trivia?.scoring_mode || "100s");
    setRequireSelfie(trivia?.require_selfie ?? true);
    setCardStatus(trivia?.status);
    setCardCountdownActive(!!trivia?.countdown_active);
  }, [
    trivia?.id,
    trivia?.timer_seconds,
    trivia?.play_mode,
    trivia?.scoring_mode,
    trivia?.require_selfie,
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
        .select("status, countdown_active")
        .eq("id", trivia.id)
        .maybeSingle();

      if (error || !data) {
        if (error) console.error("❌ trivia_cards status poll error:", error);
        return;
      }

      if (!isMounted) return;
      setCardStatus(data.status);
      setCardCountdownActive(!!data.countdown_active);
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
    play_mode?: string;
    scoring_mode?: string;
    require_selfie?: boolean;
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
      return;
    }

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
     LEADERBOARD LOADER (shared by realtime + fallback poll)
  ------------------------------------------------------------ */
  async function loadLeaderboard(cancelledRef?: { current: boolean }) {
    if (!trivia?.id) return;

    // only show loading if first paint / empty (prevents flicker)
    if (lastLeaderboardRef.current.length === 0) setLeaderboardLoading(true);

    try {
      // 1) Latest session for this trivia card
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

      // 2) Players in that session (include guest_id)
      const { data: players, error: playersErr } = await supabase
        .from("trivia_players")
        .select("id,status,guest_id")
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
      const guestIds = approved.map((p) => p.guest_id).filter(Boolean);

      // 3) Answers → totals
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

      // 4) Guest names map guest_id → "First L."
      const guestNameMap = new Map<string, string>();

      if (guestIds.length > 0) {
        const { data: guests, error: guestsErr } = await supabase
          .from("guest_profiles")
          .select("id,first_name,last_name")
          .in("id", guestIds);

        if (guestsErr) {
          console.warn("⚠️ guest_profiles fetch error:", guestsErr);
        } else {
          for (const g of guests || []) {
            const first = (g.first_name || "").trim();
            const last = (g.last_name || "").trim();
            const lastInitial = last ? `${last[0].toUpperCase()}.` : "";
            const label = `${first}${lastInitial ? " " + lastInitial : ""}`.trim();
            if (g.id && label) guestNameMap.set(g.id, label);
          }
        }
      }

      // 5) Build rows
      const rows: LeaderRow[] = approved.map((p, index) => ({
        playerId: p.id,
        label:
          (p.guest_id && guestNameMap.get(p.guest_id)) || `Player ${index + 1}`,
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
     LEADERBOARD AUTO-REFRESH AFTER EACH QUESTION
     - Realtime: trivia_sessions UPDATE (question_started_at/current_question)
     - Fallback: poll every 4s while tab open
  ------------------------------------------------------------ */
  useEffect(() => {
    if (activeTab !== "leaderboard") return;
    if (!trivia?.id) return;

    const cancelledRef = { current: false };

    // initial load
    loadLeaderboard(cancelledRef);

    // 1) Realtime subscription to trivia_sessions changes for this card
    const channel = supabase
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

          // ✅ refresh leaderboard immediately when question advances
          loadLeaderboard(cancelledRef);
        }
      )
      .subscribe();

    // 2) Fallback poll (covers missed realtime events)
    const pollId = window.setInterval(() => {
      loadLeaderboard(cancelledRef);
    }, 4000);

    return () => {
      cancelledRef.current = true;
      window.clearInterval(pollId);
      supabase.removeChannel(channel);
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
     ▶️ PLAY TRIVIA
 ------------------------------------------------------------ */
  async function handlePlayTrivia() {
    if (cardCountdownActive || cardStatus === "running") return;

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
      })
      .eq("id", trivia.id);

    setCardCountdownActive(true);
    setCardStatus("waiting");

    setTimeout(async () => {
      await supabase
        .from("trivia_cards")
        .update({
          status: "running",
          countdown_active: false,
        })
        .eq("id", trivia.id);

      await supabase
        .from("trivia_sessions")
        .update({ status: "running" })
        .eq("id", session.id);

      setCardCountdownActive(false);
      setCardStatus("running");
    }, 10_000);
  }

  /* ------------------------------------------------------------
     ⏹ STOP TRIVIA
 ------------------------------------------------------------ */
  async function handleStopTrivia() {
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
     PAGINATION DERIVED VALUES
 ------------------------------------------------------------ */
  const totalPages =
    questions.length > 0 ? Math.ceil(questions.length / PAGE_SIZE) : 1;

  const safePage = Math.min(currentPage, totalPages - 1);
  const startIndex = safePage * PAGE_SIZE;
  const visibleQuestions = questions.slice(startIndex, startIndex + PAGE_SIZE);

  const isActiveBorder = cardStatus === "running" || cardCountdownActive;

  return (
    <div
      className={cn(
        "rounded-xl p-5 bg-[#1b2638] shadow-lg",
        "col-span-2 row-span-2 min-h-[420px] w-full",
        isActiveBorder
          ? "border-4 border-lime-400 shadow-[0_0_28px_rgba(190,242,100,0.7)]"
          : "border border-white/10"
      )}
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
                "bg-gray-800",
                "p-3",
                "rounded-lg",
                "flex",
                "flex-col",
                "items-center",
                "justify-center"
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
                "justify-center",
                "text-sm"
              )}
            >
              <span>Moderate Players</span>
              <span className={cn("text-[11px]", "opacity-80", "mt-0.5")}>
                {`(Waiting ${pendingCount} Players)`}
              </span>
            </button>
          </div>
        </Tabs.Content>

        {/* ---------------- QUESTIONS ---------------- */}
        <Tabs.Content value="questions" className={cn("mt-4", "space-y-3")}>
          {/* unchanged */}
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
                className={cn("max-h-80", "overflow-y-auto", "space-y-3", "pr-1")}
              >
                {visibleQuestions.map((q) => {
                  const isActive = !!q.is_active;

                  return (
                    <div
                      key={q.id}
                      className={cn(
                        "border rounded-lg p-4 bg-gray-900/60",
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
          {/* unchanged */}
          <div
            className={cn("flex", "items-center", "justify-between", "gap-4")}
          >
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

          <div
            className={cn("flex", "items-center", "justify-between", "gap-4")}
          >
            <div>
              <p className={cn("text-sm", "font-semibold")}>Game Flow Mode</p>
              <p className={cn("text-xs", "opacity-70")}>
                Auto = questions advance automatically. Manual = host advances
                with the keyboard (space bar).
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
              <option value="auto">Auto (default)</option>
              <option value="manual">Manual (space bar)</option>
            </select>
          </div>

          <div
            className={cn("flex", "items-center", "justify-between", "gap-4")}
          >
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

          <div
            className={cn("flex", "items-center", "justify-between", "gap-4")}
          >
            <div>
              <p className={cn("text-sm", "font-semibold")}>Require Selfie</p>
              <p className={cn("text-xs", "opacity-70")}>
                When enabled, players must upload a selfie and go through
                moderation before appearing on the wall.
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

          {savingSettings && (
            <p className={cn("text-xs", "opacity-70")}>Saving settings…</p>
          )}
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
