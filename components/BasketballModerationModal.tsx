"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";

/* ============================================================
   TYPES
============================================================ */
interface Entry {
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

interface Player {
  id: string;
  game_id: string;
  guest_profile_id: string;
  display_name: string | null;
  selfie_url: string | null;
  lane_index: number;
  score: number | null;
  disconnected_at: string | null;
}

/* ============================================================
   MAIN MODAL
============================================================ */
export default function BasketballModerationModal({
  gameId,
  onClose,
}: {
  gameId: string;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; color: string } | null>(
    null
  );

  /* ============================================================
     Toast Helper
  ============================================================ */
  function showToast(text: string, color = "#00ff88") {
    setToast({ text, color });
    setTimeout(() => setToast(null), 2400);
  }

  /* ============================================================
     LOAD ENTRIES
  ============================================================ */
  async function loadEntries() {
    const { data } = await supabase
      .from("bb_game_entries")
      .select("*, guest_profiles(*)")
      .eq("game_id", gameId)
      .order("created_at", { ascending: false });

    setEntries(data || []);
  }

  /* ============================================================
     LOAD ACTIVE + PREVIOUS PLAYERS
  ============================================================ */
  async function loadPlayers() {
    const { data } = await supabase
      .from("bb_game_players")
      .select("*")
      .eq("game_id", gameId)
      .order("lane_index", { ascending: true });

    setPlayers(data || []);
  }

  /* ============================================================
     GET NEXT AVAILABLE LANE
  ============================================================ */
  function getNextLane() {
    const used = new Set(
      players.filter((p) => p.disconnected_at === null).map((p) => p.lane_index)
    );
    for (let i = 0; i < 10; i++) if (!used.has(i)) return i;
    return null;
  }

  /* ============================================================
     APPROVE ENTRY
  ============================================================ */
  async function handleApprove(entryId: string) {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;

    const lane = getNextLane();
    if (lane === null) {
      showToast("❌ All player spots full", "#ff4444");
      return;
    }

    await supabase.from("bb_game_players").insert([
      {
        game_id: gameId,
        guest_profile_id: entry.guest_profile_id,
        display_name: `${entry.first_name} ${entry.last_name}`.trim(),
        selfie_url: entry.photo_url,
        lane_index: lane,
        score: 0,
        disconnected_at: null,
      },
    ]);

    await supabase
      .from("bb_game_entries")
      .update({ status: "approved" })
      .eq("id", entryId);

    showToast("✅ Player Approved");
  }

  /* ============================================================
     REJECT ENTRY
  ============================================================ */
  async function handleReject(entryId: string) {
    await supabase
      .from("bb_game_entries")
      .update({ status: "rejected" })
      .eq("id", entryId);

    showToast("🚫 Rejected", "#ff4444");
  }

  /* ============================================================
     DELETE ENTRY
  ============================================================ */
  async function handleDelete(entryId: string) {
    await supabase.from("bb_game_entries").delete().eq("id", entryId);
    showToast("🗑 Deleted", "#888");
  }

  /* ============================================================
     CLEAR ACTIVE PLAYERS
  ============================================================ */
  async function handleClearActive() {
    const activePlayers = players.filter((p) => p.disconnected_at === null);

    if (activePlayers.length === 0) {
      showToast("No active players to clear.", "#ffaa22");
      return;
    }

    await supabase
      .from("bb_game_players")
      .update({ disconnected_at: new Date().toISOString() })
      .eq("game_id", gameId)
      .is("disconnected_at", null);

    showToast("🔄 Moved to Previously Played");
  }

  /* ============================================================
     RE-ADD PLAYER
  ============================================================ */
  async function handleReAdd(player: Player) {
    const lane = getNextLane();
    if (lane === null) {
      showToast("❌ No open player spots!", "#ff4444");
      return;
    }

    await supabase
      .from("bb_game_players")
      .update({
        disconnected_at: null,
        lane_index: lane,
        score: 0,
      })
      .eq("id", player.id);

    showToast("🔁 Player Re-Added");
  }

  /* ============================================================
     REALTIME UPDATES
  ============================================================ */
  useEffect(() => {
    loadEntries();
    loadPlayers();

    const entriesChannel = supabase
      .channel(`mod_entries_${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bb_game_entries",
          filter: `game_id=eq.${gameId}`,
        },
        loadEntries
      )
      .subscribe();

    const playersChannel = supabase
      .channel(`mod_players_${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bb_game_players",
          filter: `game_id=eq.${gameId}`,
        },
        loadPlayers
      )
      .subscribe();

    return () => {
      supabase.removeChannel(entriesChannel);
      supabase.removeChannel(playersChannel);
    };
  }, [gameId]);

  /* ============================================================
     GROUPINGS
  ============================================================ */
  const pending = entries.filter((e) => e.status === "pending");
  const rejected = entries.filter((e) => e.status === "rejected");

  const active = players.filter((p) => p.disconnected_at === null);
  const previous = players.filter((p) => p.disconnected_at !== null);

  /* ============================================================
     RENDER
  ============================================================ */
  return (
    <div
      className={cn(
        "fixed inset-0 bg-black/70 backdrop-blur-xl z-[9999] flex items-center justify-center"
      )}
      onClick={onClose}
    >
      <div
        className={cn(
          "relative w-[95vw] max-w-[1100px] max-h-[90vh] overflow-y-auto rounded-2xl",
          "bg-[#0b0f19]/95 p-6 shadow-[0_0_40px_rgba(255,140,0,0.45)]"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* CLOSE */}
        <button
          onClick={onClose}
          className={cn(
            "absolute top-3 right-3 text-white/70 hover:text-white text-xl"
          )}
        >
          ✕
        </button>

        <h1 className={cn('text-center', 'text-2xl', 'font-bold', 'mb-6')}>
          Basketball Player Moderation
        </h1>

        {/* CLEAR ACTIVE */}
        <div className={cn('text-right', 'mb-4')}>
          <button
            onClick={handleClearActive}
            className={cn('px-4', 'py-2', 'bg-red-600', 'hover:bg-red-700', 'text-white', 'rounded-lg', 'shadow')}
          >
            Clear Active Players
          </button>
        </div>

        <Section
          title="Pending"
          color="#ffd966"
          items={pending}
          render={(e: Entry) => (
            <EntryCard
              key={e.id}
              entry={e}
              onApprove={() => handleApprove(e.id)}
              onReject={() => handleReject(e.id)}
              onImageClick={setSelectedPhoto}
            />
          )}
        />

        <Section
          title="Active Players"
          color="#00ff99"
          items={active}
          render={(p: Player) => (
            <PlayerCard
              key={p.id}
              player={p}
              active
              onMoveToPending={async () => {
                // REMOVE FROM ACTIVE
                await supabase
                  .from("bb_game_players")
                  .delete()
                  .eq("id", p.id);

                // ADD TO PENDING
                await supabase.from("bb_game_entries").insert([
                  {
                    game_id: gameId,
                    guest_profile_id: p.guest_profile_id,
                    status: "pending",
                    first_name: p.display_name?.split(" ")[0] ?? "",
                    last_name: p.display_name?.split(" ")[1] ?? "",
                    photo_url: p.selfie_url,
                  },
                ]);

                showToast("🔁 Moved to pending");
              }}
              onMoveToPrevious={async () => {
                await supabase
                  .from("bb_game_players")
                  .update({ disconnected_at: new Date().toISOString() })
                  .eq("id", p.id);

                showToast("⏮️ Moved to Previously Played");
              }}
              onImageClick={setSelectedPhoto}
            />
          )}
        />

        <Section
          title="Previously Played"
          color="#66aaff"
          items={previous}
          render={(p: Player) => (
            <PlayerCard
              key={p.id}
              player={p}
              onReAdd={() => handleReAdd(p)}
              onImageClick={setSelectedPhoto}
            />
          )}
        />

        <Section
          title="Rejected"
          color="#ff5555"
          items={rejected}
          render={(e: Entry) => (
            <EntryCard
              key={e.id}
              entry={e}
              rejected
              onDelete={() => handleDelete(e.id)}
              onImageClick={setSelectedPhoto}
            />
          )}
        />

        {selectedPhoto && (
          <div
            className={cn('fixed', 'inset-0', 'bg-black/70', 'flex', 'items-center', 'justify-center', 'z-[99999]')}
            onClick={() => setSelectedPhoto(null)}
          >
            <img
              src={selectedPhoto}
              className={cn('max-w-[90vw]', 'max-h-[90vh]', 'rounded-xl', 'shadow-xl')}
            />
          </div>
        )}

        {toast && (
          <div
            className={cn('fixed', 'bottom-6', 'left-1/2', '-translate-x-1/2', 'px-4', 'py-2', 'rounded-lg', 'text-black', 'font-semibold')}
            style={{ background: toast.color }}
          >
            {toast.text}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   SECTION WRAPPER
============================================================ */
function Section({ title, color, items, render }: any) {
  return (
    <div className="mb-6">
      <h2
        className={cn('text-xl', 'font-semibold', 'mb-2')}
        style={{ borderLeft: `4px solid ${color}`, paddingLeft: 8 }}
      >
        {title} ({items.length})
      </h2>

      {items.length === 0 ? (
        <p className="text-gray-400">None</p>
      ) : (
        <div className={cn('grid', 'gap-3', 'grid-cols-[repeat(auto-fill,minmax(240px,1fr))]')}>
          {items.map((item: any) => (
            <div key={item.id}>{render(item)}</div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   ENTRY CARD
============================================================ */
function EntryCard({
  entry,
  onApprove,
  onReject,
  onDelete,
  rejected,
  onImageClick,
}: any) {
  return (
    <div className={cn('flex', 'bg-[#0f1624]', 'rounded-lg', 'border', 'border-[#333]', 'p-3', 'gap-3', 'items-center')}>
      <img
        src={entry.photo_url || "/placeholder.png"}
        className={cn('w-[70px]', 'h-[70px]', 'rounded-full', 'object-cover', 'border-2', 'border-white/20', 'shadow', 'cursor-pointer')}
        onClick={() => entry.photo_url && onImageClick(entry.photo_url)}
      />

      <div className={cn('flex-1', 'flex', 'flex-col', 'justify-between')}>
        <div className={cn('font-semibold', 'text-sm')}>
          {(entry.first_name || "") + " " + (entry.last_name || "")}
        </div>

        {!rejected ? (
          <div className={cn('flex', 'gap-2', 'text-xs', 'mt-2')}>
            <button
              onClick={onApprove}
              className={cn('flex-1', 'bg-green-600', 'text-white', 'rounded', 'py-1')}
            >
              Approve
            </button>
            <button
              onClick={onReject}
              className={cn('flex-1', 'bg-red-600', 'text-white', 'rounded', 'py-1')}
            >
              Reject
            </button>
          </div>
        ) : (
          <button
            onClick={onDelete}
            className={cn('mt-2', 'w-full', 'bg-[#444]', 'text-white', 'rounded', 'py-1', 'text-xs')}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   PLAYER CARD (PATCHED)
============================================================ */
function PlayerCard({
  player,
  active,
  onReAdd,
  onMoveToPending,
  onMoveToPrevious,
  onImageClick,
}: any) {
  return (
    <div className={cn('flex', 'bg-[#0f1624]', 'rounded-lg', 'border', 'border-[#333]', 'p-3', 'gap-3', 'items-center')}>
      <img
        src={player.selfie_url || "/placeholder.png"}
        className={cn('w-[70px]', 'h-[70px]', 'rounded-full', 'object-cover', 'border-2', 'border-white/20', 'shadow', 'cursor-pointer')}
        onClick={() => player.selfie_url && onImageClick(player.selfie_url)}
      />

      <div className="flex-1">
        <div className={cn('font-semibold', 'text-sm')}>
          {player.display_name || "Unnamed Player"}
        </div>
        <div className={cn('text-xs', 'opacity-70')}>Lane: {player.lane_index + 1}</div>

        <div className={cn('flex', 'gap-2', 'mt-2', 'text-xs')}>
          {active && (
            <>
              <button
                onClick={onMoveToPrevious}
                className={cn('flex-1', 'bg-orange-500', 'hover:bg-orange-600', 'text-white', 'rounded', 'py-1')}
              >
                Move to Previous
              </button>

              <button
                onClick={onMoveToPending}
                className={cn('flex-1', 'bg-yellow-500', 'hover:bg-yellow-600', 'text-black', 'rounded', 'py-1')}
              >
                Move to Pending
              </button>
            </>
          )}

          {!active && onReAdd && (
            <button
              onClick={onReAdd}
              className={cn('flex-1', 'bg-blue-600', 'hover:bg-blue-700', 'text-white', 'rounded', 'py-1')}
            >
              Re-Add
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
