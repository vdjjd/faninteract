"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";

const supabase = getSupabaseClient();

type LeaderRow = {
  rank: number;
  playerId: string;
  guestId?: string | null;
  name: string;
  selfieUrl?: string | null;
  points: number;
};

function formatName(first?: string, last?: string) {
  const f = (first || "").trim();
  const l = (last || "").trim();
  const li = l ? `${l[0].toUpperCase()}.` : "";
  return `${f}${li ? " " + li : ""}`.trim() || "Player";
}

function formatDisplayName(display?: string) {
  const raw = (display || "").trim().replace(/\s+/g, " ");
  if (!raw) return "Player";

  const parts = raw.split(" ").filter(Boolean);
  const first = parts[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  const li = last ? `${last[0].toUpperCase()}.` : "";

  return `${first}${li ? " " + li : ""}`.trim() || "Player";
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

function sameRows(a: LeaderRow[], b: LeaderRow[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
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

const UI = {
  titleTop: "9vh",
  listTop: "18vh",
  maxWidth: 1200,
  rowGap: 14,
  rowPadX: 22,
  rowHeight: 86,
  avatar: 64,
};

/**
 * 🔧 SAFE HORIZONTAL BOUNDS FOR LEADERBOARD ROWS
 * - left: must clear the QR zone (bottom-left)
 * - right: must clear the logo zone (top-right)
 *
 * Tweak these two values on localhost to line up perfectly
 * with your QR + logo overlays on the main wall.
 */
const SAFE_BOUNDS = {
  left: "18vw", // move this right if QR still overlaps
  right: "18vw", // move this left if logo still overlaps
};

const FALLBACK_BG = "linear-gradient(to bottom right,#1b2735,#090a0f)";

export default function TriviaLeaderboardPage() {
  const params = useParams<{ triviaId: string }>();
  const triviaId = params?.triviaId;
  const router = useRouter();

  const [rows, setRows] = useState<LeaderRow[]>([]);
  const rowsRef = useRef<LeaderRow[]>([]);
  const [loading, setLoading] = useState(true);

  // 🎨 background from trivia card
  const [bg, setBg] = useState<string>(FALLBACK_BG);
  const [brightness, setBrightness] = useState<number>(100);

  // prevent double-advance
  const advanceLockRef = useRef(false);

  /* -------------------------------------------------- */
  /* BACKGROUND FROM trivia_cards                        */
  /* -------------------------------------------------- */
  useEffect(() => {
    if (!triviaId) return;

    let cancelled = false;

    const applyBackgroundFromRow = (row: any | null) => {
      if (!row) {
        setBg(FALLBACK_BG);
        setBrightness(100);
        return;
      }

      const value =
        row.background_type === "image"
          ? `url(${row.background_value}) center/cover no-repeat`
          : row.background_value || FALLBACK_BG;

      setBg(value);
      setBrightness(
        typeof row.background_brightness === "number"
          ? row.background_brightness
          : 100
      );
    };

    async function loadTriviaBg() {
      const { data, error } = await supabase
        .from("trivia_cards")
        .select("background_type, background_value, background_brightness")
        .eq("id", triviaId)
        .maybeSingle();

      if (cancelled) return;

      if (!error && data) {
        applyBackgroundFromRow(data);
      } else {
        applyBackgroundFromRow(null);
      }
    }

    loadTriviaBg();

    // Optional: live updates if host changes background mid-game
    const channel = supabase
      .channel(`leaderboard-trivia-${triviaId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "trivia_cards",
          filter: `id=eq.${triviaId}`,
        },
        (payload: any) => {
          if (cancelled) return;
          const next = payload?.new;
          if (!next) return;
          applyBackgroundFromRow(next);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [triviaId]);

  /* -------------------------------------------------- */
  /* LEADERBOARD DATA                                   */
  /* -------------------------------------------------- */
  useEffect(() => {
    if (!triviaId) return;

    let cancelled = false;

    async function loadLeaderboard() {
      if (!rowsRef.current.length) setLoading(true);

      // Latest running/waiting session for this trivia card
      const { data: session, error: sessionErr } = await supabase
        .from("trivia_sessions")
        .select("id,status,created_at")
        .eq("trivia_card_id", triviaId)
        .neq("status", "finished")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sessionErr || !session?.id) {
        if (!cancelled && !sameRows([], rowsRef.current)) {
          rowsRef.current = [];
          setRows([]);
        }
        if (!cancelled) setLoading(false);
        return;
      }

      const { data: players, error: playersErr } = await supabase
        .from("trivia_players")
        .select("id,status,guest_id,display_name,photo_url")
        .eq("session_id", session.id)
        .eq("status", "approved");

      if (playersErr || !players || players.length === 0) {
        if (!cancelled && !sameRows([], rowsRef.current)) {
          rowsRef.current = [];
          setRows([]);
        }
        if (!cancelled) setLoading(false);
        return;
      }

      const playerIds = players.map((p: any) => p.id);
      const guestIds = players.map((p: any) => p.guest_id).filter(Boolean);

      const { data: answers, error: answersErr } = await supabase
        .from("trivia_answers")
        .select("player_id,points")
        .in("player_id", playerIds);

      if (answersErr) {
        console.error("❌ trivia_answers fetch error:", answersErr);
        if (!cancelled) setLoading(false);
        return;
      }

      const totals = new Map<string, number>();
      for (const a of answers || []) {
        const pts = typeof a.points === "number" ? a.points : 0;
        totals.set(a.player_id, (totals.get(a.player_id) || 0) + pts);
      }

      const guestMap = new Map<
        string,
        { name: string; selfieUrl: string | null }
      >();

      if (guestIds.length > 0) {
        const { data: guests, error: guestsErr } = await supabase
          .from("guest_profiles")
          .select(
            "id,first_name,last_name,photo_url,selfie_url,avatar_url,image_url,profile_photo_url"
          )
          .in("id", guestIds);

        if (guestsErr) {
          console.warn("⚠️ guest_profiles fetch error:", guestsErr);
        } else {
          for (const g of guests || []) {
            guestMap.set(g.id, {
              name: formatName(g?.first_name, g?.last_name),
              selfieUrl: pickSelfieUrl(g),
            });
          }
        }
      }

      const built = players
        .map((p: any) => {
          const guest = p.guest_id ? guestMap.get(p.guest_id) : undefined;
          const safeName = guest?.name || formatDisplayName(p.display_name);
          const safeSelfie = guest?.selfieUrl || p.photo_url || null;

          return {
            rank: 0,
            playerId: p.id,
            guestId: p.guest_id,
            name: safeName,
            selfieUrl: safeSelfie,
            points: totals.get(p.id) || 0,
          };
        })
        .sort((a: any, b: any) => b.points - a.points)
        .map((r: any, idx: number) => ({ ...r, rank: idx + 1 }));

      if (!cancelled && !sameRows(built, rowsRef.current)) {
        rowsRef.current = built;
        setRows(built);
      }

      if (!cancelled) setLoading(false);
    }

    loadLeaderboard();
    const id = window.setInterval(loadLeaderboard, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [triviaId]);

  /* -------------------------------------------------- */
  /* AFTER 15s → ADVANCE QUESTION THEN ROUTE BACK        */
  /* -------------------------------------------------- */
  useEffect(() => {
    if (!triviaId) return;
    if (advanceLockRef.current) return;

    const timeoutId = window.setTimeout(async () => {
      if (advanceLockRef.current) return;
      advanceLockRef.current = true;

      // 1) get running session + current question
      const { data: session, error: sErr } = await supabase
        .from("trivia_sessions")
        .select("id,current_question,status")
        .eq("trivia_card_id", triviaId)
        .eq("status", "running")
        .maybeSingle();

      if (sErr || !session?.id) {
        // if something weird, just go back
        router.replace(`/trivia/${triviaId}`);
        return;
      }

      // 2) count total questions for this trivia card
      const { count, error: cErr } = await supabase
        .from("trivia_questions")
        .select("*", { count: "exact", head: true })
        .eq("trivia_card_id", triviaId);

      const total = typeof count === "number" ? count : null;

      // last question?
      if (total != null && session.current_question >= total) {
        router.replace(`/trivia/${triviaId}/podium`);
        return;
      }

      // 3) advance question NOW (so nobody can see next question early)
      await supabase
        .from("trivia_sessions")
        .update({
          current_question: session.current_question + 1,
          question_started_at: new Date().toISOString(),
        })
        .eq("id", session.id);

      // 4) back to active wall (now it will load the NEXT question)
      router.replace(`/trivia/${triviaId}`);
    }, 15000);

    return () => window.clearTimeout(timeoutId);
  }, [triviaId, router]);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: bg,
        filter: `brightness(${brightness}%)`,
        color: "#fff",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        justifyContent: "center",
      }}
    >
      {/* TITLE */}
      <div
        style={{
          position: "absolute",
          top: UI.titleTop,
          left: "50%",
          transform: "translateX(-50%)",
          fontSize: "clamp(2.5rem,4vw,4.8rem)",
          fontWeight: 900,
          letterSpacing: "0.02em",
          textShadow: "0 10px 40px rgba(0,0,0,0.65)",
        }}
      >
        Leaderboard
      </div>

      {/* LIST CONTAINER */}
      <div
        style={{
          position: "absolute",
          top: UI.listTop,
          left: SAFE_BOUNDS.left, // 🔧 start to the right of QR
          right: SAFE_BOUNDS.right, // 🔧 end to the left of logo
          maxWidth: UI.maxWidth,
          margin: "0 auto",
        }}
      >
        {loading && (
          <div style={{ textAlign: "center", opacity: 0.75 }}>
            Loading leaderboard…
          </div>
        )}

        {!loading && rows.length === 0 && (
          <div style={{ textAlign: "center", opacity: 0.75 }}>
            No scores yet.
          </div>
        )}

        {!loading && rows.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: UI.rowGap,
            }}
          >
            {rows.slice(0, 10).map((r) => {
              const isTop3 = r.rank <= 3;

              return (
                <div
                  key={r.playerId}
                  style={{
                    height: UI.rowHeight,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderRadius: 22,
                    padding: `0 ${UI.rowPadX}px`,
                    background: "rgba(255,255,255,0.07)",
                    border: isTop3
                      ? "2px solid rgba(190,242,100,0.55)"
                      : "1px solid rgba(255,255,255,0.15)",
                    boxShadow: isTop3
                      ? "0 0 28px rgba(190,242,100,0.22)"
                      : "none",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 18,
                    }}
                  >
                    {/* Avatar */}
                    <div
                      style={{
                        width: UI.avatar,
                        height: UI.avatar,
                        borderRadius: "50%",
                        overflow: "hidden",
                        background: "rgba(255,255,255,0.12)",
                        border: r.selfieUrl
                          ? "2px solid rgba(255,255,255,0.45)"
                          : "2px dashed rgba(255,255,255,0.45)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        position: "relative",
                      }}
                    >
                      {r.selfieUrl ? (
                        <img
                          src={r.selfieUrl}
                          alt={r.name}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            fontWeight: 900,
                            fontSize: "1.25rem",
                            opacity: 0.9,
                          }}
                        >
                          {r.rank}
                        </div>
                      )}

                      {r.selfieUrl && (
                        <div
                          style={{
                            position: "absolute",
                            bottom: -8,
                            right: -8,
                            width: 30,
                            height: 30,
                            borderRadius: "50%",
                            background: "rgba(0,0,0,0.75)",
                            border:
                              "1px solid rgba(255,255,255,0.25)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 900,
                          }}
                        >
                          {r.rank}
                        </div>
                      )}
                    </div>

                    {/* Name */}
                    <div
                      style={{
                        fontSize: "clamp(1.3rem,2.2vw,2.4rem)",
                        fontWeight: 900,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        maxWidth: "65vw",
                      }}
                    >
                      {r.name}
                    </div>
                  </div>

                  {/* Points */}
                  <div
                    style={{
                      fontSize: "clamp(1.6rem,2.6vw,3rem)",
                      fontWeight: 900,
                    }}
                  >
                    {r.points}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
