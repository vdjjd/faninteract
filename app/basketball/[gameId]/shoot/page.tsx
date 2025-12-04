"use client";

import { useState, useRef, useEffect, use } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function ShooterPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = use(params);

  const [playerId, setPlayerId] = useState<string | null>(null);

  const startY = useRef(0);
  const startTime = useRef(0);

  /* ------------------------------------------------------- */
  /* Load playerId from localStorage                         */
  /* ------------------------------------------------------- */
  useEffect(() => {
    const stored = localStorage.getItem("bb_player_id");

    if (stored) {
      setPlayerId(stored);
    } else {
      console.warn("❗ No playerId found — shooter requires approval.");
    }
  }, []);

  /* ------------------------------------------------------- */
  /* Send shot → RPC + broadcast                             */
  /* ------------------------------------------------------- */
  async function sendShot(power: number) {
    if (!playerId) return;

    const made = Math.random() < (0.45 + power * 0.35);

    if (made) {
      await supabase.rpc("increment_player_score", {
        p_player_id: playerId,
      });

      await supabase.channel(`basketball-${gameId}`).send({
        type: "broadcast",
        event: "update_score",
        payload: { player_id: playerId },
      });
    }
  }

  /* ------------------------------------------------------- */
  /* Touch handling                                           */
  /* ------------------------------------------------------- */
  function handleTouchStart(e: any) {
    startY.current = e.touches[0].clientY;
    startTime.current = Date.now();
  }

  function handleTouchEnd(e: any) {
    const endY = e.changedTouches[0].clientY;
    const endTime = Date.now();

    const distance = startY.current - endY;
    const duration = (endTime - startTime.current) / 1000;

    if (distance < 30) return;

    let power = Math.min(1, Math.max(0, distance / 500));

    sendShot(power);
  }

  /* ------------------------------------------------------- */
  /* UI                                                      */
  /* ------------------------------------------------------- */
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#111",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "white",
        fontSize: "2rem",
        userSelect: "none",
        touchAction: "none",
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      SWIPE UP TO SHOOT
    </div>
  );
}
