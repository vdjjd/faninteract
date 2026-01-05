"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";
import { useRealtimeChannel } from "@/providers/SupabaseRealtimeProvider";

/* --------------------------------------------------------- */
/* CONFIG                                                    */
/* --------------------------------------------------------- */
// This table must contain: id (uuid) and auto_approve_enabled (boolean)
// Based on your query: trivia_sessions.trivia_card_id = triviaId
// ...the parent is most likely "trivia_cards"
const PARENT_TABLE = "trivia_cards";

/* --------------------------------------------------------- */
/* TYPES                                                     */
/* --------------------------------------------------------- */

interface TriviaPlayerEntry {
  id: string;
  session_id: string;
  guest_id: string | null;
  status: "pending" | "approved" | "rejected";
  joined_at: string;
  photo_url?: string | null;
  display_name: string;

  guest_profiles: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
  };
}

/* --------------------------------------------------------- */
/* MAIN MODAL                                                */
/* --------------------------------------------------------- */

export default function TriviaModerationModal({
  triviaId,
  onClose,
}: {
  triviaId: string;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<TriviaPlayerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ text: string; color: string } | null>(
    null
  );
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  // ✅ Track current session (waiting OR running)
  const [sessionId, setSessionId] = useState<string | null>(null);

  // ✅ Auto-approve toggle (UI lives here on this modal)
  const [autoApprove, setAutoApprove] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingToggleValue, setPendingToggleValue] = useState(false);

  const rt = useRealtimeChannel();

  function showToast(text: string, color = "#00ff88") {
    setToast({ text, color });
    setTimeout(() => setToast(null), 2400);
  }

  /* --------------------------------------------------------- */
  /* LOAD AUTO APPROVE SETTING                                 */
  /* --------------------------------------------------------- */
  async function loadModerationSetting() {
    const { data, error } = await supabase
      .from(PARENT_TABLE)
      .select("auto_approve_enabled")
      .eq("id", triviaId)
      .single();

    if (error) {
      console.error("❌ auto_approve_enabled fetch error:", error);
      return;
    }

    setAutoApprove(Boolean((data as any)?.auto_approve_enabled));
  }

  /* --------------------------------------------------------- */
  /* SAVE AUTO APPROVE + BULK APPROVE CURRENT SESSION           */
  /* --------------------------------------------------------- */
  async function saveAutoApprove(next: boolean) {
    setAutoApprove(next);

    const { error: updErr } = await supabase
      .from(PARENT_TABLE)
      .update({ auto_approve_enabled: next })
      .eq("id", triviaId);

    if (updErr) {
      console.error("❌ auto_approve_enabled update error:", updErr);
      showToast("❌ Failed to save setting", "#ff4444");
      return;
    }

    // Turning OFF: done
    if (!next) {
      showToast("Auto-Approve disabled", "#bbb");
      return;
    }

    // Turning ON: approve any currently pending players in THIS session (if it exists)
    if (!sessionId) {
      showToast("✅ Auto-Approve enabled");
      return;
    }

    const { data: pendingPlayers, error: pendErr } = await supabase
      .from("trivia_players")
      .select("id")
      .eq("session_id", sessionId)
      .eq("status", "pending");

    if (pendErr) {
      console.error("❌ pending players fetch error:", pendErr);
      showToast("❌ Could not auto-approve pending", "#ff4444");
      return;
    }

    if (pendingPlayers?.length) {
      const { error: bulkErr } = await supabase
        .from("trivia_players")
        .update({ status: "approved" })
        .eq("session_id", sessionId)
        .eq("status", "pending");

      if (bulkErr) {
        console.error("❌ bulk approve error:", bulkErr);
        showToast("❌ Bulk approve failed", "#ff4444");
        return;
      }

      pendingPlayers.forEach((p) => {
        rt?.broadcast("trivia_player_updated", {
          id: (p as any).id,
          status: "approved",
          triviaId,
        });
      });

      setEntries((prev) =>
        prev.map((x) =>
          x.status === "pending" ? { ...x, status: "approved" } : x
        )
      );

      showToast(`✅ Auto-approved ${pendingPlayers.length} players`);
    } else {
      showToast("✅ Auto-Approve enabled");
    }
  }

  /* --------------------------------------------------------- */
  /* Load latest session + players (no dependence on Play)     */
  /* --------------------------------------------------------- */
  async function loadAll() {
    setLoading(true);

    // 1️⃣ Find the MOST RECENT session for this trivia card (any status)
    const { data: session, error: sessionErr } = await supabase
      .from("trivia_sessions")
      .select("id,status,created_at")
      .eq("trivia_card_id", triviaId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sessionErr) {
      console.error("❌ trivia_sessions fetch error:", sessionErr);
      setSessionId(null);
      setEntries([]);
      setLoading(false);
      return;
    }

    if (!session) {
      // No one has joined yet → no session
      setSessionId(null);
      setEntries([]);
      setLoading(false);
      return;
    }

    setSessionId(session.id);

    // 2️⃣ Load players for this session (pending / approved / rejected)
    const { data, error } = await supabase
      .from("trivia_players")
      .select("*, guest_profiles(*)")
      .eq("session_id", session.id)
      .order("joined_at", { ascending: false });

    if (!error && data) {
      setEntries(data as any);
    } else if (error) {
      console.error("❌ trivia_players fetch error:", error);
    }

    setLoading(false);
  }

  /* --------------------------------------------------------- */
  /* Approve / Reject / Delete                                 */
  /* --------------------------------------------------------- */

  async function handleApprove(id: string) {
    await supabase
      .from("trivia_players")
      .update({ status: "approved" })
      .eq("id", id);

    setEntries((e) =>
      e.map((x) => (x.id === id ? { ...x, status: "approved" } : x))
    );

    rt?.broadcast("trivia_player_updated", {
      id,
      status: "approved",
      triviaId,
    });

    showToast("✅ Approved");
  }

  async function handleReject(id: string) {
    await supabase
      .from("trivia_players")
      .update({ status: "rejected" })
      .eq("id", id);

    setEntries((e) =>
      e.map((x) => (x.id === id ? { ...x, status: "rejected" } : x))
    );

    rt?.broadcast("trivia_player_updated", {
      id,
      status: "rejected",
      triviaId,
    });

    showToast("🚫 Rejected", "#ff4444");
  }

  async function handleDelete(id: string) {
    await supabase.from("trivia_players").delete().eq("id", id);

    setEntries((e) => e.filter((x) => x.id !== id));

    rt?.broadcast("trivia_player_deleted", {
      id,
      triviaId,
    });

    showToast("🗑 Deleted", "#bbb");
  }

  /* --------------------------------------------------------- */
  /* Initial load                                              */
  /* --------------------------------------------------------- */
  useEffect(() => {
    loadModerationSetting();
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triviaId]);

  /* --------------------------------------------------------- */
  /* Realtime sync for that session (+ auto-approve on INSERT) */
  /* --------------------------------------------------------- */
  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`trivia_mod_${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "trivia_players",
          filter: `session_id=eq.${sessionId}`,
        },
        async (payload) => {
          if (payload.eventType === "INSERT") {
            const n = payload.new as any;

            // ✅ Auto-approve brand-new joins while toggle is ON
            if (autoApprove && n.status === "pending") {
              const { error } = await supabase
                .from("trivia_players")
                .update({ status: "approved" })
                .eq("id", n.id);

              if (!error) {
                rt?.broadcast("trivia_player_updated", {
                  id: n.id,
                  status: "approved",
                  triviaId,
                });

                n.status = "approved";
              }
            }

            setEntries((e) => [n, ...e]);
          }

          if (payload.eventType === "UPDATE") {
            setEntries((e) =>
              e.map((x) =>
                x.id === (payload.new as any).id ? (payload.new as any) : x
              )
            );
          }

          if (payload.eventType === "DELETE") {
            setEntries((e) => e.filter((x) => x.id !== (payload.old as any).id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, autoApprove, triviaId, rt]);

  const pending = entries.filter((x) => x.status === "pending");
  const approved = entries.filter((x) => x.status === "approved");
  const rejected = entries.filter((x) => x.status === "rejected");

  return (
    <div
      className={cn(
        "fixed inset-0 bg-black/70 backdrop-blur-md z-[9999] flex items-center justify-center"
      )}
      onClick={onClose}
    >
      <div
        className={cn(
          "relative w-[95vw] max-w-[1100px] max-h-[90vh] overflow-y-auto rounded-2xl",
          "bg-gradient-to-br from-[#0b0f1a]/95 to-[#111827]/95 p-6",
          "shadow-[0_0_40px_rgba(0,140,255,0.45)]"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className={cn(
            "absolute top-3 right-3 text-white/70 hover:text-white text-xl"
          )}
        >
          ✕
        </button>

        {/* HEADER ROW (toggle left, title center) */}
        <div className={cn("flex items-center justify-center mb-4 relative")}>
          {/* AUTO APPROVE TOGGLE */}
          <div className={cn("absolute left-0 flex items-center gap-2")}>
            <div
              onClick={() => {
                const next = !autoApprove;

                if (next) {
                  setPendingToggleValue(true);
                  setShowConfirm(true);
                  return;
                }
                saveAutoApprove(false);
              }}
              className={cn(
                "relative w-14 h-7 rounded-full cursor-pointer transition-all",
                pendingToggleValue || autoApprove ? "bg-green-500" : "bg-gray-600"
              )}
            >
              <span
                className={cn(
                  "absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-all",
                  pendingToggleValue || autoApprove ? "translate-x-7" : ""
                )}
              />
            </div>

            <span className={cn("text-sm text-gray-300")}>Auto-Approve</span>
          </div>

          <h1 className={cn("text-center text-2xl font-bold")}>
            Trivia Selfie Moderation
          </h1>
        </div>

        <Stats
          pending={pending.length}
          approved={approved.length}
          rejected={rejected.length}
        />

        {loading ? (
          <p className="text-center">Loading…</p>
        ) : !sessionId ? (
          <p className={cn("text-center", "text-gray-300")}>
            No players have joined this trivia yet.
          </p>
        ) : (
          <>
            <Section
              title="Pending"
              color="#ffd966"
              entries={pending}
              onApprove={handleApprove}
              onReject={handleReject}
              onImageClick={setSelectedPhoto}
            />

            <Section
              title="Approved"
              color="#00ff88"
              entries={approved}
              showDelete
              onDelete={handleDelete}
              onImageClick={setSelectedPhoto}
            />

            <Section
              title="Rejected"
              color="#ff4444"
              entries={rejected}
              showDelete
              onDelete={handleDelete}
              onImageClick={setSelectedPhoto}
            />
          </>
        )}

        {/* Toast */}
        {toast && (
          <div
            className={cn(
              "fixed bottom-5 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg font-semibold"
            )}
            style={{ background: toast.color }}
          >
            {toast.text}
          </div>
        )}

        {/* Photo Preview */}
        {selectedPhoto && (
          <div
            className={cn(
              "fixed inset-0 bg-black/70 flex items-center justify-center z-[10000]"
            )}
            onClick={() => setSelectedPhoto(null)}
          >
            <img
              src={selectedPhoto}
              className={cn(
                "max-w-[90vw]",
                "max-h-[90vh]",
                "rounded-xl",
                "shadow-xl"
              )}
            />
          </div>
        )}

        {/* CONFIRM ENABLE AUTO APPROVE */}
        {showConfirm && (
          <div
            className={cn(
              "fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[99999]"
            )}
          >
            <div
              className={cn(
                "bg-[#0d1625] border border-red-600/40 p-6 rounded-2xl shadow-xl w-[90%] max-w-md text-center"
              )}
            >
              <h2 className={cn("text-xl font-bold text-red-400 mb-3")}>
                Enable Auto-Approve?
              </h2>

              <p className={cn("text-sm text-gray-300 mb-6 leading-relaxed")}>
                All new players will be instantly approved.
                <br />
                <br />
                <span className={cn("text-red-300 font-semibold")}>
                  Inappropriate photos may appear without warning.
                </span>
              </p>

              <div className={cn("flex justify-center gap-4")}>
                <button
                  onClick={() => {
                    setShowConfirm(false);
                    setPendingToggleValue(false);
                    saveAutoApprove(true);
                  }}
                  className={cn(
                    "px-6 py-2 rounded-xl bg-green-500 text-black font-semibold shadow hover:bg-green-400"
                  )}
                >
                  Yes, Enable
                </button>

                <button
                  onClick={() => {
                    setShowConfirm(false);
                    setPendingToggleValue(false);
                    setAutoApprove(false);
                  }}
                  className={cn(
                    "px-6 py-2 rounded-xl bg-gray-600 text-white font-semibold shadow hover:bg-gray-500"
                  )}
                >
                  No
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------- */
/* Stats strip                                               */
/* --------------------------------------------------------- */
function Stats({
  pending,
  approved,
  rejected,
}: {
  pending: number;
  approved: number;
  rejected: number;
}) {
  return (
    <div
      className={cn(
        "flex",
        "justify-center",
        "gap-8",
        "text-sm",
        "mb-4",
        "opacity-90"
      )}
    >
      <span>🕓 {pending} Pending</span>
      <span>✅ {approved} Approved</span>
      <span>🚫 {rejected} Rejected</span>
    </div>
  );
}

/* --------------------------------------------------------- */
/* Section grid                                              */
/* --------------------------------------------------------- */
function Section({
  title,
  color,
  entries,
  onApprove,
  onReject,
  onDelete,
  showDelete,
  onImageClick,
}: {
  title: string;
  color: string;
  entries: TriviaPlayerEntry[];
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onDelete?: (id: string) => void;
  showDelete?: boolean;
  onImageClick: (src: string) => void;
}) {
  return (
    <>
      <h2
        style={{
          marginBottom: 6,
          borderLeft: `4px solid ${color}`,
          paddingLeft: 8,
        }}
      >
        {title} ({entries.length})
      </h2>

      {entries.length === 0 ? (
        <p className={cn("text-gray-400", "mb-4")}>None</p>
      ) : (
        <div
          className={cn(
            "grid",
            "gap-2",
            "grid-cols-[repeat(auto-fill,minmax(240px,1fr))]",
            "mb-6"
          )}
        >
          {entries.map((e) => (
            <div
              key={e.id}
              className={cn(
                "flex",
                "bg-[#0b0f19]",
                "rounded-lg",
                "overflow-hidden",
                "border",
                "border-[#333]",
                "h-[120px]"
              )}
            >
              {/* Photo */}
              <div
                className={cn("w-[45%]", "cursor-pointer")}
                onClick={() => e.photo_url && onImageClick(e.photo_url)}
              >
                {e.photo_url ? (
                  <img
                    src={e.photo_url}
                    className={cn("w-full", "h-full", "object-cover")}
                  />
                ) : (
                  <div
                    className={cn(
                      "w-full",
                      "h-full",
                      "flex",
                      "items-center",
                      "justify-center",
                      "bg-[#222]",
                      "text-gray-500"
                    )}
                  >
                    No Img
                  </div>
                )}
              </div>

              {/* Details */}
              <div
                className={cn(
                  "flex",
                  "flex-col",
                  "justify-between",
                  "p-2",
                  "w-full"
                )}
              >
                <div>
                  <strong className="text-xs">
                    {e.display_name ||
                      `${e.guest_profiles?.first_name || ""} ${
                        e.guest_profiles?.last_name || ""
                      }`.trim()}
                  </strong>

                  <p className={cn("text-[11px]", "text-gray-300")}>
                    {e.guest_profiles?.email || "no email"}
                  </p>
                </div>

                {/* APPROVE / REJECT or DELETE */}
                {!showDelete ? (
                  <div className={cn("flex", "gap-1", "text-xs")}>
                    {onApprove && (
                      <button
                        onClick={() => onApprove(e.id)}
                        className={cn(
                          "flex-1",
                          "bg-green-600",
                          "text-white",
                          "rounded",
                          "px-1",
                          "py-[2px]"
                        )}
                      >
                        ✅
                      </button>
                    )}

                    {onReject && (
                      <button
                        onClick={() => onReject(e.id)}
                        className={cn(
                          "flex-1",
                          "bg-red-600",
                          "text-white",
                          "rounded",
                          "px-1",
                          "py-[2px]"
                        )}
                      >
                        🚫
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => onDelete?.(e.id)}
                    className={cn(
                      "w-full",
                      "bg-[#444]",
                      "text-white",
                      "rounded",
                      "px-1",
                      "py-[2px]",
                      "text-xs"
                    )}
                  >
                    🗑
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
