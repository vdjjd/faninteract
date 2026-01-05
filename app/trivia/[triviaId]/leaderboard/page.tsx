"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { getSupabaseClient } from "@/lib/supabaseClient";

const supabase = getSupabaseClient();

type LeaderRow = {
  rank: number;
  playerId: string;
  guestId?: string | null;
  name: string;
  selfieUrl?: string | null;
  points: number;
  streak?: number; // 👈 NEW: current streak
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
      (a[i].selfieUrl || "") !== (b[i].selfieUrl || "") ||
      (a[i].streak || 0) !== (b[i].streak || 0)
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

const SAFE_BOUNDS = {
  left: "18vw",
  right: "18vw",
};

const FALLBACK_BG = "linear-gradient(to bottom right,#1b2735,#090a0f)";

function medalFor(rank: number) {
  if (rank === 1)
    return {
      ring: "rgba(255, 215, 0, 0.95)",
      glow: "rgba(255, 215, 0, 0.35)",
      badge: "rgba(255, 215, 0, 0.92)",
    };
  if (rank === 2)
    return {
      ring: "rgba(220, 220, 220, 0.95)",
      glow: "rgba(220, 220, 220, 0.30)",
      badge: "rgba(220, 220, 220, 0.90)",
    };
  if (rank === 3)
    return {
      ring: "rgba(205, 127, 50, 0.95)",
      glow: "rgba(205, 127, 50, 0.30)",
      badge: "rgba(205, 127, 50, 0.90)",
    };
  return {
    ring: "rgba(255,255,255,0.45)",
    glow: "rgba(255,255,255,0.10)",
    badge: "rgba(255,255,255,0.55)",
  };
}

export default function TriviaLeaderboardPage() {
  const params = useParams<{ triviaId: string }>();
  const triviaId = params?.triviaId;

  const [rows, setRows] = useState<LeaderRow[]>([]);
  const rowsRef = useRef<LeaderRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [bg, setBg] = useState<string>(FALLBACK_BG);
  const [brightness, setBrightness] = useState<number>(100);

  // subtle pulse when leaderboard updates
  const [bumpKey, setBumpKey] = useState(0);

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
      if (!error && data) applyBackgroundFromRow(data);
      else applyBackgroundFromRow(null);
    }

    loadTriviaBg();

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
  /* LEADERBOARD DATA (READ ONLY)                        */
  /* -------------------------------------------------- */
  useEffect(() => {
    if (!triviaId) return;

    let cancelled = false;

    async function loadLeaderboard() {
      if (!rowsRef.current.length) setLoading(true);

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
          setBumpKey((k) => k + 1);
        }
        if (!cancelled) setLoading(false);
        return;
      }

      const { data: players, error: playersErr } = await supabase
        .from("trivia_players")
        .select(
          "id,status,guest_id,display_name,photo_url,current_streak" // 👈 include current_streak
        )
        .eq("session_id", session.id)
        .eq("status", "approved");

      if (playersErr || !players || players.length === 0) {
        if (!cancelled && !sameRows([], rowsRef.current)) {
          rowsRef.current = [];
          setRows([]);
          setBumpKey((k) => k + 1);
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

        if (!guestsErr) {
          for (const g of guests || []) {
            guestMap.set(g.id, {
              name: formatName(g?.first_name, g?.last_name),
              selfieUrl: pickSelfieUrl(g),
            });
          }
        }
      }

      const built: LeaderRow[] = players
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
            streak:
              typeof p.current_streak === "number" ? p.current_streak : 0, // 👈 attach streak
          };
        })
        .sort((a, b) => b.points - a.points)
        .map((r, idx) => ({ ...r, rank: idx + 1 }));

      if (!cancelled && !sameRows(built, rowsRef.current)) {
        rowsRef.current = built;
        setRows(built);
        setBumpKey((k) => k + 1);
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

  return (
    <>
      <div
        style={{
          width: "100vw",
          height: "100vh",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* ✅ background with brightness */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: bg,
            filter: `brightness(${brightness}%)`,
            transform: "scale(1.02)",
            zIndex: 0,
          }}
        />

        {/* ✅ vignette */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            pointerEvents: "none",
            background: `
              radial-gradient(circle at 50% 40%, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0.55) 70%, rgba(0,0,0,0.82) 100%),
              linear-gradient(180deg, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0.05) 35%, rgba(0,0,0,0.42) 100%)
            `,
          }}
        />

        {/* ✅ subtle grain */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 2,
            pointerEvents: "none",
            opacity: 0.1,
            backgroundImage: `
              repeating-linear-gradient(
                0deg,
                rgba(255,255,255,0.02),
                rgba(255,255,255,0.02) 1px,
                rgba(0,0,0,0.02) 2px,
                rgba(0,0,0,0.02) 3px
              )
            `,
            mixBlendMode: "overlay",
          }}
        />

        {/* Foreground */}
        <div
          style={{
            position: "relative",
            zIndex: 3,
            width: "100%",
            height: "100%",
            color: "#fff",
            display: "flex",
            justifyContent: "center",
          }}
        >
          {/* Title */}
          <div
            style={{
              position: "absolute",
              top: UI.titleTop,
              left: "50%",
              transform: "translateX(-50%)",
              fontSize: "clamp(2.5rem,4vw,4.8rem)",
              fontWeight: 900,
              letterSpacing: "0.02em",
              textShadow:
                "0 10px 40px rgba(0,0,0,0.65), 0 0 28px rgba(120,190,255,0.18)",
            }}
          >
            <span className="fiTitleShine">Leaderboard</span>
          </div>

          {/* List */}
          <motion.div
            key={bumpKey}
            initial={{ scale: 0.995, opacity: 0.98 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            style={{
              position: "absolute",
              top: UI.listTop,
              left: SAFE_BOUNDS.left,
              right: SAFE_BOUNDS.right,
              maxWidth: UI.maxWidth,
              margin: "0 auto",
            }}
          >
            {loading && (
              <div style={{ textAlign: "center", opacity: 0.8 }}>
                Loading leaderboard…
              </div>
            )}

            {!loading && rows.length === 0 && (
              <div style={{ textAlign: "center", opacity: 0.8 }}>
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
                  const medal = medalFor(r.rank);

                  return (
                    <div
                      key={r.playerId}
                      className={isTop3 ? "fiTopRow" : ""}
                      style={{
                        height: UI.rowHeight,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        borderRadius: 22,
                        padding: `0 ${UI.rowPadX}px`,
                        background: isTop3
                          ? "linear-gradient(90deg, rgba(255,255,255,0.10), rgba(255,255,255,0.06))"
                          : "rgba(255,255,255,0.07)",
                        border: isTop3
                          ? `2px solid ${medal.ring}`
                          : "1px solid rgba(255,255,255,0.15)",
                        boxShadow: isTop3
                          ? `0 0 26px ${medal.glow}, 0 18px 60px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.12)`
                          : "0 14px 50px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.08)",
                        position: "relative",
                        overflow: "hidden",
                      }}
                    >
                      {/* inner highlight */}
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          pointerEvents: "none",
                          background:
                            "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.02) 45%, rgba(0,0,0,0.08) 100%)",
                          opacity: 0.75,
                        }}
                      />

                      {/* Left: avatar + name + streak */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 18,
                          position: "relative",
                          zIndex: 2,
                        }}
                      >
                        {/* Avatar / rank circle */}
                        <div
                          style={{
                            width: UI.avatar,
                            height: UI.avatar,
                            borderRadius: "50%",
                            overflow: "hidden",
                            background: "rgba(255,255,255,0.12)",
                            border: r.selfieUrl
                              ? `3px solid ${
                                  isTop3
                                    ? medal.ring
                                    : "rgba(255,255,255,0.45)"
                                }`
                              : `2px dashed ${
                                  isTop3
                                    ? medal.ring
                                    : "rgba(255,255,255,0.45)"
                                }`,
                            boxShadow: isTop3
                              ? `0 0 18px ${medal.glow}`
                              : "0 0 14px rgba(0,0,0,0.35)",
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
                                opacity: 0.95,
                              }}
                            >
                              {r.rank}
                            </div>
                          )}

                          {/* rank badge */}
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
                                border: `1px solid ${
                                  isTop3
                                    ? medal.badge
                                    : "rgba(255,255,255,0.25)"
                                }`,
                                boxShadow: isTop3
                                  ? `0 0 14px ${medal.glow}`
                                  : "none",
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

                        {/* Name + streak pill */}
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                            maxWidth: "65vw",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "clamp(1.3rem,2.2vw,2.4rem)",
                              fontWeight: 900,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              textShadow: isTop3
                                ? "0 10px 30px rgba(0,0,0,0.45), 0 0 18px rgba(255,255,255,0.12)"
                                : "0 8px 22px rgba(0,0,0,0.40)",
                            }}
                          >
                            {r.name}
                          </div>

                          {r.streak && r.streak >= 3 && (
                            <div
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                padding: "2px 10px",
                                borderRadius: 999,
                                fontSize: "0.85rem",
                                fontWeight: 700,
                                letterSpacing: "0.03em",
                                background:
                                  r.streak >= 5
                                    ? "linear-gradient(90deg, rgba(255,140,0,0.9), rgba(255,69,0,0.9))"
                                    : "linear-gradient(90deg, rgba(255,215,0,0.85), rgba(255,165,0,0.85))",
                                boxShadow:
                                  r.streak >= 5
                                    ? "0 0 20px rgba(255,69,0,0.6)"
                                    : "0 0 14px rgba(255,215,0,0.5)",
                                color: "#fff",
                                textTransform: "uppercase",
                              }}
                            >
                              <span>{r.streak >= 5 ? "🔥" : "✨"}</span>
                              <span>
                                {r.streak >= 5 ? "ON FIRE" : "HOT STREAK"} •{" "}
                                {r.streak}x
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right: points */}
                      <div
                        style={{
                          fontSize: "clamp(1.6rem,2.6vw,3rem)",
                          fontWeight: 900,
                          position: "relative",
                          zIndex: 2,
                          textShadow: isTop3
                            ? `0 0 18px ${medal.glow}, 0 10px 35px rgba(0,0,0,0.50)`
                            : "0 10px 35px rgba(0,0,0,0.50)",
                        }}
                      >
                        {r.points}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </>
  );
}
