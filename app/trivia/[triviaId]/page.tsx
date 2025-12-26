"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";

import InactiveWall from "@/app/trivia/layouts/inactivewall";
import TriviaActiveWall from "@/app/trivia/layouts/TriviaActiveWall";

const supabase = getSupabaseClient();

export default function TriviaWallPage() {
  const { triviaId } = useParams();
  const [trivia, setTrivia] = useState<any>(null);

  /* ------------------------------------------------------------
     POLLING — trivia_cards + host (via host_id)
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

      // 2️⃣ If we have a host_id, load host branding
      let host: any = null;

      if (triviaRow?.host_id) {
        const { data: hostRow, error: hostErr } = await supabase
          .from("hosts")
          .select(
            "id, venue_name, branding_logo_url, logo_url"
          )
          .eq("id", triviaRow.host_id)
          .maybeSingle();

        if (hostErr) {
          console.error("❌ hosts fetch error:", hostErr);
        } else {
          host = hostRow;
        }
      }

      // 3️⃣ Merge host into trivia object so layouts can read trivia.host
      if (alive) {
        setTrivia({
          ...triviaRow,
          host, // may be null if not found
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

  if (!trivia) return null;

  /* ------------------------------------------------------------
     WALL ROUTING (FINAL)
  ------------------------------------------------------------ */

  // Countdown OR inactive OR finished → inactive wall
  if (
    trivia.status === "inactive" ||
    trivia.countdown_active === true ||
    trivia.status === "finished"
  ) {
    return <InactiveWall trivia={trivia} />;
  }

  // Running AFTER countdown
  if (trivia.status === "running" && trivia.countdown_active === false) {
    return <TriviaActiveWall trivia={trivia} />;
  }

  return <InactiveWall trivia={trivia} />;
}
