"use client";

import { QRCodeCanvas } from "qrcode.react";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

interface GameHost {
  branding_logo_url?: string | null;
  logo_url?: string | null;
}

interface GameType {
  id: number;
  title?: string;
  countdown: string | null;
  countdown_active: boolean | null;
  background_brightness?: number | null;
  host?: GameHost | null;
}

interface InactiveBasketballProps {
  game: GameType;
}

export default function InactiveBasketballPage({ game }: InactiveBasketballProps) {
  const updateTimeout = useRef<NodeJS.Timeout | null>(null);

  /* ------------------------------------------------------------
     ALWAYS USE YOUR NEW BACKGROUND IMAGE
  ------------------------------------------------------------ */
  const FIXED_BACKGROUND = `url('/bbgame1920x1080.png') center/cover no-repeat`;

  const [brightness, setBrightness] = useState(game?.background_brightness ?? 100);

  /* ------------------------------------------------------------
     POLL ONLY FOR BRIGHTNESS — BACKGROUND NEVER CHANGES
  ------------------------------------------------------------ */
  useEffect(() => {
    if (!game?.id) return;

    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("bb_games")
        .select("background_brightness")
        .eq("id", game.id)
        .single();

      if (!data) return;

      if (updateTimeout.current) clearTimeout(updateTimeout.current);
      updateTimeout.current = setTimeout(() => {
        setBrightness(data.background_brightness ?? 100);
      }, 50);
    }, 2000);

    return () => clearInterval(interval);
  }, [game?.id]);

  /* ------------------------------------------------------------
     QR + LOGO
  ------------------------------------------------------------ */
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://faninteract.vercel.app";

  const qrValue = `${origin}/guest/signup?basketball=${game.id}`;

  const displayLogo =
    game?.host?.branding_logo_url?.trim()
      ? game.host.branding_logo_url
      : game?.host?.logo_url?.trim()
      ? game.host.logo_url
      : "/faninteractlogo.png";

  const toggleFullscreen = () =>
    !document.fullscreenElement
      ? document.documentElement.requestFullscreen()
      : document.exitFullscreen();

  const logoContainerStyle: React.CSSProperties = {
    position: "absolute",
    top: "2%",
    left: "53%",
    transform: "translateX(-50%)",
    width: "clamp(300px,27vw,400px)",
    height: "clamp(300px,12vw,260px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  return (
    <div
      style={{
        background: FIXED_BACKGROUND,
        filter: `brightness(${brightness}%)`,
        width: "100%",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: "3vh",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* TITLE */}
      <h1
        style={{
          color: "#fff",
          fontSize: "clamp(2.5rem,4vw,5rem)",
          fontWeight: 900,
          whiteSpace: "nowrap",
          textShadow: `
            -2px -2px 0 #000,
            2px -2px 0 #000,
            -2px 2px 0 #000,
            2px 2px 0 #000,
            0 0 12px rgba(0,0,0,0.8)
          `,
          marginBottom: "1vh",
        }}
      >
        {game?.title || "Basketball Battle"}
      </h1>

      {/* MAIN PANEL */}
      <div
        style={{
          width: "90vw",
          height: "78vh",
          maxWidth: "1800px",
          aspectRatio: "16/9",
          background: "rgba(255,255,255,0.08)",
          backdropFilter: "blur(20px)",
          borderRadius: 24,
          position: "relative",
          display: "flex",
          overflow: "hidden",
        }}
      >
        {/* LEFT — QR */}
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
            bgColor="#fff"
            fgColor="#000"
            level="H"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              borderRadius: 18,
            }}
          />
        </div>

        {/* RIGHT SIDE */}
        <div style={{ flexGrow: 1, marginLeft: "44%", position: "relative" }}>
          <div style={logoContainerStyle}>
            <img
              src={displayLogo}
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          </div>

          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "53%",
              transform: "translateX(-50%)",
              width: "75%",
              height: "1.4vh",
              background: "linear-gradient(to right,#000,#444)",
            }}
          />

          <p
            style={{
              position: "absolute",
              top: "56%",
              left: "53%",
              transform: "translateX(-50%)",
              color: "#fff",
              fontSize: "clamp(2em,3.5vw,6rem)",
              fontWeight: 900,
              whiteSpace: "nowrap",
              textShadow: `
                -2px -2px 0 #000,
                2px -2px 0 #000,
                -2px 2px 0 #000,
                2px 2px 0 #000
              `,
            }}
          >
            Basketball Battle
          </p>

          <p
            style={{
              position: "absolute",
              top: "67%",
              left: "53%",
              transform: "translateX(-50%)",
              color: "#bcd9ff",
              fontWeight: 700,
              fontSize: "clamp(1.6rem,2.5vw,3.2rem)",
              animation: "pulse 2.4s infinite",
              textShadow: `
                -1px -1px 0 #000,
                1px -1px 0 #000,
                -1px 1px 0 #000,
                1px 1px 0 #000
              `,
            }}
          >
            Starting Soon!!
          </p>

          <style>{`
            @keyframes pulse {
              0%,100% { opacity: .7 }
              50% { opacity: 1 }
            }
          `}</style>
        </div>
      </div>

      {/* FULLSCREEN BUTTON */}
      <div
        onClick={toggleFullscreen}
        style={{
          position: "absolute",
          bottom: "2vh",
          right: "2vw",
          width: 42,
          height: 42,
          borderRadius: 12,
          background: "rgba(255,255,255,0.1)",
          border: "1px solid rgba(255,255,255,0.25)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
        }}
      >
        ⛶
      </div>
    </div>
  );
}
