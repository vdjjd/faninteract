"use client";

import React, { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";

import InactiveWall from "@/app/trivia/layouts/inactivewall";
import TriviaActiveWall from "@/app/trivia/layouts/TriviaActiveWall";

const supabase = getSupabaseClient();

const STAGE_W = 1920;
const STAGE_H = 1080;

export default function TriviaWallPage() {
  const { triviaId } = useParams();
  const [trivia, setTrivia] = useState<any>(null);

  // Fullscreen container (router-level)
  const wallRef = useRef<HTMLDivElement | null>(null);

  // Viewport for stage scaling (ACTIVE ONLY)
  const [vw, setVw] = useState(0);
  const [vh, setVh] = useState(0);

  useEffect(() => {
    // prevent any scrollbars/margins that can throw centering off
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.margin = "0";

    const onResize = () => {
      setVw(window.innerWidth);
      setVh(window.innerHeight);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /* ------------------------------------------------------------
     POLLING — trivia_cards + host (via host_id)
  ------------------------------------------------------------ */
  useEffect(() => {
    if (!triviaId) return;

    let alive = true;

    async function fetchTrivia() {
      const { data: triviaRow, error: triviaErr } = await supabase
        .from("trivia_cards")
        .select("*")
        .eq("id", triviaId)
        .single();

      if (triviaErr) {
        console.error("❌ trivia_cards fetch error:", triviaErr);
        if (alive) setTrivia(null);
        return;
      }

      let host: any = null;

      if (triviaRow?.host_id) {
        const { data: hostRow, error: hostErr } = await supabase
          .from("hosts")
          .select("id, venue_name, branding_logo_url, logo_url")
          .eq("id", triviaRow.host_id)
          .maybeSingle();

        if (hostErr) console.error("❌ hosts fetch error:", hostErr);
        else host = hostRow;
      }

      if (alive) {
        setTrivia({
          ...triviaRow,
          host,
        });
      }
    }

    fetchTrivia();
    const interval = setInterval(fetchTrivia, 1000);

    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [triviaId]);

  /* ------------------------------------------------------------
     FULLSCREEN HANDLER (router-level)
  ------------------------------------------------------------ */
  const toggleFullscreen = async () => {
    const el = wallRef.current;
    if (!el) return;

    try {
      if (!document.fullscreenElement) {
        await (el as any)
          .requestFullscreen?.({ navigationUI: "hide" } as any)
          .catch((err: any) => console.error("❌ Fullscreen failed:", err));
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error("🔥 Fullscreen error:", err);
    }
  };

  if (!trivia) return null;

  const isInactive =
    trivia.status === "inactive" ||
    trivia.countdown_active === true ||
    trivia.status === "finished";

  // ✅ ACTIVE-ONLY: COVER scale 1920x1080 (fills screen, crops overflow)
  const scale = vw && vh ? Math.max(vw / STAGE_W, vh / STAGE_H) : 1;
  const stageLeft = (vw - STAGE_W * scale) / 2;
  const stageTop = (vh - STAGE_H * scale) / 2;

  return (
    <div
      ref={wallRef}
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: "#000",
      }}
    >
      {/* ✅ INACTIVE WALL: unchanged (no stage wrapper, no router bg layers) */}
      {isInactive && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
          }}
        >
          <InactiveWall trivia={trivia} />
        </div>
      )}

      {/* ✅ ACTIVE WALL: stage model wrapper only */}
      {!isInactive && (
        <div style={{ position: "absolute", inset: 0, zIndex: 2 }}>
          {/* This wrapper handles 1920×1080 placement/scale only */}
          <div
            style={{
              position: "absolute",
              left: stageLeft,
              top: stageTop,
              width: STAGE_W,
              height: STAGE_H,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          >
            <TriviaActiveWall trivia={trivia} />
          </div>
        </div>
      )}

      {/* FULLSCREEN BUTTON (shared) */}
      <div
        style={{
          position: "fixed",
          bottom: "30px",
          right: "30px",
          width: 40,
          height: 40,
          borderRadius: 12,
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          opacity: 0.35,
          transition: "opacity 0.2s ease",
          zIndex: 999999999,
          userSelect: "none",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.35")}
        onClick={toggleFullscreen}
        title="Fullscreen"
      >
        ⛶
      </div>
    </div>
  );
}
