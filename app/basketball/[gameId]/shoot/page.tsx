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
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [laneIndex, setLaneIndex] = useState<number | null>(null);

  /* ============================================================
     LOAD OR RECOVER PLAYER
  ============================================================ */
  useEffect(() => {
    async function loadPlayer() {
      const storedId = localStorage.getItem("bb_player_id");

      if (storedId) {
        const { data } = await supabase
          .from("bb_game_players")
          .select("id, lane_index")
          .eq("id", storedId)
          .eq("game_id", gameId)
          .is("disconnected_at", null)
          .maybeSingle();

        if (data) {
          setPlayerId(data.id);
          setLaneIndex(data.lane_index);
          setStatus(`Ready — lane ${data.lane_index + 1}`);
          return;
        }
      }

      setStatus("❌ Player not assigned");
    }

    loadPlayer();
  }, [gameId]);

  /* ============================================================
     OPEN BROADCAST CHANNEL
  ============================================================ */
  useEffect(() => {
    if (channelRef.current) return;

    const ch = supabase
      .channel(`basketball-${gameId}`, {
        config: { broadcast: { ack: true } },
      })
      .subscribe();

    channelRef.current = ch;

    return () => {
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [gameId]);

  /* ============================================================
     FIRE SHOT (COOLDOWN ENFORCED)
  ============================================================ */
  function fireShot(animation = "swish") {
    if (!channelRef.current || laneIndex === null) return;

    // 🚫 Pre-game / countdown lockout
    if (countdownValue !== null && countdownValue > 0) return;

    const now = Date.now();

    // 🚫 Cooldown
    if (now - lastShotRef.current < COOLDOWN_MS) return;

    lastShotRef.current = now;

    const shotId = crypto.randomUUID();

    channelRef.current.send({
      type: "broadcast",
      event: "shot_fired",
      payload: {
        shot_id: shotId,
        lane_index: laneIndex,
        animation, // dev-only override
        ts: now,
      },
    });
  }

  /* ============================================================
     RENDER
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
      {/* STATUS */}
      <div style={{ fontSize: 22, opacity: 0.85 }}>{status}</div>

      {/* COUNTDOWN OVERLAY */}
      {countdownValue !== null && (
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
          {countdownValue > 0 ? countdownValue : "START!"}
        </div>
      )}

      {/* MAIN SHOOT BUTTON */}
      <button
        onClick={() => fireShot("swish")}
        style={{
          padding: "26px 46px",
          fontSize: "2.2rem",
          fontWeight: 900,
          borderRadius: 18,
          background: "#ff6a00",
          border: "none",
          color: "black",
          cursor: "pointer",
          boxShadow: "0 0 30px rgba(255,120,0,0.8)",
        }}
      >
        SHOOT
      </button>

      {/* DEV CONTROLS */}
      <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
        <button
          onClick={() => fireShot("miss_left")}
          style={devBtn("#2563eb")}
        >
          MISS LEFT
        </button>

        <button
          onClick={() => fireShot("miss_right")}
          style={devBtn("#dc2626")}
        >
          MISS RIGHT
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   DEV BUTTON STYLE
============================================================ */
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
