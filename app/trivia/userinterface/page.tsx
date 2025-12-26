"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";

const supabase = getSupabaseClient();

export default function TriviaUserInterfacePage() {
  const searchParams = useSearchParams();
  const gameId = searchParams.get("game");

  const [trivia, setTrivia] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!gameId) return;

    async function loadTrivia() {
      const { data, error } = await supabase
        .from("trivia_cards")
        .select("id, public_name")
        .eq("id", gameId)
        .maybeSingle();

      if (error) {
        console.error("❌ trivia_cards fetch error (UI):", error);
      }

      setTrivia(data);
      setLoading(false);
    }

    loadTrivia();
  }, [gameId]);

  if (!gameId) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#020617",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          textAlign: "center",
        }}
      >
        Missing game id. Please re-open the trivia link.
      </div>
    );
  }

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#020617",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        Loading trivia…
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#020617",
        color: "#fff",
        padding: 24,
      }}
    >
      <h1
        style={{
          fontSize: "1.8rem",
          fontWeight: 800,
          marginBottom: 16,
          textAlign: "center",
        }}
      >
        {trivia?.public_name || "Trivia Game"}
      </h1>

      <p style={{ textAlign: "center", opacity: 0.8 }}>
        This is where the question UI will go for game <code>{gameId}</code>.
      </p>

      {/* TODO: build the question/answer UI here:
          - subscribe to current question
          - show options A/B/C/D
          - send answer to trivia_answers table, etc.
      */}
    </div>
  );
}
