"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getSupabaseClient } from "@/lib/supabaseClient";

const supabase = getSupabaseClient();

/* ---------- TYPES ---------- */

interface TriviaPodiumProps {
  trivia: any; // same object you pass into TriviaActiveWall
}

type PodiumRow = {
  placeLabel: "1st" | "2nd" | "3rd";
  rank: number; // numeric rank (1,2,3)
  playerId: string;
  guestId?: string | null;
  name: string;
  selfieUrl?: string | null;
  points: number;
};

/* ---------- DISPLAY CONSTANTS ---------- */

const STEP_DURATION_MS = 5000; // 5 seconds between 3rd → 2nd → 1st

const fallbackLogo = "/faninteractlogo.png";
const fallbackPhoto = "/fallback.png";
const FALLBACK_BG = "linear-gradient(135deg,#1b2735,#090a0f)";

/* ---------- HELPERS (same logic flavor as wall) ---------- */

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

function pickPublicName(row: any): string {
  const pn = String(row?.public_name || "").trim();
  if (pn) return pn;

  // backward compat if older data uses `title`
  const t = String(row?.title || "").trim();
  if (t) return t;

  return "Trivia Game";
}

/* ---------- STYLES (adapted from SingleHighlight look) ---------- */

const STYLE: Record<string, React.CSSProperties> = {
  title: {
    color: "#fff",
    marginTop: "-9vh",
    marginBottom: "-1vh",
    fontWeight: 900,
    fontSize: "clamp(2.5rem,4vw,5rem)",
    textShadow: `
      2px 2px 2px #000,
      -2px 2px 2px #000,
      2px -2px 2px #000,
      -2px -2px 2px #000
    `,
    filter: `
      drop-shadow(0 0 25px rgba(255,255,255,0.6))
      drop-shadow(0 0 40px rgba(255,255,255,0.3))
    `,
  },

  greyBar: {
    width: "90%",
    height: "14px",
    marginTop: "2vh",
    marginBottom: "2vh",
    marginLeft: "3.5%",
    background: "linear-gradient(to right, #000, #4444)",
    borderRadius: "6px",
  },

  placeText: {
    fontSize: "clamp(2.4rem,3.4vw,4rem)",
    fontWeight: 900,
    color: "#ffffff",
    textTransform: "uppercase",
    margin: 0,
    textShadow: `
      2px 2px 2px #000,
      -2px 2px 2px #000,
      2px -2px 2px #000,
      -2px -2px 2px #000
    `,
    letterSpacing: "0.08em",
  },

  name: {
    fontSize: "clamp(2.4rem,3.2vw,3.6rem)",
    fontWeight: 900,
    color: "#ffffff",
    marginTop: "1.4vh",
    marginBottom: "0.6vh",
    textShadow: `
      2px 2px 2px #000,
      -2px 2px 2px #000,
      2px -2px 2px #000,
      -2px -2px 2px #000
    `,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "88%",
    textAlign: "center",
  },

  points: {
    fontSize: "clamp(1.4rem,2vw,2.2rem)",
    fontWeight: 700,
    color: "rgba(255,255,255,0.9)",
    marginTop: "0.4vh",
    textShadow: `
      2px 2px 2px #000,
      -2px 2px 2px #000,
      2px -2px 2px #000,
      -2px -2px 2px #000
    `,
  },
};

/* ---------- COMPONENT ---------- */

export default function TriviaPodum({ trivia }: TriviaPodiumProps) {
  const [podiumRows, setPodiumRows] = useState<PodiumRow[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  // ✅ Public title (top title)
  const [publicName, setPublicName] = useState<string>(() => pickPublicName(trivia));

  // 🎨 Background from trivia card
  const [bg, setBg] = useState<string>(FALLBACK_BG);
  const [brightness, setBrightness] = useState<number>(
    trivia?.background_brightness ?? 100
  );

  const logoSrc =
    trivia?.host?.branding_logo_url?.trim() ||
    trivia?.host?.logo_url?.trim() ||
    fallbackLogo;

  /* --- Apply title + background from trivia props --- */
  useEffect(() => {
    if (!trivia) return;

    setPublicName(pickPublicName(trivia));

    const value =
      trivia.background_type === "image"
        ? `url(${trivia.background_value}) center/cover no-repeat`
        : trivia.background_value || FALLBACK_BG;

    setBg(value);
    setBrightness(
      typeof trivia.background_brightness === "number"
        ? trivia.background_brightness
        : 100
    );
  }, [trivia]);

  // 🔁 Live updates from DB for title + background (optional but matches the other pages)
  useEffect(() => {
    if (!trivia?.id) return;

    const ch = supabase
      .channel(`podium-wall-trivia-${trivia.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "trivia_cards",
          filter: `id=eq.${trivia.id}`,
        },
        (payload: any) => {
          const next = payload?.new;
          if (!next) return;

          setPublicName(pickPublicName(next));

          const value =
            next.background_type === "image"
              ? `url(${next.background_value}) center/cover no-repeat`
              : next.background_value || FALLBACK_BG;

          setBg(value);
          setBrightness(
            typeof next.background_brightness === "number"
              ? next.background_brightness
              : 100
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [trivia?.id]);

  /* --- Load final leaderboard & build top 3 --- */
  useEffect(() => {
    if (!trivia?.id) return;

    let cancelled = false;

    async function loadPodium() {
      try {
        setLoading(true);

        // Latest session for this trivia card (running or just finished)
        const { data: session, error: sessionErr } = await supabase
          .from("trivia_sessions")
          .select("id,status,created_at")
          .eq("trivia_card_id", trivia.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (sessionErr || !session?.id) {
          console.error("❌ podium session fetch error:", sessionErr);
          if (!cancelled) setPodiumRows([]);
          return;
        }

        // Approved players
        const { data: players, error: playersErr } = await supabase
          .from("trivia_players")
          .select("id,status,guest_id,display_name,photo_url")
          .eq("session_id", session.id)
          .eq("status", "approved");

        if (playersErr || !players || players.length === 0) {
          console.error("❌ podium players fetch error:", playersErr);
          if (!cancelled) setPodiumRows([]);
          return;
        }

        const playerIds = players.map((p: any) => p.id);
        const guestIds = players.map((p: any) => p.guest_id).filter(Boolean);

        // All answers to compute total points
        const { data: answers, error: answersErr } = await supabase
          .from("trivia_answers")
          .select("player_id,points")
          .in("player_id", playerIds);

        if (answersErr) {
          console.error("❌ podium answers fetch error:", answersErr);
          if (!cancelled) setPodiumRows([]);
          return;
        }

        const totals = new Map<string, number>();
        for (const a of answers || []) {
          const pts = typeof a.points === "number" ? a.points : 0;
          totals.set(a.player_id, (totals.get(a.player_id) || 0) + pts);
        }

        // Guest data for names/selfies
        const guestMap = new Map<string, { name: string; selfieUrl: string | null }>();

        if (guestIds.length > 0) {
          const { data: guests, error: guestsErr } = await supabase
            .from("guest_profiles")
            .select(
              "id,first_name,last_name,photo_url,selfie_url,avatar_url,image_url,profile_photo_url"
            )
            .in("id", guestIds);

          if (guestsErr) {
            console.warn("⚠️ podium guest_profiles fetch error:", guestsErr);
          } else {
            for (const g of guests || []) {
              guestMap.set(g.id, {
                name: formatName(g?.first_name, g?.last_name),
                selfieUrl: pickSelfieUrl(g),
              });
            }
          }
        }

        const baseRows = players
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

        if (!baseRows.length) {
          if (!cancelled) setPodiumRows([]);
          return;
        }

        const top = baseRows.slice(0, 3);

        const podium: PodiumRow[] = [];

        if (top.length === 1) {
          podium.push({
            placeLabel: "1st",
            rank: 1,
            playerId: top[0].playerId,
            guestId: top[0].guestId,
            name: top[0].name,
            selfieUrl: top[0].selfieUrl,
            points: top[0].points,
          });
        } else if (top.length === 2) {
          // show 2nd then 1st
          podium.push({
            placeLabel: "2nd",
            rank: 2,
            playerId: top[1].playerId,
            guestId: top[1].guestId,
            name: top[1].name,
            selfieUrl: top[1].selfieUrl,
            points: top[1].points,
          });
          podium.push({
            placeLabel: "1st",
            rank: 1,
            playerId: top[0].playerId,
            guestId: top[0].guestId,
            name: top[0].name,
            selfieUrl: top[0].selfieUrl,
            points: top[0].points,
          });
        } else {
          // 3 players: show 3rd → 2nd → 1st
          podium.push({
            placeLabel: "3rd",
            rank: 3,
            playerId: top[2].playerId,
            guestId: top[2].guestId,
            name: top[2].name,
            selfieUrl: top[2].selfieUrl,
            points: top[2].points,
          });
          podium.push({
            placeLabel: "2nd",
            rank: 2,
            playerId: top[1].playerId,
            guestId: top[1].guestId,
            name: top[1].name,
            selfieUrl: top[1].selfieUrl,
            points: top[1].points,
          });
          podium.push({
            placeLabel: "1st",
            rank: 1,
            playerId: top[0].playerId,
            guestId: top[0].guestId,
            name: top[0].name,
            selfieUrl: top[0].selfieUrl,
            points: top[0].points,
          });
        }

        if (!cancelled) {
          setPodiumRows(podium);
          setCurrentIndex(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPodium();

    return () => {
      cancelled = true;
    };
  }, [trivia?.id]);

  /* --- Step 3rd → 2nd → 1st every 5s, winner stays --- */
  useEffect(() => {
    if (!podiumRows.length) return;

    // if only 1 row or we are already on last index, keep winner there
    if (podiumRows.length === 1 || currentIndex >= podiumRows.length - 1) {
      return;
    }

    const id = window.setTimeout(() => {
      setCurrentIndex((prev) => Math.min(prev + 1, podiumRows.length - 1));
    }, STEP_DURATION_MS);

    return () => window.clearTimeout(id);
  }, [podiumRows, currentIndex]);

  const current = podiumRows[currentIndex] || null;

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: bg,
        filter: `brightness(${brightness}%)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* ✅ TOP TITLE (PUBLIC NAME) */}
      <div
        style={{
          position: "absolute",
          top: "2.5vh",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 30,
          pointerEvents: "none",
          textAlign: "center",
        }}
      >
        <div
          style={{
            color: "#fff",
            fontSize: "clamp(2.5rem,4vw,5rem)",
            fontWeight: 900,
            textShadow: `
              2px 2px 2px #000,
              -2px 2px 2px #000,
              2px -2px 2px #000,
              -2px -2px 2px #000
            `,
            lineHeight: 1,
          }}
        >
          {publicName}
        </div>
      </div>

      {/* MAIN CARD */}
      <div
        style={{
          width: "min(92vw,1800px)",
          height: "min(83vh,950px)",
          background: "rgba(255,255,255,0.08)",
          backdropFilter: "blur(20px)",
          borderRadius: 24,
          border: "1px solid rgba(255,255,255,0.15)",
          position: "relative",
          overflow: "hidden",
          display: "flex",
        }}
      >
        {/* LEFT PHOTO AREA */}
        <div
          style={{
            position: "absolute",
            top: "4%",
            left: "2%",
            width: "46%",
            height: "92%",
            borderRadius: 18,
            overflow: "hidden",
            background: "rgba(0,0,0,0.4)",
          }}
        >
          <AnimatePresence mode="wait">
            {current && (
              <motion.img
                key={current.playerId}
                src={current.selfieUrl || fallbackPhoto}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  borderRadius: 18,
                }}
              />
            )}
          </AnimatePresence>
        </div>

        {/* RIGHT PANEL */}
        <div
          style={{
            flexGrow: 1,
            marginLeft: "46%",
            paddingTop: "4vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            position: "relative",
          }}
        >
          {/* LOGO */}
          <div
            style={{
              width: "clamp(320px,26vw,380px)",
              height: "clamp(150px,16vw,240px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <img
              src={logoSrc}
              alt="Host Logo"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                filter: "drop-shadow(0 0 14px rgba(0,0,0,0.85))",
              }}
            />
          </div>

          {/* GREY BAR */}
          <div style={STYLE.greyBar} />

          {/* PLACE + NAME + POINTS */}
          <AnimatePresence mode="wait">
            {current && (
              <motion.div
                key={current.playerId}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -30 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                style={{
                  marginTop: "1vh",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                }}
              >
                <p style={STYLE.placeText}>
                  IN {current.placeLabel.toUpperCase()} PLACE
                </p>
                <p style={STYLE.name}>{current.name}</p>
                <p style={STYLE.points}>{current.points} pts</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Loading / No data fallback */}
          {!loading && !current && (
            <div
              style={{
                marginTop: "6vh",
                color: "#fff",
                fontSize: "1.6rem",
                opacity: 0.8,
              }}
            >
              Waiting for final scores…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
