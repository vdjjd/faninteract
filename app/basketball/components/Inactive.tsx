"use client";

import { useEffect, useMemo, useState } from "react";

export default function InactiveBasketball({ game }: { game: any }) {
  const [origin, setOrigin] = useState<string>("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const joinUrl = useMemo(() => {
    if (!origin || !game?.id) return "";
    return `${origin}/basketball/${game.id}/submit`;
  }, [origin, game?.id]);

  const qrUrl = useMemo(() => {
    if (!joinUrl) return "";
    return `https://api.qrserver.com/v1/create-qr-code/?size=360x360&data=${encodeURIComponent(
      joinUrl
    )}`;
  }, [joinUrl]);

  async function goFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch {}
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundImage: "url('/bbgame1920x1080.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.75)",
        }}
      />

      <button
        onClick={goFullscreen}
        style={{
          position: "absolute",
          right: 18,
          bottom: 18,
          zIndex: 20,
          padding: "10px 14px",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.25)",
          background: "rgba(255,255,255,0.10)",
          color: "#fff",
          fontWeight: 900,
          cursor: "pointer",
        }}
      >
        Fullscreen
      </button>

      <div
        style={{
          position: "relative",
          zIndex: 10,
          width: "100%",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 40,
        }}
      >
        <div
          style={{
            width: "min(920px, 96vw)",
            borderRadius: 26,
            padding: 30,
            background: "rgba(0,0,0,0.55)",
            border: "1px solid rgba(255,255,255,0.18)",
            boxShadow: "0 0 40px rgba(0,0,0,0.65)",
            display: "grid",
            gridTemplateColumns: "1.2fr 0.8fr",
            gap: 24,
            alignItems: "center",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 44,
                fontWeight: 1000,
                color: "#fff",
                lineHeight: 1.05,
              }}
            >
              {game?.title || "Basketball Battle"}
            </div>

            <div
              style={{
                marginTop: 10,
                fontSize: 20,
                fontWeight: 900,
                color: "rgba(255,255,255,0.88)",
              }}
            >
              Scan to join • Take a selfie • Get approved • Swipe to shoot
            </div>

            <div
              style={{
                marginTop: 14,
                fontSize: 16,
                fontWeight: 800,
                color: "rgba(255,255,255,0.75)",
                lineHeight: 1.4,
              }}
            >
              You’ll be placed into one of <b>10 lanes</b>.
              <br />
              Make <b>3 straight 2-pointers</b> → unlock <b>3PT mode</b>.
              <br />
              Make <b>3 straight 3-pointers</b> → unlock <b>DUNK</b>.
            </div>

            {joinUrl && (
              <div
                style={{
                  marginTop: 16,
                  padding: 14,
                  borderRadius: 16,
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.14)",
                  color: "rgba(255,255,255,0.82)",
                  fontWeight: 800,
                  wordBreak: "break-all",
                }}
              >
                {joinUrl}
              </div>
            )}
          </div>

          <div style={{ textAlign: "center" }}>
            {qrUrl ? (
              <img
                src={qrUrl}
                alt="QR"
                style={{
                  width: 320,
                  height: 320,
                  borderRadius: 18,
                  background: "#fff",
                  padding: 10,
                }}
              />
            ) : (
              <div style={{ color: "#fff" }}>Loading QR…</div>
            )}

            <div
              style={{
                marginTop: 14,
                fontSize: 18,
                fontWeight: 1000,
                color: "#ffd166",
                letterSpacing: 0.3,
              }}
            >
              WAITING FOR ACTIVATION
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
