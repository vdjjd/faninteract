"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function AnimationTestPage() {
  const { gameId } = useParams() as { gameId: string };

  const [laneIndex, setLaneIndex] = useState(0);

  // 🔥 Persistent channel reference
  const channelRef = useRef<any>(null);

  useEffect(() => {
    console.log("📡 Creating test channel for", gameId);

    const channel = supabase.channel(`basketball-${gameId}`, {
      config: { broadcast: { ack: true } },
    });

    channel.subscribe((status: string) => {
      console.log("CHANNEL STATUS:", status);
    });

    channelRef.current = channel;

    return () => {
      console.log("❌ Unsubscribing test channel");
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  async function sendAnimation(animName: string) {
    if (!channelRef.current) {
      console.warn("⚠️ Channel not ready yet!");
      return;
    }

    console.log("🔥 SENDING TEST ANIMATION", animName, "lane", laneIndex);

    await channelRef.current.send({
      type: "broadcast",
      event: "shot_fired",
      payload: {
        lane_index: laneIndex,
        animation: animName,
        pathType: "test",
        points: 0,
      },
    });
  }

  const animations = [
    "short_two_point_miss",
    "two_point_miss",
    "three_point_miss",
    "swish",
    "rim_hit",
  ];

  return (
    <div
      style={{
        padding: 40,
        fontFamily: "sans-serif",
        display: "flex",
        gap: 40,
        color: "#fff",
        background: "#111",
        height: "100vh",
      }}
    >
      {/* LANE SELECTOR */}
      <div>
        <h2>Lane Selector</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 80px)", gap: 10 }}>
          {Array.from({ length: 10 }).map((_, i) => (
            <button
              key={i}
              onClick={() => setLaneIndex(i)}
              style={{
                padding: "12px 0",
                background: i === laneIndex ? "#0af" : "#333",
                border: "1px solid #666",
                color: "#fff",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Lane {i}
            </button>
          ))}
        </div>
      </div>

      {/* ANIMATION BUTTONS */}
      <div>
        <h2>Test Animations</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {animations.map((anim) => (
            <button
              key={anim}
              onClick={() => sendAnimation(anim)}
              style={{
                padding: "12px 20px",
                background: "#444",
                border: "1px solid #777",
                color: "#fff",
                borderRadius: 6,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              {anim}
            </button>
          ))}
        </div>

        {/* CUSTOM ANIMATION */}
        <h3 style={{ marginTop: 30 }}>Custom Animation Name</h3>
        <input
          type="text"
          placeholder="Enter folder name..."
          id="customAnim"
          style={{
            padding: 10,
            width: 260,
            marginBottom: 10,
            borderRadius: 6,
            border: "1px solid #666",
            background: "#222",
            color: "#fff",
          }}
        />
        <button
          onClick={() => {
            const value = (document.getElementById("customAnim") as HTMLInputElement).value;
            if (value.trim().length > 0) sendAnimation(value.trim());
          }}
          style={{
            padding: "10px 16px",
            background: "#0af",
            color: "#fff",
            borderRadius: 6,
            border: "none",
            cursor: "pointer",
          }}
        >
          Fire Custom
        </button>
      </div>
    </div>
  );
}
