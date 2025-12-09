"use client";

import { QRCodeCanvas } from "qrcode.react";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function InactiveWall({ game }: { game: any }) {
  const updateTimeout = useRef<NodeJS.Timeout | null>(null);

  const FIXED_BACKGROUND = "/bbgame1920x1080.png";

  const [brightness, setBrightness] = useState<number>(
    game?.background_brightness ?? 100
  );

  const [hostData, setHostData] = useState<any>(null);
  const [showStartingSoon, setShowStartingSoon] = useState(true);

  /* ---------------------------------------------------------
     LOAD HOST LOGO
  --------------------------------------------------------- */
  useEffect(() => {
    if (!game?.host_id) return;

    supabase
      .from("hosts")
      .select("logo_url, branding_logo_url")
      .eq("id", game.host_id)
      .single()
      .then(({ data }) => {
        setHostData(data);
      });
  }, [game?.host_id]);

  /* ---------------------------------------------------------
     REALTIME SUBSCRIPTION — reacts instantly to DB changes
  --------------------------------------------------------- */
  useEffect(() => {
    if (!game?.id) return;

    const channel = supabase
      .channel(`inactive-wall-${game.id}`)
      .on(
        "postgres_changes",
        {
          schema: "public",
          table: "bb_games",
          event: "*",
          filter: `id=eq.${game.id}`,
        },
        (payload) => {
          const updated = payload.new as any; // 👈 FIXED typing here

          console.log("📡 LIVE WALL UPDATE", updated);

          // Sync brightness
          if (updated.background_brightness !== undefined) {
            setBrightness(updated.background_brightness);
          }

          // When wall becomes active or countdown starts → hide "Starting Soon"
          if (updated.wall_active === true || updated.game_running === true) {
            setShowStartingSoon(false);
          }
        }
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, [game?.id]);

  /* ---------------------------------------------------------
     LISTEN FOR DASHBOARD start_countdown → hide "Starting Soon"
  --------------------------------------------------------- */
  useEffect(() => {
    function handleMsg(e: MessageEvent) {
      if (e.data?.type === "start_countdown") {
        setShowStartingSoon(false);
      }
    }
    window.addEventListener("message", handleMsg);
    return () => window.removeEventListener("message", handleMsg);
  }, []);

  /* ---------------------------------------------------------
     QR CODE VALUES
  --------------------------------------------------------- */
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://faninteract.com";

  const qrValue = `${origin}/guest/signup?basketball=${game.id}`;

  /* ---------------------------------------------------------
     HOST LOGO CHOOSER
  --------------------------------------------------------- */
  const displayLogo =
    hostData?.branding_logo_url?.trim()
      ? hostData.branding_logo_url
      : hostData?.logo_url?.trim()
      ? hostData.logo_url
      : "/faninteractlogo.png";

  const toggleFullscreen = () =>
    !document.fullscreenElement
      ? document.documentElement.requestFullscreen()
      : document.exitFullscreen();

  /* ---------------------------------------------------------
     RENDER UI
  --------------------------------------------------------- */
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        backgroundImage: `url(${FIXED_BACKGROUND})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        filter: `brightness(${brightness}%)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: "3vh",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* TITLE */}
      <h1
        style={{
          color: "#fff",
          fontSize: "clamp(2.5rem,4vw,5rem)",
          fontWeight: 900,
          whiteSpace: "nowrap",
          textShadow:
            "-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000,2px 2px 0 #000",
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
          display: "flex",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* LEFT QR CODE */}
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
              borderRadius: 18,
            }}
          />
        </div>

        {/* RIGHT CONTENT AREA */}
        <div style={{ flexGrow: 1, marginLeft: "44%", position: "relative" }}>
          {/* HOST LOGO */}
          <div
            style={{
              position: "absolute",
              top: "2%",
              left: "53%",
              transform: "translateX(-50%)",
              width: "clamp(300px,27vw,400px)",
              height: "clamp(300px,12vw,260px)",
            }}
          >
            <img
              src={displayLogo}
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          </div>

          {/* BLACK BAR */}
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

          {/* GLASS TITLE */}
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
              textShadow:
                "-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000,2px 2px 0 #000",
            }}
          >
            Basketball Battle
          </p>

          {/* STARTING SOON (auto hides when countdown starts) */}
          {showStartingSoon && (
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
              }}
            >
              Starting Soon!!
            </p>
          )}

          {/* Pulse animation */}
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
