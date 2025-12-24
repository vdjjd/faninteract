"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";
import { useRealtimeChannel } from "@/providers/SupabaseRealtimeProvider";

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
  const [sessionId, setSessionId] = useState<string | null>(null);

  const rt = useRealtimeChannel();

  function showToast(text: string, color = "#00ff88") {
    setToast({ text, color });
    setTimeout(() => setToast(null), 2400);
  }

  /* --------------------------------------------------------- */
  /* Load current running session + players                    */
/* --------------------------------------------------------- */
  async function loadAll() {
    setLoading(true);

    // 1️⃣ Find the running session for this trivia card
    const { data: session, error: sessionErr } = await supabase
      .from("trivia_sessions")
      .select("id,status")
      .eq("trivia_card_id", triviaId)
      .eq("status", "running")
      .maybeSingle();

    if (sessionErr) {
      console.error("❌ trivia_sessions fetch error:", sessionErr);
      setLoading(false);
      return;
    }

    if (!session) {
      setSessionId(null);
      setEntries([]);
      setLoading(false);
      return;
    }

    setSessionId(session.id);

    // 2️⃣ Load players for this session
    const { data, error } = await supabase
      .from("trivia_players")
      .select("*, guest_profiles(*)")
      .eq("session_id", session.id)
      .order("joined_at", { ascending: false });

    if (!error && data) {
      setEntries(data as any);
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
  /* Realtime sync                                             */
/* --------------------------------------------------------- */
  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triviaId]);

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
        (payload) => {
          if (payload.eventType === "INSERT") {
            setEntries((e) => [payload.new as any, ...e]);
          }

          if (payload.eventType === "UPDATE") {
            setEntries((e) =>
              e.map((x) =>
                x.id === payload.new.id ? (payload.new as any) : x
              )
            );
          }

          if (payload.eventType === "DELETE") {
            setEntries((e) =>
              e.filter((x) => x.id !== payload.old.id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

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
            "absolute",
            "top-3",
            "right-3",
            "text-white/70",
            "hover:text-white",
            "text-xl"
          )}
        >
          ✕
        </button>

        {/* Header */}
        <h1
          className={cn(
            "text-center",
            "text-2xl",
            "font-bold",
            "mb-4"
          )}
        >
          Trivia Selfie Moderation
        </h1>

        <Stats
          pending={pending.length}
          approved={approved.length}
          rejected={rejected.length}
        />

        {loading ? (
          <p className="text-center">Loading…</p>
        ) : !sessionId ? (
          <p className={cn('text-center', 'text-gray-300')}>
            No running trivia session found for this game.
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
                onClick={() =>
                  e.photo_url && onImageClick(e.photo_url)
                }
              >
                {e.photo_url ? (
                  <img
                    src={e.photo_url}
                    className={cn(
                      "w-full",
                      "h-full",
                      "object-cover"
                    )}
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

                  <p
                    className={cn(
                      "text-[11px]",
                      "text-gray-300"
                    )}
                  >
                    {e.guest_profiles?.email || "no email"}
                  </p>
                </div>

                {/* APPROVE / REJECT */}
                {!showDelete ? (
                  <div
                    className={cn(
                      "flex",
                      "gap-1",
                      "text-xs"
                    )}
                  >
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
