"use client";

import { QRCodeCanvas } from "qrcode.react";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { getSupabaseClient } from "@/lib/supabaseClient";

const supabase = getSupabaseClient();

/* ---------- TYPES ---------- */
interface TriviaInactiveWallProps {
  trivia: any;
}

/* ---------- Helpers ---------- */
const FALLBACK_BG = "linear-gradient(to bottom right,#1b2735,#090a0f)";

function parseCountdownSeconds(row: any): number {
  if (typeof row?.countdown_seconds === "number" && row.countdown_seconds > 0) {
    return row.countdown_seconds;
  }

  const raw = String(row?.countdown || "10 seconds").trim().toLowerCase();
  const parts = raw.split(/\s+/);
  const n = parseInt(parts[0] || "10", 10);
  if (Number.isNaN(n)) return 10;

  const unit = parts[1] || "seconds";
  if (unit.startsWith("min")) return n * 60;
  return n;
}

function pickPublicName(row: any): string {
  const pn = String(row?.public_name || "").trim();
  if (pn) return pn;

  const t = String(row?.title || "").trim();
  if (t) return t;

  return "Trivia Game";
}

/* ---------- COUNTDOWN COMPONENT (DB-synced + server-time synced) ---------- */
function CountdownDisplay({
  totalSeconds,
  countdownActive,
  countdownStartedAt,
  serverOffsetMs,
}: {
  totalSeconds: number;
  countdownActive: boolean;
  countdownStartedAt?: string | null;
  serverOffsetMs: number;
}) {
  const [now, setNow] = useState<number>(() => Date.now());
  const [lastWhole, setLastWhole] = useState<number | null>(null);

  useEffect(() => {
    if (!countdownActive || !countdownStartedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [countdownActive, countdownStartedAt]);

  // compute remaining
  const { m, s, wholeRemaining } = useMemo(() => {
    if (!countdownActive || !countdownStartedAt) {
      const mFull = Math.floor(totalSeconds / 60);
      const sFull = totalSeconds % 60;
      return { m: mFull, s: sFull, wholeRemaining: totalSeconds };
    }
    const startMs = new Date(countdownStartedAt).getTime();
    const nowMs = now + serverOffsetMs;
    const elapsed = Math.max(0, (nowMs - startMs) / 1000);
    const remaining = Math.max(0, totalSeconds - elapsed);

    const mm = Math.floor(remaining / 60);
    const ss = Math.floor(remaining % 60);
    return { m: mm, s: ss, wholeRemaining: Math.ceil(remaining) };
  }, [countdownActive, countdownStartedAt, now, serverOffsetMs, totalSeconds]);

  // tick pop on each whole second change (can be used for effects)
  useEffect(() => {
    if (!countdownActive) return;
    if (lastWhole === null) {
      setLastWhole(wholeRemaining);
      return;
    }
    if (wholeRemaining !== lastWhole) {
      setLastWhole(wholeRemaining);
    }
  }, [wholeRemaining, countdownActive, lastWhole]);

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={`${m}:${s}`}
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.06 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          style={{
            fontSize: "clamp(4rem,6vw,7.5rem)",
            fontWeight: 900,
            color: "#fff",
            textShadow:
              "0 0 40px rgba(0,0,0,0.75), 0 0 18px rgba(90,160,255,0.25)",
            letterSpacing: "0.02em",
          }}
        >
          {m}:{s.toString().padStart(2, "0")}
        </motion.div>
      </AnimatePresence>

      {/* subtle underline glow */}
      <div
        style={{
          position: "absolute",
          left: "8%",
          right: "8%",
          bottom: "-10px",
          height: 6,
          borderRadius: 999,
          background:
            "linear-gradient(90deg, rgba(255,255,255,0), rgba(160,210,255,0.55), rgba(255,255,255,0))",
          filter: "blur(0.5px)",
          opacity: 0.65,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 🎮 TRIVIA INACTIVE WALL                                                     */
/* -------------------------------------------------------------------------- */
export default function TriviaInactiveWall({ trivia }: TriviaInactiveWallProps) {
  const [bg, setBg] = useState<string>(FALLBACK_BG);
  const [brightness, setBrightness] = useState<number>(100);

  // server-time offset
  const [serverOffsetMs, setServerOffsetMs] = useState<number>(0);

  const [wallState, setWallState] = useState({
    countdownSeconds: parseCountdownSeconds(trivia),
    countdownActive: trivia?.countdown_active === true,
    countdownStartedAt: trivia?.countdown_started_at || null,
    publicName: pickPublicName(trivia),
  });

  const applyBackgroundFromRow = (row: any) => {
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

  /* ---------------------------------------------------------
     Server clock sync (locks countdown timing to phones)
  --------------------------------------------------------- */
  useEffect(() => {
    if (!trivia?.id) return;

    let cancelled = false;

    async function syncServerTime() {
      try {
        const t0 = Date.now();
        const { data, error } = await supabase.rpc("server_time");
        const t1 = Date.now();

        if (cancelled) return;
        if (error || !data) return;

        const serverMs = new Date(data as any).getTime();
        const rtt = t1 - t0;
        const estimatedNow = t1 - rtt / 2;
        setServerOffsetMs(serverMs - estimatedNow);
      } catch {
        // ignore
      }
    }

    syncServerTime();
    const id = window.setInterval(syncServerTime, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [trivia?.id]);

  // Initial props → local state
  useEffect(() => {
    if (!trivia) return;

    setWallState({
      countdownSeconds: parseCountdownSeconds(trivia),
      countdownActive: trivia.countdown_active === true,
      countdownStartedAt: trivia.countdown_started_at || null,
      publicName: pickPublicName(trivia),
    });

    applyBackgroundFromRow(trivia);
  }, [trivia]);

  // Live updates from DB
  useEffect(() => {
    if (!trivia?.id) return;

    const channel = supabase
      .channel(`inactive-wall-trivia-${trivia.id}`)
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

          setWallState((prev) => ({
            ...prev,
            countdownSeconds: parseCountdownSeconds(next),
            countdownActive: next.countdown_active === true,
            countdownStartedAt: next.countdown_started_at || null,
            publicName: pickPublicName(next) || prev.publicName,
          }));

          applyBackgroundFromRow(next);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [trivia?.id]);

  /* 🔗 BUILD QR URL */
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://faninteract.vercel.app";

  const redirectPath = trivia?.id ? `/trivia/${trivia.id}/join` : "";
  const encodedRedirect = encodeURIComponent(redirectPath);

  const hostParam = (trivia as any)?.host_id || (trivia as any)?.host?.id || "";

  const qrValue = `${origin}/guest/signup?trivia=${
    trivia?.id || ""
  }&host=${hostParam}&redirect=${encodedRedirect}`;

  /* ✅ LOGO PRIORITY */
  const displayLogo =
    trivia?.host?.branding_logo_url?.trim() ||
    trivia?.host?.logo_url?.trim() ||
    "/faninteractlogo.png";

  if (!trivia) return <div>Loading Trivia…</div>;

  return (
    <>
      {/* Root wrapper */}
      <div
        style={{
          width: "100vw",
          height: "100vh",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Background */}
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

        {/* Vignette */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 1,
            background: `
              radial-gradient(circle at 50% 45%, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0.58) 72%, rgba(0,0,0,0.82) 100%),
              linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.05) 35%, rgba(0,0,0,0.45) 100%)
            `,
          }}
        />

        {/* Grain */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 2,
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

        {/* Foreground content */}
        <div
          style={{
            position: "relative",
            zIndex: 3,
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "flex-start",
            paddingTop: "3vh",
          }}
        >
          {/* Title */}
          <h1
            style={{
              color: "#fff",
              fontSize: "clamp(2.5rem,4vw,5rem)",
              fontWeight: 900,
              marginBottom: "1.5vh",
              textShadow: `
                2px 2px 2px #000,
                -2px 2px 2px #000,
                2px -2px 2px #000,
                -2px -2px 2px #000
              `,
              textAlign: "center",
              padding: "0 2vw",
            }}
          >
            {wallState.publicName}
          </h1>

          {/* Main 16:9 Panel */}
          <div
            style={{
              width: "92vw",
              maxWidth: "1800px",
              aspectRatio: "16 / 9",
              background: "rgba(255,255,255,0.08)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 24,
              position: "relative",
              overflow: "hidden",
              boxShadow: "0 25px 90px rgba(0,0,0,0.35)",
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.05fr) minmax(0, 1fr)",
              padding: "2.5vh 3vw",
              columnGap: "2.5vw",
              alignItems: "stretch",
            }}
          >
            {/* Glass depth */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03) 35%, rgba(0,0,0,0.08) 100%)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10)",
                zIndex: 0,
              }}
            />

            {/* LEFT: QR */}
            <div
              style={{
                position: "relative",
                zIndex: 2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: "100%",
                  maxWidth: "100%",
                  height: "100%",
                  borderRadius: 28,
                  padding: "14px",
                  background: "rgba(255,255,255,0.10)",
                  border: "1px solid rgba(255,255,255,0.18)",
                  boxShadow:
                    "0 0 24px rgba(255,255,255,0.10), 0 0 60px rgba(70,140,255,0.10)",
                  position: "relative",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div className="fi-qr-sheen" />

                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    borderRadius: 18,
                    overflow: "hidden",
                    background: "#fff",
                  }}
                >
                  <QRCodeCanvas
                    value={qrValue}
                    size={1000}
                    level="H"
                    style={{ width: "100%", height: "100%", display: "block" }}
                  />
                </div>
              </div>
            </div>

            {/* RIGHT: Logo + Text + Timer */}
            <div
              style={{
                position: "relative",
                zIndex: 2,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "1vh 1vw 2vh",
                gap: "1.6vh",
              }}
            >
              {/* Logo */}
              <div
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingTop: "0.5vh",
                  paddingBottom: "0.5vh",
                }}
              >
                <div
                  style={{
                    width: "clamp(220px, 80%, 420px)",
                    maxHeight: "clamp(130px, 18vh, 260px)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <img
                    src={displayLogo}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                      filter: "drop-shadow(0 0 12px rgba(0,0,0,0.6))",
                      animation: "fiLogoBreathe 3.5s ease-in-out infinite",
                    }}
                  />
                </div>
              </div>

              {/* Middle: Grey bar + "Trivia Game" */}
              <div
                style={{
                  width: "100%",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "1.4vh",
                  marginTop: "0.5vh",
                  marginBottom: "0.5vh",
                }}
              >
                {/* Grey divider */}
                <div
                  style={{
                    width: "75%",
                    height: "1.4vh",
                    borderRadius: 6,
                    background: "linear-gradient(to right,#000,#444)",
                  }}
                />

                <p
                  style={{
                    color: "#fff",
                    fontSize: "clamp(1.6rem, 2.8vw, 3.4rem)",
                    fontWeight: 900,
                    textAlign: "center",
                    margin: 0,
                    textShadow: "0 0 14px rgba(0,0,0,0.6)",
                  }}
                >
                  Trivia Game
                </p>
              </div>

              {/* "Starting Soon" + Timer */}
              <div
                style={{
                  width: "100%",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: "1.2vh",
                  paddingBottom: "1vh",
                  flexGrow: 1,
                }}
              >
                <p
                  style={{
                    color: "#bcd9ff",
                    fontSize: "clamp(1.4rem, 2.1vw, 2.6rem)",
                    fontWeight: 700,
                    textAlign: "center",
                    margin: 0,
                    textShadow: "0 0 18px rgba(90,160,255,0.35)",
                  }}
                >
                  <span className="fi-starting-soon">Starting Soon!!</span>
                </p>

                <CountdownDisplay
                  totalSeconds={wallState.countdownSeconds}
                  countdownActive={wallState.countdownActive}
                  countdownStartedAt={wallState.countdownStartedAt}
                  serverOffsetMs={serverOffsetMs}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Animations */}
      <style>{`
        /* QR sheen sweep */
        .fi-qr-sheen {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.45;
          background: linear-gradient(
            120deg,
            rgba(255,255,255,0) 40%,
            rgba(255,255,255,0.18) 50%,
            rgba(255,255,255,0) 60%
          );
          transform: translateX(-140%);
          animation: fiQrSheen 3.2s ease-in-out infinite;
          mix-blend-mode: screen;
        }
        @keyframes fiQrSheen {
          0% { transform: translateX(-140%); }
          55% { transform: translateX(140%); }
          100% { transform: translateX(140%); }
        }

        /* Starting soon shimmer */
        .fi-starting-soon {
          position: relative;
          display: inline-block;
          animation: fiSoonGlow 2.6s ease-in-out infinite;
        }
        .fi-starting-soon::after {
          content: "";
          position: absolute;
          top: 0;
          bottom: 0;
          width: 55%;
          left: -65%;
          background: linear-gradient(
            90deg,
            rgba(255,255,255,0),
            rgba(255,255,255,0.22),
            rgba(255,255,255,0)
          );
          filter: blur(0.5px);
          opacity: 0.65;
          animation: fiSoonShine 2.8s ease-in-out infinite;
          pointer-events: none;
        }
        @keyframes fiSoonGlow {
          0%,100% { opacity: 0.78; text-shadow: 0 0 14px rgba(180,220,255,0.35); }
          50% { opacity: 1; text-shadow: 0 0 26px rgba(180,220,255,0.80); }
        }
        @keyframes fiSoonShine {
          0% { transform: translateX(0%); }
          55% { transform: translateX(240%); }
          100% { transform: translateX(240%); }
        }

        /* Logo breathe */
        @keyframes fiLogoBreathe {
          0%   { filter: drop-shadow(0 0 12px rgba(0,0,0,0.65)) drop-shadow(0 0 0px rgba(80,150,255,0.0)); }
          50%  { filter: drop-shadow(0 0 14px rgba(0,0,0,0.65)) drop-shadow(0 0 18px rgba(80,150,255,0.22)); }
          100% { filter: drop-shadow(0 0 12px rgba(0,0,0,0.65)) drop-shadow(0 0 0px rgba(80,150,255,0.0)); }
        }
      `}</style>
    </>
  );
}
