"use client";

import { QRCodeCanvas } from "qrcode.react";
import { useEffect, useState } from "react";

/* ---------- TYPES ---------- */
interface TriviaInactiveWallProps {
  trivia: any;
}

/* ---------- FULLSCREEN ---------- */
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

/* ---------- COUNTDOWN COMPONENT ---------- */
function CountdownDisplay({
  countdown,
  countdownActive,
}: {
  countdown: string;
  countdownActive: boolean;
}) {
  const [timeLeft, setTimeLeft] = useState(0);
  const [active, setActive] = useState(false);

  useEffect(() => {
    // Default to 10 seconds if not provided
    const value =
      countdown && countdown !== "none" ? countdown : "10 seconds";

    const [numStr] = value.split(" ");
    const num = parseInt(numStr, 10);
    const total = isNaN(num) ? 10 : num;

    setTimeLeft(total);
    setActive(countdownActive);
  }, [countdown, countdownActive]);

  useEffect(() => {
    if (!active || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((t) => (t > 0 ? t - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [active, timeLeft]);

  const m = Math.floor(timeLeft / 60);
  const s = timeLeft % 60;

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

export default function TriviaInactiveWall({
  trivia,
}: TriviaInactiveWallProps) {
  const [bg, setBg] = useState(
    "linear-gradient(to bottom right,#1b2735,#090a0f)"
  );
  const [brightness, setBrightness] = useState(
    trivia?.background_brightness || 100
  );

  const [wallState, setWallState] = useState({
    countdown: "10 seconds",
    countdownActive: false,
    title: "",
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

  useEffect(() => {
    if (!trivia) return;

    setWallState({
      countdown: trivia.countdown || "10 seconds",

      // 🔑 THIS IS THE FIX — countdown only listens to countdown_active
      countdownActive: trivia.countdown_active === true,

      title: trivia.title || "",
    });

    const value =
      trivia.background_type === "image"
        ? `url(${trivia.background_value}) center/cover no-repeat`
        : trivia.background_value ||
          "linear-gradient(to bottom right,#1b2735,#090a0f)";

    setBg(value);
    setBrightness(trivia.background_brightness ?? 100);
  }, [trivia]);

  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://faninteract.vercel.app";

  const qrValue = `${origin}/trivia/${trivia?.id}/join`;

  /* ✅ LOGO PRIORITY (NO CHANGE) */
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
            />
          </div>
        </div>
      </div>

      {/* FULLSCREEN BUTTON */}
      <div
        onClick={toggleFullscreen}
        style={{
          position: "fixed",
          bottom: 28,
          right: 28,
          width: 42,
          height: 42,
          borderRadius: 12,
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          opacity: 0.45,
          zIndex: 999999,
        }}
      >
        ⛶
      </div>
    </div>
  );
}
