"use client";

import React, { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";

import InactiveWall from "@/app/trivia/layouts/inactivewall";
import TriviaActiveWall from "@/app/trivia/layouts/TriviaActiveWall";

const supabase = getSupabaseClient();

type TriviaSessionRow = {
  id: string;
  status: string; // "waiting" | "running" | "finished" etc
  current_question: number | null;
  question_started_at: string | null;
  created_at: string;
};

export default function TriviaWallPage() {
  const params = useParams<{ triviaId: string }>();
  const triviaId = params?.triviaId;

  const [trivia, setTrivia] = useState<any>(null);

  // 🔥 Fullscreen container (same pattern as FanWallPage)
  const wallRef = useRef<HTMLDivElement | null>(null);

  /* ------------------------------------------------------------
     POLLING — trivia_cards + host (via host_id) + latest session
     KEY FIX:
     - ActiveWall was using trivia.status (from trivia_cards) to decide isRunning.
     - If you only flip trivia_sessions.status to "running" but trivia_cards.status
       stays "inactive", the leaderboard/timers never truly "run" on the wall.
     - We merge the *latest session* into the trivia object AND set an
       "effective status" so the wall components see the real running state.
  ------------------------------------------------------------ */
  useEffect(() => {
    if (!triviaId) return;

    let alive = true;

    async function fetchTrivia() {
      // 1️⃣ Load trivia card
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

      // 2️⃣ Host branding (optional)
      let host: any = null;
      if (triviaRow?.host_id) {
        const { data: hostRow, error: hostErr } = await supabase
          .from("hosts")
          .select("id, venue_name, branding_logo_url, logo_url")
          .eq("id", triviaRow.host_id)
          .maybeSingle();

        if (hostErr) {
          console.error("❌ hosts fetch error:", hostErr);
        } else {
          host = hostRow;
        }
      }

      // 3️⃣ Latest non-finished session for this card (source-of-truth for running)
      const { data: sessionRow, error: sessionErr } = await supabase
        .from("trivia_sessions")
        .select("id,status,current_question,question_started_at,created_at")
        .eq("trivia_card_id", triviaId)
        .neq("status", "finished")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sessionErr) {
        console.error("❌ trivia_sessions fetch error:", sessionErr);
      }

      // IMPORTANT:
      // Force wall components to see the REAL running status from trivia_sessions
      const effectiveStatus = sessionRow?.status ?? triviaRow?.status;

      if (alive) {
        setTrivia({
          ...triviaRow,
          status: effectiveStatus, // ✅ critical: makes ActiveWall's isRunning correct
          host,
          session: (sessionRow as TriviaSessionRow | null) ?? null, // handy if you want it later
        });
      }
    }

    fetchTrivia();
    const interval = window.setInterval(fetchTrivia, 1000);

    return () => {
      alive = false;
      window.clearInterval(interval);
    };
  }, [triviaId]);

  if (!trivia) return null;

  /* ------------------------------------------------------------
     SHARED FULLSCREEN HANDLER (router-level)
  ------------------------------------------------------------ */
  const toggleFullscreen = async () => {
    const el = wallRef.current;
    if (!el) {
      console.warn("Fullscreen element missing");
      return;
    }

    try {
      if (!document.fullscreenElement) {
        await (el as any)
          .requestFullscreen({ navigationUI: "hide" } as any)
          .catch((err: any) => {
            console.error("❌ Fullscreen failed:", err);
          });
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error("🔥 Fullscreen error:", err);
    }
  };

  // ✅ Use session.status as the primary driver for inactive/active
  const sessionStatus = trivia?.session?.status; // "running" | "waiting" | null
  const isActive =
    sessionStatus === "running" && trivia.countdown_active !== true;

  const isInactive =
    !isActive ||
    trivia.status === "inactive" ||
    trivia.status === "finished" ||
    trivia.countdown_active === true;

  const bg =
    trivia.background_type === "image"
      ? `url(${trivia.background_value}) center/cover no-repeat`
      : trivia.background_value ||
        "linear-gradient(to bottom right,#1b2735,#090a0f)";

  const brightness = trivia.background_brightness ?? 100;

  return (
    <div
      ref={wallRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100vh",
        background: bg,
        filter: `brightness(${brightness}%)`,
        overflow: "hidden",
      }}
    >
      {/* INACTIVE WALL */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: isInactive ? 1 : 0,
          transition: "opacity 0.6s ease",
          zIndex: 1,
        }}
      >
        <InactiveWall trivia={trivia} />
      </div>

      {/* ACTIVE WALL */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: isInactive ? 0 : 1,
          transition: "opacity 0.6s ease",
          zIndex: 2,
        }}
      >
        <TriviaActiveWall trivia={trivia} />
      </div>

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
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.35")}
        onClick={toggleFullscreen}
      >
        ⛶
      </div>
    </div>
  );
}
