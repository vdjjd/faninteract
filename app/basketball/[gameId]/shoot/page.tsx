"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useCountdown } from "@/app/basketball/hooks/useCountdown";

export default function ShooterPage() {
  const { gameId } = useParams() as { gameId: string };

  const countdownValue = useCountdown(gameId);

  const channelRef = useRef<any>(null);

  const [status, setStatus] = useState("Initializing…");
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [laneIndex, setLaneIndex] = useState<number | null>(null);

  /* ============================================================
     LOAD OR RECOVER PLAYER
  ============================================================ */
  useEffect(() => {
    async function loadPlayer() {
      const storedId = localStorage.getItem("bb_player_id");
      console.log("📦 localStorage bb_player_id =", storedId);

      // 1️⃣ Try stored player ID
      if (storedId) {
        const { data, error } = await supabase
          .from("bb_game_players")
          .select("id, lane_index")
          .eq("id", storedId)
          .eq("game_id", gameId)
          .is("disconnected_at", null)
          .maybeSingle();

        if (data) {
          console.log("✅ Player restored from storage:", data);
          setPlayerId(data.id);
          setLaneIndex(data.lane_index);
          setStatus(`Ready — lane ${data.lane_index}`);
          return;
        }
      }

      // 2️⃣ Fallback: find active player for this game
      console.warn("⚠️ Stored player invalid — searching active players");

      const { data: activePlayers, error } = await supabase
        .from("bb_game_players")
        .select("id, lane_index")
        .eq("game_id", gameId)
        .is("disconnected_at", null)
        .order("joined_at", { ascending: true })
        .limit(1);

      if (error || !activePlayers || activePlayers.length === 0) {
        console.error("❌ No active player found", error);
        setStatus("❌ No active player assigned");
        return;
      }

      const p = activePlayers[0];

      console.log("✅ Active player recovered:", p);

      localStorage.setItem("bb_player_id", p.id);

      setPlayerId(p.id);
      setLaneIndex(p.lane_index);
      setStatus(`Ready — lane ${p.lane_index}`);
    }

    loadPlayer();
  }, [gameId]);

  /* ============================================================
     OPEN BROADCAST CHANNEL (ONCE)
  ============================================================ */
  useEffect(() => {
    if (channelRef.current) return;

    const ch = supabase
      .channel(`basketball-${gameId}`, {
        config: { broadcast: { ack: true } },
      })
      .subscribe((status) => {
        console.log("📡 SHOOTER CHANNEL STATUS:", status);
      });

    channelRef.current = ch;

    return () => {
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [gameId]);

  /* ============================================================
     FIRE SHOT (BUTTON)
  ============================================================ */
  async function fireShot() {
    if (!channelRef.current || laneIndex === null) {
      console.warn("❌ Cannot shoot — channel or lane missing");
      return;
    }

    console.log("🔥 FIRING SHOT → lane", laneIndex);

    await channelRef.current.send({
      type: "broadcast",
      event: "shot_fired",
      payload: {
        lane_index: laneIndex,
        animation: "swish",
        points: 2,
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

      {/* COUNTDOWN */}
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

      {/* TEST BUTTON */}
      <button
        onClick={fireShot}
        style={{
          padding: "24px 40px",
          fontSize: "2rem",
          fontWeight: 900,
          borderRadius: 16,
          background: "#ff6a00",
          border: "none",
          color: "black",
          cursor: "pointer",
          boxShadow: "0 0 30px rgba(255,120,0,0.8)",
        }}
      >
        SHOOT
      </button>
    </div>
  );
}
