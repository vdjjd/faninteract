// components/BasketballModerationModal.tsx
"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";

interface Entry {
  id: string;
  game_id: string;
  guest_profile_id: string;
  status: "pending" | "approved" | "rejected";
  photo_url?: string;
  first_name?: string;
  last_name?: string;
  created_at: string;
  device_token?: string | null;

  guest_profiles: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
}

interface Player {
  id: string;
  game_id: string;
  guest_profile_id: string;
  display_name: string | null;
  selfie_url: string | null;
  lane_index: number | null;
  score: number | null;
  disconnected_at: string | null;

  // ✅ IMPORTANT: your table uses state
  state: "approved" | "removed" | "disconnected" | null;

  device_token?: string | null;
  approved_at?: string | null;
}

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

  function showToast(text: string, color = "#00ff88") {
    setToast({ text, color });
    setTimeout(() => setToast(null), 2400);
  }

  async function loadEntries() {
    const { data, error } = await supabase
      .from("bb_game_entries")
      .select(
        "id,game_id,guest_profile_id,status,photo_url,first_name,last_name,created_at,device_token, guest_profiles(first_name,last_name,email,phone)"
      )
      .eq("game_id", gameId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ loadEntries error:", error);
      return;
    }

    setEntries((data ?? []) as unknown as Entry[]);
  }

  async function loadPlayers() {
    const { data, error } = await supabase
      .from("bb_game_players")
      .select("*")
      .eq("game_id", gameId)
      .order("lane_index", { ascending: true });

    if (error) {
      console.error("❌ loadPlayers error:", error);
      return;
    }

    setPlayers((data || []) as Player[]);
  }

  // ✅ Use state-aware lane allocation:
  // Only lanes of APPROVED + currently connected (disconnected_at is null) should block a lane.
  function getNextLane() {
    const used = new Set(
      players
        .filter((p) => p.state === "approved" && p.disconnected_at === null)
        .map((p) => p.lane_index)
        .filter((x): x is number => typeof x === "number")
    );

    for (let lane = 1; lane <= 10; lane++) if (!used.has(lane)) return lane;
    return null;
  }

  async function handleApprove(entryId: string) {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;

    const lane = getNextLane();
    if (lane === null) {
      showToast("❌ All 10 player spots are full!", "#ff4444");
      return;
    }

    const displayName = `${entry.first_name ?? ""} ${
      entry.last_name ?? ""
    }`.trim();

    // ✅ CRITICAL FIX: must set state to allowed value, or default 'active' fails CHECK constraint
    const payload = {
      game_id: gameId,
      guest_profile_id: entry.guest_profile_id,
      display_name: displayName,
      selfie_url: entry.photo_url ?? null,
      lane_index: lane,
      score: 0,
      disconnected_at: null,

      state: "approved" as const, // ✅ fixes 400
      approved_at: new Date().toISOString(),

      // optional extras that exist in your schema
      device_token: entry.device_token ?? null,
      entry_id: entry.id,
    };

    const { error: insertErr } = await supabase
      .from("bb_game_players")
      .insert([payload]);

    if (insertErr) {
      console.error("❌ Insert error:", insertErr);
      const details =
        (insertErr as any)?.details || (insertErr as any)?.hint || "";
      showToast(`Insert failed${details ? `: ${details}` : ""}`, "#ff4444");
      return;
    }

    await supabase
      .from("bb_game_entries")
      .update({ status: "approved" })
      .eq("id", entryId);

    showToast("✅ Player Approved");

    // ✅ Immediately refresh so UI reflects new player + lane usage
    loadPlayers();
    loadEntries();
  }

  async function handleReject(entryId: string) {
    const { error } = await supabase
      .from("bb_game_entries")
      .update({ status: "rejected" })
      .eq("id", entryId);

    if (error) console.error("❌ reject error:", error);

    showToast("🚫 Rejected", "#ff4444");
    loadEntries();
  }

  async function handleDelete(entryId: string) {
    const { error } = await supabase.from("bb_game_entries").delete().eq("id", entryId);
    if (error) console.error("❌ delete entry error:", error);

    showToast("🗑 Deleted", "#888");
    loadEntries();
  }

  async function handleClearActive() {
    // ✅ Active = approved + connected (disconnected_at null)
    const activePlayers = players.filter(
      (p) => p.state === "approved" && p.disconnected_at === null
    );

    if (activePlayers.length === 0) {
      showToast("No active players to clear.", "#ffaa22");
      return;
    }

    const nowIso = new Date().toISOString();

    // ✅ IMPORTANT: set state='disconnected' to match your CHECK constraint & logic
    const { error } = await supabase
      .from("bb_game_players")
      .update({ disconnected_at: nowIso, state: "disconnected" })
      .eq("game_id", gameId)
      .eq("state", "approved")
      .is("disconnected_at", null);

    if (error) {
      console.error("❌ clear active error:", error);
      showToast("Clear failed", "#ff4444");
      return;
    }

    showToast("🔄 Active players moved to Previously Played");
    loadPlayers();
  }

  async function handleReAdd(player: Player) {
    const lane = getNextLane();
    if (lane === null) {
      showToast("❌ No open player spots!", "#ff4444");
      return;
    }

    // ✅ Re-add means: set to approved + connected
    const { error } = await supabase
      .from("bb_game_players")
      .update({
        disconnected_at: null,
        lane_index: lane,
        score: 0,
        state: "approved",
        approved_at: new Date().toISOString(),
      })
      .eq("id", player.id);

    if (error) {
      console.error("❌ re-add error:", error);
      showToast("Re-add failed", "#ff4444");
      return;
    }

    showToast("🔁 Player Re-Added");
    loadPlayers();
  }

  useEffect(() => {
    if (!gameId) return;

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
        () => loadEntries()
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
        () => loadPlayers()
      )
      .subscribe();

    const interval = setInterval(() => {
      loadEntries();
      loadPlayers();
    }, 3000);

    return () => {
      supabase.removeChannel(entriesChannel);
      supabase.removeChannel(playersChannel);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  const pending = entries.filter((e) => e.status === "pending");
  const rejected = entries.filter((e) => e.status === "rejected");

  // ✅ Active = approved + connected
  const active = players.filter(
    (p) => p.state === "approved" && p.disconnected_at === null
  );

  // ✅ Previous = disconnected OR disconnected_at not null
  const previous = players.filter(
    (p) => p.state === "disconnected" || p.disconnected_at !== null
  );

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
        <button
          onClick={onClose}
          className={cn(
            "absolute top-3 right-3 text-white/70 hover:text-white text-xl"
          )}
        >
          ✕
        </button>

        <h1 className={cn("text-center", "text-2xl", "font-bold", "mb-6")}>
          Basketball Player Moderation
        </h1>

        <div className={cn("text-right", "mb-4")}>
          <button
            onClick={handleClearActive}
            className={cn(
              "px-4",
              "py-2",
              "bg-red-600",
              "hover:bg-red-700",
              "text-white",
              "rounded-lg",
              "shadow"
            )}
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
                // NOTE: you can keep delete if you truly want to remove the player row.
                // If you'd rather preserve history, update state='removed' instead.
                await supabase.from("bb_game_players").delete().eq("id", p.id);

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

                showToast("🔁 Player moved to Pending");
                loadPlayers();
                loadEntries();
              }}
              onMoveToPrevious={async () => {
                const nowIso = new Date().toISOString();

                // ✅ IMPORTANT: set state='disconnected' (not just disconnected_at)
                await supabase
                  .from("bb_game_players")
                  .update({
                    disconnected_at: nowIso,
                    state: "disconnected",
                  })
                  .eq("id", p.id);

                showToast("⏮️ Player moved to Previously Played");
                loadPlayers();
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
            className={cn(
              "fixed inset-0 bg-black/70 flex items-center justify-center z-[99999]"
            )}
            onClick={() => setSelectedPhoto(null)}
          >
            <img
              src={selectedPhoto}
              className={cn("max-w-[90vw] max-h-[90vh] rounded-xl shadow-xl")}
            />
          </div>
        )}

        {toast && (
          <div
            className={cn(
              "fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-black font-semibold"
            )}
            style={{ background: toast.color }}
          >
            {toast.text}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, color, items, render }: any) {
  return (
    <div className="mb-6">
      <h2
        className={cn("text-xl", "font-semibold", "mb-2")}
        style={{ borderLeft: `4px solid ${color}`, paddingLeft: 8 }}
      >
        {title} ({items.length})
      </h2>

      {items.length === 0 ? (
        <p className="text-gray-400">None</p>
      ) : (
        <div className={cn("grid gap-3 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]")}>
          {items.map((item: any) => (
            <div key={item.id}>{render(item)}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function EntryCard({ entry, onApprove, onReject, onDelete, rejected, onImageClick }: any) {
  return (
    <div className={cn("flex bg-[#0f1624] rounded-lg border border-[#333] p-3 gap-3 items-center")}>
      <img
        src={entry.photo_url || "/placeholder.png"}
        className={cn("w-[70px] h-[70px] rounded-full object-cover border-2 border-white/20 shadow cursor-pointer")}
        onClick={() => entry.photo_url && onImageClick(entry.photo_url)}
      />

      <div className={cn("flex-1 flex flex-col justify-between")}>
        <div className={cn("font-semibold text-sm")}>
          {(entry.first_name || "") + " " + (entry.last_name || "")}
        </div>

        {!rejected ? (
          <div className={cn("flex gap-2 text-xs mt-2")}>
            <button onClick={onApprove} className={cn("flex-1 bg-green-600 text-white rounded py-1")}>
              Approve
            </button>
            <button onClick={onReject} className={cn("flex-1 bg-red-600 text-white rounded py-1")}>
              Reject
            </button>
          </div>
        ) : (
          <button onClick={onDelete} className={cn("mt-2 w-full bg-[#444] text-white rounded py-1 text-xs")}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

function PlayerCard({ player, active, onReAdd, onMoveToPending, onMoveToPrevious, onImageClick }: any) {
  return (
    <div className={cn("flex bg-[#0f1624] rounded-lg border border-[#333] p-3 gap-3 items-center")}>
      <img
        src={player.selfie_url || "/placeholder.png"}
        className={cn("w-[70px] h-[70px] rounded-full object-cover border-2 border-white/20 shadow cursor-pointer")}
        onClick={() => player.selfie_url && onImageClick(player.selfie_url)}
      />

      <div className="flex-1">
        <div className={cn("font-semibold text-sm")}>{player.display_name || "Unnamed Player"}</div>
        <div className={cn("text-xs opacity-70")}>Lane: {player.lane_index ?? "—"}</div>

        <div className={cn("flex gap-2 mt-2 text-xs")}>
          {active && (
            <>
              <button
                onClick={onMoveToPrevious}
                className={cn("flex-1 bg-orange-500 hover:bg-orange-600 text-white rounded py-1")}
              >
                Move to Previous
              </button>

              <button
                onClick={onMoveToPending}
                className={cn("flex-1 bg-yellow-500 hover:bg-yellow-600 text-black rounded py-1")}
              >
                Move to Pending
              </button>
            </>
          )}

          {!active && onReAdd && (
            <button onClick={onReAdd} className={cn("flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded py-1")}>
              Re-Add
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
