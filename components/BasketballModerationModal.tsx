"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";
import { useRealtimeChannel } from "@/providers/SupabaseRealtimeProvider";

/* ------------------------------------------------------ */
/* TYPES */
/* ------------------------------------------------------ */
interface GameEntry {
  id: string;
  game_id: string;
  guest_profile_id: string;
  status: "pending" | "approved" | "rejected";
  photo_url?: string;
  first_name?: string;
  last_name?: string;
  created_at: string;

  guest_profiles: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
  };
}

export default function BasketballModerationModal({
  gameId,
  onClose,
}: {
  gameId: string;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<GameEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ text: string; color: string } | null>(
    null
  );
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  const rt = useRealtimeChannel(); // <-- no `.current`

  /* Toast helper */
  function showToast(text: string, color = "#00ff88") {
    setToast({ text, color });
    setTimeout(() => setToast(null), 2400);
  }

  /* Load entries */
  async function loadEntries() {
    const { data, error } = await supabase
      .from("bb_game_entries")
      .select("*, guest_profiles(*)")
      .eq("game_id", gameId)
      .order("created_at", { ascending: false });

    if (!error && data) setEntries(data);
    setLoading(false);
  }

  /* Find next available lane */
  async function getAvailableLane() {
    const { data } = await supabase
      .from("bb_game_players")
      .select("lane_index")
      .eq("game_id", gameId);

    const used = new Set(data?.map((p) => p.lane_index));
    for (let i = 0; i < 10; i++) if (!used.has(i)) return i;
    return null;
  }

  /* APPROVE ENTRY */
  async function handleApprove(entryId: string) {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;

    const lane = await getAvailableLane();
    if (lane === null) {
      showToast("❌ All 10 lanes are full!", "#ff4444");
      return;
    }

    await supabase.from("bb_game_players").insert([
      {
        game_id: gameId,
        guest_profile_id: entry.guest_profile_id,
        display_name: `${entry.first_name} ${entry.last_name}`,
        selfie_url: entry.photo_url,
        lane_index: lane,
      },
    ]);

    await supabase
      .from("bb_game_entries")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
      })
      .eq("id", entryId);

    // 🔥 send broadcast (correct API)
    rt.broadcast("basketball_entry_approved", {
      guest_profile_id: entry.guest_profile_id,
      lane_index: lane,
      game_id: gameId,
    });

    setEntries((prev) =>
      prev.map((e) => (e.id === entryId ? { ...e, status: "approved" } : e))
    );

    showToast("✅ Approved");
  }

  /* REJECT ENTRY */
  async function handleReject(entryId: string) {
    await supabase
      .from("bb_game_entries")
      .update({
        status: "rejected",
        rejected_at: new Date().toISOString(),
      })
      .eq("id", entryId);

    rt.broadcast("basketball_entry_rejected", {
      entryId,
      game_id: gameId,
    });

    setEntries((prev) =>
      prev.map((e) => (e.id === entryId ? { ...e, status: "rejected" } : e))
    );

    showToast("🚫 Rejected", "#ff4444");
  }

  /* DELETE ENTRY */
  async function handleDelete(entryId: string) {
    await supabase.from("bb_game_entries").delete().eq("id", entryId);

    rt.broadcast("basketball_entry_deleted", {
      entryId,
      game_id: gameId,
    });

    setEntries((prev) => prev.filter((e) => e.id !== entryId));
    showToast("🗑 Deleted", "#bbb");
  }

  /* REALTIME SYNC */
  useEffect(() => {
    loadEntries();

    const channel = supabase
      .channel(`bb_mod_${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bb_game_entries",
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setEntries((prev) => [payload.new as GameEntry, ...prev]);
          }
          if (payload.eventType === "UPDATE") {
            setEntries((prev) =>
              prev.map((e) =>
                e.id === payload.new.id ? (payload.new as GameEntry) : e
              )
            );
          }
          if (payload.eventType === "DELETE") {
            setEntries((prev) =>
              prev.filter((e) => e.id !== payload.old.id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  /* FILTERS */
  const pending = entries.filter((e) => e.status === "pending");
  const approved = entries.filter((e) => e.status === "approved");
  const rejected = entries.filter((e) => e.status === "rejected");

  /* ------------------------------------------------------ */
  /* UI */
  /* ------------------------------------------------------ */
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
          "shadow-[0_0_40px_rgba(255,140,0,0.45)]"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className={cn('absolute', 'top-3', 'right-3', 'text-white/70', 'hover:text-white', 'text-xl')}
        >
          ✕
        </button>

        <h1 className={cn('text-center', 'text-2xl', 'font-bold', 'mb-4')}>
          Basketball Player Moderation
        </h1>

        <Stats
          pending={pending.length}
          approved={approved.length}
          rejected={rejected.length}
        />

        {loading ? (
          <p className="text-center">Loading…</p>
        ) : (
          <>
            <EntrySection
              title="Pending"
              color="#ffd966"
              entries={pending}
              onApprove={handleApprove}
              onReject={handleReject}
              onImageClick={setSelectedPhoto}
            />

            <EntrySection
              title="Approved"
              color="#00ff88"
              entries={approved}
              showDelete
              onDelete={handleDelete}
              onImageClick={setSelectedPhoto}
            />

            <EntrySection
              title="Rejected"
              color="#ff4444"
              entries={rejected}
              showDelete
              onDelete={handleDelete}
              onImageClick={setSelectedPhoto}
            />
          </>
        )}

        {toast && (
          <div
            className={cn('fixed', 'bottom-5', 'left-1/2', '-translate-x-1/2', 'px-4', 'py-2', 'rounded-lg', 'font-semibold')}
            style={{ background: toast.color }}
          >
            {toast.text}
          </div>
        )}

        {selectedPhoto && (
          <div
            className={cn('fixed', 'inset-0', 'bg-black/70', 'flex', 'items-center', 'justify-center', 'z-[9999]')}
            onClick={() => setSelectedPhoto(null)}
          >
            <img
              src={selectedPhoto}
              className={cn('max-w-[90vw]', 'max-h-[90vh]', 'rounded-xl', 'shadow-xl')}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------ */
/* Stats Component */
function Stats({ pending, approved, rejected }) {
  return (
    <div className={cn('flex', 'justify-center', 'gap-8', 'text-sm', 'mb-4', 'opacity-90')}>
      <span>🕓 {pending} Pending</span>
      <span>✅ {approved} Approved</span>
      <span>🚫 {rejected} Rejected</span>
    </div>
  );
}

/* ------------------------------------------------------ */
/* Entry Section Component */
function EntrySection({
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
  entries: GameEntry[];
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onDelete?: (id: string) => void;
  showDelete?: boolean;
  onImageClick: (url: string) => void;
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
        <p className={cn('text-gray-400', 'mb-4')}>None</p>
      ) : (
        <div className={cn('grid', 'gap-2', 'grid-cols-[repeat(auto-fill,minmax(240px,1fr))]', 'mb-6')}>
          {entries.map((e) => (
            <div
              key={e.id}
              className={cn('flex', 'bg-[#0b0f19]', 'rounded-lg', 'overflow-hidden', 'border', 'border-[#333]', 'h-[120px]')}
            >
              <div
                className={cn('flex-none', 'w-[45%]', 'cursor-pointer')}
                onClick={() => e.photo_url && onImageClick(e.photo_url)}
              >
                {e.photo_url ? (
                  <img
                    src={e.photo_url}
                    className={cn('w-full', 'h-full', 'object-cover')}
                  />
                ) : (
                  <div className={cn('w-full', 'h-full', 'flex', 'items-center', 'justify-center', 'bg-[#222]', 'text-gray-500')}>
                    No Img
                  </div>
                )}
              </div>

              <div className={cn('flex', 'flex-col', 'justify-between', 'p-2', 'w-full')}>
                <div>
                  <strong className="text-xs">
                    {(e.first_name || "") + " " + (e.last_name || "")}
                  </strong>
                </div>

                {!showDelete ? (
                  <div className={cn('flex', 'gap-1', 'text-xs')}>
                    <button
                      onClick={() => onApprove?.(e.id)}
                      className={cn('flex-1', 'bg-green-600', 'text-white', 'rounded', 'px-1', 'py-[2px]')}
                    >
                      ✅
                    </button>
                    <button
                      onClick={() => onReject?.(e.id)}
                      className={cn('flex-1', 'bg-red-600', 'text-white', 'rounded', 'px-1', 'py-[2px]')}
                    >
                      🚫
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => onDelete?.(e.id)}
                    className={cn('w-full', 'bg-[#444]', 'text-white', 'rounded', 'px-1', 'py-[2px]', 'text-xs')}
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
