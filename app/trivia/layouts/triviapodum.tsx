import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { getSupabaseClient } from "@/lib/supabaseClient";

const supabase = getSupabaseClient();

/* ---------- TYPES ---------- */

interface TriviaPodiumProps {
  trivia: any; // same object you pass into TriviaActiveWall
}

type PodiumRow = {
  placeLabel: "1st" | "2nd" | "3rd";
  rank: number;
  playerId: string;
  guestId?: string | null;
  name: string;
  selfieUrl?: string | null;
  points: number;
};

/* ---------- DISPLAY CONSTANTS ---------- */

const STEP_DURATION_MS = 10000; // 10 seconds between 3rd → 2nd → 1st

const fallbackLogo = "/faninteractlogo.png";
const fallbackPhoto = "/fallback.png";
const FALLBACK_BG = "linear-gradient(135deg,#1b2735,#090a0f)";

/* ---------- HELPERS ---------- */

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

  const t = String(row?.title || "").trim();
  if (t) return t;

  return "Trivia Game";
}

/* ---------- PODIUM GLOW ---------- */

function getPodiumGlow(place?: "1st" | "2nd" | "3rd") {
  if (place === "1st") {
    return {
      borderColor: "#D4AF37",
      baseShadow:
        "0 0 16px rgba(212,175,55,0.55), 0 0 34px rgba(212,175,55,0.30)",
      pulseShadow:
        "0 0 22px rgba(212,175,55,0.75), 0 0 52px rgba(212,175,55,0.45), 0 0 88px rgba(212,175,55,0.20)",
    };
  }
  if (place === "2nd") {
    return {
      borderColor: "#C0C0C0",
      baseShadow:
        "0 0 16px rgba(192,192,192,0.55), 0 0 34px rgba(192,192,192,0.30)",
      pulseShadow:
        "0 0 22px rgba(192,192,192,0.75), 0 0 52px rgba(192,192,192,0.45), 0 0 88px rgba(192,192,192,0.20)",
    };
  }
  if (place === "3rd") {
    return {
      borderColor: "#CD7F32",
      baseShadow:
        "0 0 16px rgba(205,127,50,0.55), 0 0 34px rgba(205,127,50,0.30)",
      pulseShadow:
        "0 0 22px rgba(205,127,50,0.75), 0 0 52px rgba(205,127,50,0.45), 0 0 88px rgba(205,127,50,0.20)",
    };
  }
  return {
    borderColor: "rgba(255,255,255,0.18)",
    baseShadow: "0 0 0 rgba(0,0,0,0)",
    pulseShadow: "0 0 0 rgba(0,0,0,0)",
  };
}

/* ---------- CONFETTI (tasteful burst) ---------- */

type ConfettiParticle = {
  id: string;
  leftPct: number;
  size: number;
  delay: number;
  duration: number;
  drift: number;
  rotate: number;
  color: string;
  opacity: number;
};

function makeConfetti(count: number): ConfettiParticle[] {
  const colors = ["#D4AF37", "#C0C0C0", "#CD7F32", "#ffffff"];
  const arr: ConfettiParticle[] = [];
  for (let i = 0; i < count; i++) {
    arr.push({
      id: `${Date.now()}-${i}-${Math.random().toString(16).slice(2)}`,
      leftPct: Math.random() * 100,
      size: 6 + Math.random() * 8,
      delay: Math.random() * 0.25,
      duration: 1.2 + Math.random() * 0.9,
      drift: (Math.random() - 0.5) * 240,
      rotate: (Math.random() - 0.5) * 720,
      color: colors[Math.floor(Math.random() * colors.length)],
      opacity: 0.55 + Math.random() * 0.25,
    });
  }
  return arr;
}

/* ---------- STYLES ---------- */

const STYLE: Record<string, React.CSSProperties> = {
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
    color: "rgba(255,255,255,0.92)",
    marginTop: "0.6vh",
    padding: "10px 16px",
    borderRadius: 999,
    background: "rgba(0,0,0,0.22)",
    border: "1px solid rgba(255,255,255,0.14)",
    boxShadow: "0 0 18px rgba(0,0,0,0.35)",
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

  const [publicName, setPublicName] = useState<string>(() =>
    pickPublicName(trivia)
  );

  const [bg, setBg] = useState<string>(FALLBACK_BG);
  const [brightness, setBrightness] = useState<number>(
    trivia?.background_brightness ?? 100
  );

  // confetti state
  const [confetti, setConfetti] = useState<ConfettiParticle[]>([]);
  const [confettiKey, setConfettiKey] = useState(0);

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

  // live updates
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

        const top = baseRows.slice(0, 3);
        const podium: PodiumRow[] = [];

        if (top.length === 1) {
          podium.push({ placeLabel: "1st", rank: 1, ...top[0] });
        } else if (top.length === 2) {
          podium.push({ placeLabel: "2nd", rank: 2, ...top[1] });
          podium.push({ placeLabel: "1st", rank: 1, ...top[0] });
        } else if (top.length === 3) {
          podium.push({ placeLabel: "3rd", rank: 3, ...top[2] });
          podium.push({ placeLabel: "2nd", rank: 2, ...top[1] });
          podium.push({ placeLabel: "1st", rank: 1, ...top[0] });
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

  /* --- Step 3rd → 2nd → 1st every 10s, winner stays --- */
  useEffect(() => {
    if (!podiumRows.length) return;

    if (podiumRows.length === 1 || currentIndex >= podiumRows.length - 1) return;

    const id = window.setTimeout(() => {
      setCurrentIndex((prev) => Math.min(prev + 1, podiumRows.length - 1));
    }, STEP_DURATION_MS);

    return () => window.clearTimeout(id);
  }, [podiumRows, currentIndex]);

  const current = podiumRows[currentIndex] || null;
  const glow = getPodiumGlow(current?.placeLabel);

  // ✅ Confetti only when we land on 1st
  useEffect(() => {
    if (!current) return;
    if (current.placeLabel !== "1st") return;

    setConfettiKey((k) => k + 1);
    setConfetti(makeConfetti(36));

    const t = window.setTimeout(() => setConfetti([]), 2200);
    return () => window.clearTimeout(t);
  }, [current?.playerId, current?.placeLabel]);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* ✅ Background ONLY gets brightness */}
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

      {/* ✅ Vignette overlay (makes everything pop) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 1,
          background: `
            radial-gradient(circle at 50% 45%, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.50) 70%, rgba(0,0,0,0.72) 100%),
            linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.10) 30%, rgba(0,0,0,0.45) 100%)
          `,
        }}
      />

      {/* Foreground content (not dimmed) */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* TOP TITLE */}
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
          {/* ✅ Confetti overlay (only for 1st) */}
          <AnimatePresence>
            {confetti.length > 0 && (
              <motion.div
                key={`confetti-${confettiKey}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  zIndex: 50,
                }}
              >
                {confetti.map((p) => (
                  <motion.span
                    key={p.id}
                    initial={{
                      opacity: 0,
                      y: 0,
                      x: 0,
                      rotate: 0,
                    }}
                    animate={{
                      opacity: [0, p.opacity, 0],
                      y: 620,
                      x: p.drift,
                      rotate: p.rotate,
                    }}
                    transition={{
                      delay: p.delay,
                      duration: p.duration,
                      ease: "easeOut",
                    }}
                    style={{
                      position: "absolute",
                      top: "10%",
                      left: `${p.leftPct}%`,
                      width: `${p.size}px`,
                      height: `${Math.max(6, p.size * 0.6)}px`,
                      borderRadius: 2,
                      background: p.color,
                      boxShadow: "0 0 10px rgba(255,255,255,0.25)",
                      opacity: p.opacity,
                    }}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* LEFT PHOTO AREA */}
          <motion.div
            style={{
              position: "absolute",
              top: "4%",
              left: "2%",
              width: "46%",
              height: "92%",
              borderRadius: 18,
              overflow: "hidden",
              background: "rgba(0,0,0,0.4)",
              border: `6px solid ${glow.borderColor}`,
            }}
            // ✅ breathing glow
            animate={{
              boxShadow: [glow.baseShadow, glow.pulseShadow, glow.baseShadow],
            }}
            transition={{
              duration: 2.8,
              repeat: Infinity,
              ease: "easeInOut",
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

            {/* ✅ sheen sweep overlay (runs once per change) */}
            <AnimatePresence mode="wait">
              {current && (
                <motion.div
                  key={`sheen-${current.playerId}`}
                  initial={{ x: "-140%", opacity: 0 }}
                  animate={{ x: "140%", opacity: 0.33 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1.15, ease: "easeOut" }}
                  style={{
                    position: "absolute",
                    inset: "-20%",
                    background:
                      "linear-gradient(120deg, rgba(255,255,255,0) 35%, rgba(255,255,255,0.55) 50%, rgba(255,255,255,0) 65%)",
                    mixBlendMode: "screen",
                    pointerEvents: "none",
                  }}
                />
              )}
            </AnimatePresence>
          </motion.div>

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
                  key={`text-${current.playerId}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  style={{
                    marginTop: "1vh",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                  }}
                >
                  {/* ✅ staggered entrance */}
                  <motion.p
                    style={STYLE.placeText}
                    initial={{ opacity: 0, y: 18, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -14 }}
                    transition={{ duration: 0.5, ease: "easeOut", delay: 0.05 }}
                  >
                    {current.placeLabel.toUpperCase()} PLACE
                  </motion.p>

                  <motion.p
                    style={STYLE.name}
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -14 }}
                    transition={{ duration: 0.5, ease: "easeOut", delay: 0.18 }}
                  >
                    {current.name}
                  </motion.p>

                  <motion.p
                    style={STYLE.points}
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -14 }}
                    transition={{ duration: 0.5, ease: "easeOut", delay: 0.3 }}
                  >
                    {current.points} pts
                  </motion.p>
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
    </div>
  );
}
