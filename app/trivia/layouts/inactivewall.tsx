"use client";

import { QRCodeCanvas } from "qrcode.react";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

const supabase = getSupabaseClient();

/* ---------- TYPES ---------- */
interface TriviaInactiveWallProps {
  trivia: any;
}

/* ---------- COUNTDOWN COMPONENT (DB-synced) ---------- */
function CountdownDisplay({
  countdown,
  countdownActive,
  countdownStartedAt,
}: {
  countdown: string;
  countdownActive: boolean;
  countdownStartedAt?: string | null;
}) {
  const [now, setNow] = useState<number>(() => Date.now());

  // Parse "10 seconds" → 10
  const totalSeconds = useMemo(() => {
    const value =
      countdown && countdown !== "none" ? countdown : "10 seconds";

    const [numStr] = value.split(" ");
    const num = parseInt(numStr, 10);
    return isNaN(num) ? 10 : num;
  }, [countdown]);

  useEffect(() => {
    if (!countdownActive || !countdownStartedAt) return;

    const id = setInterval(() => {
      setNow(Date.now());
    }, 250);

    return () => clearInterval(id);
  }, [countdownActive, countdownStartedAt]);

  if (!countdownActive || !countdownStartedAt) {
    // Not in countdown yet → show full time as a static value
    const mFull = Math.floor(totalSeconds / 60);
    const sFull = totalSeconds % 60;
    return (
      <div
        style={{
          fontSize: "clamp(6rem,8vw,9rem)",
          fontWeight: 900,
          color: "#fff",
          textShadow: "0 0 40px rgba(0,0,0,0.7)",
        }}
      >
        {mFull}:{sFull.toString().padStart(2, "0")}
      </div>
    );
  }

  const startMs = new Date(countdownStartedAt).getTime();
  const elapsed = Math.max(0, (now - startMs) / 1000);
  const remaining = Math.max(0, totalSeconds - elapsed);

  const m = Math.floor(remaining / 60);
  const s = Math.floor(remaining % 60);

  return (
    <div
      style={{
        fontSize: "clamp(6rem,8vw,9rem)",
        fontWeight: 900,
        color: "#fff",
        textShadow: "0 0 40px rgba(0,0,0,0.7)",
      }}
    >
      {m}:{s.toString().padStart(2, "0")}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 🎮 TRIVIA INACTIVE WALL                                                     */
/* -------------------------------------------------------------------------- */

const FALLBACK_BG = "linear-gradient(to bottom right,#1b2735,#090a0f)";

export default function TriviaInactiveWall({
  trivia,
}: TriviaInactiveWallProps) {
  const [bg, setBg] = useState<string>(FALLBACK_BG);
  const [brightness, setBrightness] = useState<number>(100);

  const [wallState, setWallState] = useState({
    countdown: trivia?.countdown || "10 seconds",
    countdownActive: trivia?.countdown_active === true,
    countdownStartedAt: trivia?.countdown_started_at || null,
    title: trivia?.title || "",
  });

  /* 🌟 Pulse animation */
  const PulseStyle = (
    <style>{`
      @keyframes pulseSoonGlow {
        0%,100% { opacity:.7; text-shadow:0 0 14px rgba(255,255,255,0.3); }
        50% { opacity:1; text-shadow:0 0 22px rgba(180,220,255,0.8); }
      }
      .pulseSoon { animation:pulseSoonGlow 2.5s ease-in-out infinite; }
    `}</style>
  );

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

  // Initial props → local state
  useEffect(() => {
    if (!trivia) return;

    setWallState({
      countdown: trivia.countdown || "10 seconds",
      countdownActive: trivia.countdown_active === true,
      countdownStartedAt: trivia.countdown_started_at || null,
      title: trivia.title || "",
    });

    applyBackgroundFromRow(trivia);
  }, [trivia]);

  // 🔁 Live updates from DB (keeps countdown + background in sync)
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
            countdown: next.countdown || prev.countdown || "10 seconds",
            countdownActive: next.countdown_active === true,
            countdownStartedAt: next.countdown_started_at || null,
            title: next.title ?? prev.title,
          }));

          applyBackgroundFromRow(next);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [trivia?.id]);

  /* 🔗 BUILD QR URL → straight to signup with host + redirect */
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://faninteract.vercel.app";

  // Where they should land AFTER signup (the join page)
  const redirectPath = trivia?.id ? `/trivia/${trivia.id}/join` : "";
  const encodedRedirect = encodeURIComponent(redirectPath);

  // Host UUID for signup. Prefer a direct host_id column, else nested host.id
  const hostParam =
    (trivia as any)?.host_id ||
    (trivia as any)?.host?.id ||
    "";

  // Final QR value → hits signup directly, passes trivia + host + redirect
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
    <div
      style={{
        background: bg,
        filter: `brightness(${brightness}%)`,
        width: "100%",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        overflow: "hidden",
        position: "relative",
        paddingTop: "3vh",
      }}
    >
      {PulseStyle}

      {/* Title */}
      <h1
        style={{
          color: "#fff",
          fontSize: "clamp(2.5rem,4vw,5rem)",
          fontWeight: 900,
          marginBottom: "1vh",
          textShadow: `
            2px 2px 2px #000,
            -2px 2px 2px #000,
            2px -2px 2px #000,
            -2px -2px 2px #000
          `,
        }}
      >
        {wallState.title || "Trivia Game"}
      </h1>

      {/* Main Panel */}
      <div
        style={{
          width: "90vw",
          height: "78vh",
          maxWidth: "1800px",
          aspectRatio: "16 / 9",
          background: "rgba(255,255,255,0.08)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 24,
          position: "relative",
          overflow: "hidden",
          display: "flex",
        }}
      >
        {/* QR SECTION */}
        <div
          style={{
            position: "absolute",
            top: "5%",
            left: "3%",
            width: "47%",
            height: "90%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <QRCodeCanvas
            value={qrValue}
            size={1000}
            level="H"
            style={{ width: "100%", height: "100%" }}
          />
        </div>

        {/* TEXT + LOGO AREA */}
        <div
          style={{
            position: "relative",
            flexGrow: 1,
            marginLeft: "44%",
          }}
        >
          {/* LOGO */}
          <div
            style={{
              position: "absolute",
              top: "2%",
              left: "53%",
              transform: "translateX(-50%)",
              width: "clamp(300px,27vw,400px)",
              height: "clamp(300px,12vw,260px)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              overflow: "hidden",
            }}
          >
            <img
              src={displayLogo}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                filter: "drop-shadow(0 0 12px rgba(0,0,0,0.6))",
              }}
            />
          </div>

          {/* GREY DIVIDER — UNTOUCHED */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "53%",
              transform: "translateX(-50%)",
              width: "75%",
              height: "1.4vh",
              borderRadius: 6,
              background: "linear-gradient(to right,#000,#444)",
            }}
          />

          {/* MAIN TEXT */}
          <p
            style={{
              position: "absolute",
              top: "56%",
              left: "53%",
              transform: "translateX(-50%)",
              color: "#fff",
              fontSize: "clamp(2em,3.5vw,6rem)",
              fontWeight: 900,
              textAlign: "center",
              textShadow: "0 0 14px rgba(0,0,0,0.6)",
            }}
          >
            Trivia Game
          </p>

          {/* STARTING SOON */}
          <p
            className="pulseSoon"
            style={{
              position: "absolute",
              top: "67%",
              left: "53%",
              transform: "translateX(-50%)",
              color: "#bcd9ff",
              fontSize: "clamp(2.8rem,2.4vw,3.2rem)",
              fontWeight: 700,
              textAlign: "center",
              margin: 0,
            }}
          >
            Starting Soon!!
          </p>

          {/* COUNTDOWN */}
          <div
            style={{
              position: "absolute",
              top: "73%",
              left: "53%",
              transform: "translateX(-50%)",
            }}
          >
            <CountdownDisplay
              countdown={wallState.countdown}
              countdownActive={wallState.countdownActive}
              countdownStartedAt={wallState.countdownStartedAt}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
