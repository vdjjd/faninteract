"use client";

import { cn } from "@/lib/utils";
import * as Tabs from "@radix-ui/react-tabs";
import { supabase } from "@/lib/supabaseClient";
import { useEffect, useState } from "react";

export default function TriviaCard({
  trivia,
  onOpenOptions,
  onDelete,
  onLaunch,
  onOpenModeration, // ✅ moderation callback
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

  // pagination (5 per page)
  const PAGE_SIZE = 5;
  const [currentPage, setCurrentPage] = useState(0);

  /* ------------------------------------------------------------
     TRIVIA SETTINGS STATE (TIMER + MODE + SCORING + SELFIE)
  ------------------------------------------------------------ */
  const [timerSeconds, setTimerSeconds] = useState<number>(
    trivia?.timer_seconds ?? 30
  );
  const [playMode, setPlayMode] = useState<string>(
    trivia?.play_mode || "auto"
  );
  const [scoringMode, setScoringMode] = useState<string>(
    trivia?.scoring_mode || "100s"
  );
  const [requireSelfie, setRequireSelfie] = useState<boolean>(
    trivia?.require_selfie ?? true
  );
  const [savingSettings, setSavingSettings] = useState(false);

  /* ------------------------------------------------------------
     PARTICIPANTS / PENDING COUNTS
  ------------------------------------------------------------ */
  const [participantsCount, setParticipantsCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    // keep local state in sync if parent reloads trivia
    setTimerSeconds(trivia?.timer_seconds ?? 30);
    setPlayMode(trivia?.play_mode || "auto");
    setScoringMode(trivia?.scoring_mode || "100s");
    setRequireSelfie(trivia?.require_selfie ?? true);
  }, [
    trivia?.id,
    trivia?.timer_seconds,
    trivia?.play_mode,
    trivia?.scoring_mode,
    trivia?.require_selfie,
  ]);

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

      if (error) {
        console.error("❌ Update trivia settings error:", error);
      }
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

    if (error) {
      console.error("❌ Load questions error:", error);
    }

    if (!error && data) {
      setQuestions(data);
      setCurrentPage(0); // reset to first page
    }

    setLoadingQuestions(false);
  }

  /* ------------------------------------------------------------
     PARTICIPANTS / PENDING COUNTS FOR LATEST NON-FINISHED SESSION
  ------------------------------------------------------------ */
  async function loadCounts() {
    // latest session that is NOT finished (waiting or running)
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
    loadCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trivia.id]);

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
     - Reuse latest non-finished session (waiting/running)
     - Require at least one APPROVED player
     - Do NOT create a new session here (prevents ghost sessions)
  ------------------------------------------------------------ */
  async function handlePlayTrivia() {
    if (trivia.countdown_active || trivia.status === "running") return;

    // 1️⃣ Find latest non-finished session for this card
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

    // 2️⃣ Check for at least one APPROVED player in this session
    const { data: players, error: playersErr } = await supabase
      .from("trivia_players")
      .select("id,status")
      .eq("session_id", session.id);

    if (playersErr) {
      console.error("❌ trivia_players check error:", playersErr);
    }

    const hasApproved =
      (players || []).some((p) => p.status === "approved") || false;

    if (!hasApproved) {
      alert(
        "You must approve at least one player before starting the game."
      );
      return;
    }

    const nowIso = new Date().toISOString();

    // 3️⃣ Start countdown on the card (wall sees this and shows timer)
    await supabase
      .from("trivia_cards")
      .update({
        countdown_active: true,
        countdown_started_at: nowIso,
        status: "waiting", // intermediate state during countdown
      })
      .eq("id", trivia.id);

    // 4️⃣ After 10s → mark card as running + mark THIS session as running
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
    }, 10_000);
  }

  /* ------------------------------------------------------------
     ⏹ STOP TRIVIA
     - Put card back to finished → wall shows inactive QR page
     - Mark any non-finished sessions for this card as finished
       (so next join creates a fresh session)
  ------------------------------------------------------------ */
  async function handleStopTrivia() {
    // Card goes to finished → inactive wall
    await supabase
      .from("trivia_cards")
      .update({
        status: "finished",
        countdown_active: false,
      })
      .eq("id", trivia.id);

    // Any waiting/running session for this card is now finished
    await supabase
      .from("trivia_sessions")
      .update({ status: "finished" })
      .eq("trivia_card_id", trivia.id)
      .neq("status", "finished");
  }

  /* ------------------------------------------------------------
     PAGINATION DERIVED VALUES
  ------------------------------------------------------------ */
  const totalPages =
    questions.length > 0 ? Math.ceil(questions.length / PAGE_SIZE) : 1;

  const safePage = Math.min(currentPage, totalPages - 1);
  const startIndex = safePage * PAGE_SIZE;
  const visibleQuestions = questions.slice(
    startIndex,
    startIndex + PAGE_SIZE
  );

  return (
    <div
      className={cn(
        "rounded-xl p-5 bg-[#1b2638] border shadow-lg",
        "col-span-2 row-span-2 min-h-[420px] w-full",
        // ✅ Green border when trivia is running or counting down
        trivia.status === "running" || trivia.countdown_active
          ? "border-lime-400"
          : "border-white/10"
      )}
    >
      <Tabs.Root defaultValue="menu">
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
            </div>
            <div className="text-right">
              <p className={cn("text-sm", "opacity-70")}>Topic</p>
              <p className="font-semibold">
                {trivia.topic_prompt || "—"}
              </p>
            </div>
          </div>

          {/* 👉 Controls grid */}
          <div className={cn("grid", "grid-cols-3", "gap-3", "mt-4")}>
            {/* Row 1 */}
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
              <p className={cn("text-lg", "font-bold")}>
                {participantsCount}
              </p>
            </div>

            {/* Row 2 */}

            {/* Col 1: Play / Stop stack (unchanged) */}
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

            {/* Col 2: ghost spacer (Play height) + Delete aligned with Stop */}
            <div className={cn("flex", "flex-col", "gap-2")}>
              {/* Invisible spacer to match Play height */}
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

            {/* Col 3: Moderate Players */}
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
              <span
                className={cn("text-[11px]", "opacity-80", "mt-0.5")}
              >
                {`(Waiting ${pendingCount} Players)`}
              </span>
            </button>
          </div>
        </Tabs.Content>

        {/* ---------------- QUESTIONS ---------------- */}
        <Tabs.Content
          value="questions"
          className={cn("mt-4", "space-y-3")}
        >
          {/* Top bar inside Questions tab */}
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

          {loadingQuestions && (
            <p className="opacity-70">Loading questions…</p>
          )}

          {!loadingQuestions && questions.length === 0 && (
            <p className={cn("opacity-70", "italic")}>
              No questions found.
            </p>
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
                  // Default: NOT in game unless explicitly true
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
                              isActive
                                ? "text-green-300/80"
                                : "text-red-300/80"
                            )}
                          >
                            {isActive
                              ? "Included in game"
                              : "Not in game"}
                          </p>
                        </div>

                        {/* + / - controls */}
                        <div className={cn("flex", "flex-col", "gap-1")}>
                          <button
                            type="button"
                            onClick={() =>
                              handleSetQuestionActive(q.id, true)
                            }
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
                            onClick={() =>
                              handleSetQuestionActive(q.id, false)
                            }
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

                      <ul
                        className={cn(
                          "grid",
                          "grid-cols-2",
                          "gap-2"
                        )}
                      >
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
                    onClick={() =>
                      setCurrentPage((p) => Math.max(0, p - 1))
                    }
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
                      setCurrentPage((p) =>
                        Math.min(totalPages - 1, p + 1)
                      )
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
        <Tabs.Content value="leaderboard" className="mt-4" />

        {/* ---------------- SETTINGS ---------------- */}
        <Tabs.Content
          value="settings"
          className={cn("mt-4", "space-y-4")}
        >
          {/* TIMER LENGTH */}
          <div
            className={cn(
              "flex",
              "items-center",
              "justify-between",
              "gap-4"
            )}
          >
            <div>
              <p className={cn("text-sm", "font-semibold")}>
                Question Timer
              </p>
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

          {/* GAME FLOW MODE */}
          <div
            className={cn(
              "flex",
              "items-center",
              "justify-between",
              "gap-4"
            )}
          >
            <div>
              <p className={cn("text-sm", "font-semibold")}>
                Game Flow Mode
              </p>
              <p className={cn("text-xs", "opacity-70")}>
                Auto = questions advance automatically. Manual = host
                advances with the keyboard (space bar).
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

          {/* SCORING MODE */}
          <div
            className={cn(
              "flex",
              "items-center",
              "justify-between",
              "gap-4"
            )}
          >
            <div>
              <p className={cn("text-sm", "font-semibold")}>
                Scoring Mode
              </p>
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
              <option value="10000s">
                10000s (max 10,000 pts / Q)
              </option>
            </select>
          </div>

          {/* REQUIRE SELFIE */}
          <div
            className={cn(
              "flex",
              "items-center",
              "justify-between",
              "gap-4"
            )}
          >
            <div>
              <p className={cn("text-sm", "font-semibold")}>
                Require Selfie
              </p>
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
            <p className={cn("text-xs", "opacity-70")}>
              Saving settings…
            </p>
          )}
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

/* Keeping this helper in case something else uses it */
function QuestionsList({ triviaId }: { triviaId: string }) {
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("trivia_questions")
        .select(
          "id, round_number, question_text, options, correct_index, is_active"
        )
        .eq("trivia_card_id", triviaId)
        .order("round_number", { ascending: true });

      if (error) {
        console.error("❌ Questions fetch error:", error);
      } else {
        setQuestions(data ?? []);
      }

      setLoading(false);
    }

    load();
  }, [triviaId]);

  if (loading) return <p className="opacity-60">Loading questions…</p>;

  if (questions.length === 0) {
    return (
      <p className={cn("italic", "opacity-60")}>
        No questions generated yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {questions.map((q, i) => (
        <div
          key={q.id}
          className={cn(
            "p-4",
            "rounded-lg",
            "bg-black/20",
            "border",
            "border-white/10"
          )}
        >
          <p className="font-semibold">
            Q{i + 1} (Round {q.round_number})
          </p>

          <p className="mt-1">{q.question_text}</p>

          <ul className={cn("mt-2", "space-y-1", "text-sm")}>
            {q.options.map((opt: string, idx: number) => (
              <li
                key={idx}
                className={
                  idx === q.correct_index
                    ? "text-green-400 font-semibold"
                    : "opacity-80"
                }
              >
                {String.fromCharCode(65 + idx)}. {opt}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
