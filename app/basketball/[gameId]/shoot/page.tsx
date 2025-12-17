"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useCountdown } from "@/app/basketball/hooks/useCountdown";

const COOLDOWN_MS = 500;

export default function ShooterPage() {
  const { gameId } = useParams() as { gameId: string };

  const countdownValue = useCountdown(gameId);
  const channelRef = useRef<any>(null);
  const lastShotRef = useRef<number>(0);

  const [status, setStatus] = useState("Initializing…");
  const [laneIndex, setLaneIndex] = useState<number | null>(null);

  /* ============================================================
     LOAD PLAYER
  ============================================================ */
  useEffect(() => {
    async function loadPlayer() {
      const storedId = localStorage.getItem("bb_player_id");

      if (!storedId) {
        setStatus("❌ Player not assigned");
        return;
      }

      const { data } = await supabase
        .from("bb_game_players")
        .select("lane_index")
        .eq("id", storedId)
        .eq("game_id", gameId)
        .is("disconnected_at", null)
        .maybeSingle();

      if (!data) {
        setStatus("❌ Player not active");
        return;
      }

      setLaneIndex(data.lane_index);
      setStatus(`READY — Lane ${data.lane_index + 1}`);
    }

    loadPlayer();
  }, [gameId]);

  /* ============================================================
     OPEN BROADCAST CHANNEL
  ============================================================ */
  useEffect(() => {
    const ch = supabase
      .channel(`basketball-${gameId}`)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("✅ Shooter channel connected");
        }
      });

    channelRef.current = ch;

    return () => {
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [gameId]);

  /* ============================================================
     FIRE SHOT
  ============================================================ */
  function fireShot(animation: string) {
    if (!channelRef.current) return;
    if (laneIndex === null) return;

    // 🚫 Block ONLY while countdown > 0
    if (countdownValue !== null && countdownValue > 0) return;

    const now = Date.now();

    if (now - lastShotRef.current < COOLDOWN_MS) return;
    lastShotRef.current = now;

    const payload = {
      shot_id: crypto.randomUUID(),
      lane_index: laneIndex,
      animation,
      ts: now,
    };

    console.log("🏀 SHOOT:", payload);

    channelRef.current.send({
      type: "broadcast",
      event: "shot_fired",
      payload,
    });
  }

  /* ============================================================
     UI
  ============================================================ */
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#000",
        color: "white",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        touchAction: "none",
      }}
    >
      <div style={{ fontSize: 22, opacity: 0.85 }}>{status}</div>

      {/* COUNTDOWN */}
      {countdownValue !== null && countdownValue > 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "clamp(4rem, 10vw, 12rem)",
            fontWeight: 900,
            zIndex: 50,
          }}
        >
          {countdownValue}
        </div>
      )}

      <button onClick={() => fireShot("close_hit")} style={mainBtn()}>
        SHOOT
      </button>

      <div style={{ display: "flex", gap: 12 }}>
        <button onClick={() => fireShot("close_miss_left")} style={devBtn("#2563eb")}>
          MISS LEFT
        </button>
        <button onClick={() => fireShot("close_miss_right")} style={devBtn("#dc2626")}>
          MISS RIGHT
        </button>
        <button onClick={() => fireShot("close_miss_long")} style={devBtn("#7c3aed")}>
          MISS LONG
        </button>
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <button onClick={() => fireShot("three_hit")} style={devBtn("#16a34a")}>
          3PT HIT
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   STYLES
============================================================ */

function mainBtn() {
  return {
    padding: "26px 46px",
    fontSize: "2.2rem",
    fontWeight: 900,
    borderRadius: 18,
    background: "#ff6a00",
    border: "none",
    color: "black",
    cursor: "pointer",
    boxShadow: "0 0 30px rgba(255,120,0,0.8)",
  };
}

function devBtn(bg: string) {
  return {
    padding: "12px 18px",
    fontSize: "1rem",
    fontWeight: 700,
    borderRadius: 10,
    background: bg,
    border: "none",
    color: "white",
    cursor: "pointer",
  };
}
