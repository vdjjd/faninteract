"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";

const supabase = getSupabaseClient();

type EntryRow = {
  id: string;
  game_id: string | null;
  guest_profile_id: string | null;
  display_name: string | null;
  selfie_url: string | null;
  device_token: string | null;
  created_at?: string | null;
};

type PlayerRow = {
  id: string;
  game_id: string | null;
  lane_index: number | null;
  state: string | null;
};

function normalizeLaneIndex(input: number | null | undefined) {
  if (typeof input !== "number" || !Number.isFinite(input)) return null;

  // If UI passes 0–9, convert to 1–10. If already 1–10, keep.
  if (input >= 0 && input <= 9) return input + 1;
  if (input >= 1 && input <= 10) return input;

  // Anything else => null (so we don’t violate check constraint)
  return null;
}

export default function BasketballModerationPage() {
  const params = useParams<{ gameId: string }>();
  const gameId = params?.gameId;

  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [approved, setApproved] = useState<PlayerRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  async function loadAll() {
    if (!gameId) return;
    setLoading(true);
    setErrorMsg("");

    try {
      // Pending queue (bb_game_entries)
      // NOTE: if your table uses different column names (status/state), adjust the filter.
      const { data: eData, error: eErr } = await supabase
        .from("bb_game_entries")
        .select("id,game_id,guest_profile_id,display_name,selfie_url,device_token,created_at")
        .eq("game_id", gameId)
        // If you have a status column, uncomment one of these:
        // .eq("status", "pending")
        // .eq("state", "pending")
        .order("created_at", { ascending: true });

      if (eErr) {
        console.error("❌ bb_game_entries load error:", eErr);
        setErrorMsg(`Entries load failed: ${eErr.message}`);
      } else {
        setEntries((eData as any[]) || []);
      }

      // Approved players (to show lane occupancy)
      const { data: pData, error: pErr } = await supabase
        .from("bb_game_players")
        .select("id,game_id,lane_index,state")
        .eq("game_id", gameId)
        .eq("state", "approved");

      if (pErr) {
        console.error("❌ bb_game_players load error:", pErr);
      } else {
        setApproved((pData as any[]) || []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  const usedLanes = useMemo(() => {
    const s = new Set<number>();
    for (const p of approved) {
      if (typeof p.lane_index === "number") s.add(p.lane_index);
    }
    return s;
  }, [approved]);

  function findNextOpenLane(): number | null {
    for (let lane = 1; lane <= 10; lane++) {
      if (!usedLanes.has(lane)) return lane;
    }
    return null;
  }

  async function approveEntry(entry: EntryRow, requestedLane?: number | null) {
    if (!gameId) return;
    if (!entry?.id) return;

    setBusyId(entry.id);
    setErrorMsg("");

    try {
      // Choose lane
      const lane =
        normalizeLaneIndex(requestedLane ?? null) ?? findNextOpenLane();

      // If no lane available, you can still approve without lane_index (null).
      // But your UNIQUE lane index only applies when lane_index is not null.
      const laneIndex = lane ?? null;

      // ✅ CRITICAL FIX: set state to an allowed value (approved)
      const payload: any = {
        game_id: gameId,
        guest_profile_id: entry.guest_profile_id,
        display_name: entry.display_name,
        selfie_url: entry.selfie_url,
        lane_index: laneIndex,
        score: 0,
        disconnected_at: null,
        state: "approved",
        approved_at: new Date().toISOString(),
        device_token: entry.device_token ?? null,
        entry_id: entry.id,
      };

      const { data, error } = await supabase
        .from("bb_game_players")
        .insert(payload)
        .select("id,game_id,lane_index,state")
        .maybeSingle();

      if (error) {
        // This prints the real details (constraint name, etc)
        console.error("❌ Insert error (bb_game_players):", error);
        setErrorMsg(
          `Approve failed: ${error.message}${
            (error as any).details ? ` — ${(error as any).details}` : ""
          }`
        );
        return;
      }

      // Optimistically update UI
      if (data) setApproved((prev) => [...prev, data as any]);
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));

      // Optional: mark entry as approved if your bb_game_entries table supports it.
      // This is safe-ignored if the column doesn't exist.
      try {
        await supabase
          .from("bb_game_entries")
          .update({ approved_at: new Date().toISOString(), status: "approved" })
          .eq("id", entry.id);
      } catch {
        // ignore
      }
    } finally {
      setBusyId(null);
    }
  }

  async function removePlayer(playerId: string) {
    if (!playerId) return;

    const { error } = await supabase
      .from("bb_game_players")
      .update({ state: "removed" })
      .eq("id", playerId);

    if (error) {
      console.error("❌ remove player error:", error);
      setErrorMsg(`Remove failed: ${error.message}`);
      return;
    }

    // reload lanes + lists
    loadAll();
  }

  if (!gameId) {
    return (
      <div style={{ minHeight: "100vh", background: "#020617", color: "#fff", padding: 20 }}>
        Missing gameId in route.
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#020617",
        color: "#fff",
        padding: 16,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 900 }}>Moderate Players</div>
        <div style={{ opacity: 0.7, fontSize: 12 }}>Game: {gameId}</div>
        <div style={{ marginLeft: "auto" }}>
          <button
            onClick={loadAll}
            style={{
              padding: "8px 12px",
              borderRadius: 12,
              border: "1px solid rgba(148,163,184,0.35)",
              background: "rgba(15,23,42,0.9)",
              color: "#fff",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {errorMsg && (
        <div
          style={{
            marginBottom: 12,
            padding: 10,
            borderRadius: 14,
            border: "1px solid rgba(248,113,113,0.45)",
            background: "rgba(127,29,29,0.35)",
            color: "#fee2e2",
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          {errorMsg}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
        {/* Pending Entries */}
        <div
          style={{
            borderRadius: 16,
            border: "1px solid rgba(148,163,184,0.35)",
            background: "rgba(15,23,42,0.75)",
            padding: 12,
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Pending Queue</div>

          {loading ? (
            <div style={{ opacity: 0.8 }}>Loading…</div>
          ) : entries.length === 0 ? (
            <div style={{ opacity: 0.8 }}>No pending entries.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {entries.map((e) => {
                const busy = busyId === e.id;
                return (
                  <div
                    key={e.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: 10,
                      borderRadius: 14,
                      border: "1px solid rgba(148,163,184,0.25)",
                      background: "rgba(2,6,23,0.55)",
                    }}
                  >
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 999,
                        overflow: "hidden",
                        border: "1px solid rgba(226,232,240,0.4)",
                        background: "rgba(15,23,42,0.8)",
                        flexShrink: 0,
                      }}
                    >
                      {e.selfie_url ? (
                        <img
                          src={e.selfie_url}
                          alt=""
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : null}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {e.display_name || "Player"}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        guest_profile_id: {e.guest_profile_id || "—"}
                      </div>
                    </div>

                    <button
                      onClick={() => approveEntry(e)}
                      disabled={busy}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 14,
                        border: "1px solid rgba(34,197,94,0.55)",
                        background: busy
                          ? "rgba(34,197,94,0.2)"
                          : "linear-gradient(90deg,#22c55e,#16a34a)",
                        color: "#fff",
                        fontWeight: 900,
                        cursor: busy ? "not-allowed" : "pointer",
                        minWidth: 92,
                      }}
                    >
                      {busy ? "Approving…" : "Approve"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Approved Players */}
        <div
          style={{
            borderRadius: 16,
            border: "1px solid rgba(148,163,184,0.35)",
            background: "rgba(15,23,42,0.75)",
            padding: 12,
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 10 }}>
            Approved Players <span style={{ opacity: 0.7, fontSize: 12 }}>({approved.length}/10)</span>
          </div>

          {approved.length === 0 ? (
            <div style={{ opacity: 0.8 }}>No approved players yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {approved
                .slice()
                .sort((a, b) => (a.lane_index || 999) - (b.lane_index || 999))
                .map((p) => (
                  <div
                    key={p.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: 10,
                      borderRadius: 14,
                      border: "1px solid rgba(148,163,184,0.25)",
                      background: "rgba(2,6,23,0.55)",
                    }}
                  >
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 14,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 1000,
                        background: "rgba(59,130,246,0.35)",
                        border: "1px solid rgba(147,197,253,0.55)",
                        flexShrink: 0,
                      }}
                    >
                      {p.lane_index ?? "—"}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 900 }}>Player ID: {p.id}</div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>state: {p.state}</div>
                    </div>

                    <button
                      onClick={() => removePlayer(p.id)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 14,
                        border: "1px solid rgba(248,113,113,0.55)",
                        background: "linear-gradient(90deg,#ef4444,#b91c1c)",
                        color: "#fff",
                        fontWeight: 900,
                        cursor: "pointer",
                        minWidth: 92,
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 14, fontSize: 12, opacity: 0.7, lineHeight: 1.35 }}>
        <div>
          ✅ Approve insert sets <b>state="approved"</b> and <b>approved_at</b> to avoid the check-constraint failure from the
          table default <b>'active'</b>.
        </div>
        <div>✅ lane_index is normalized to 1–10 (your CHECK constraint requirement).</div>
      </div>
    </div>
  );
}
