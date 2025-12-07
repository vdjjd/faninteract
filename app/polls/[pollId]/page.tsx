'"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import InactivePollWall from "../components/InactivePollWall";
import ActivePollWall from "../components/ActivePollWall";
import { cn } from "../../../lib/utils";

const POLL_REFRESH_MS = 2000;

export default function PollRouterPage() {
  const params = useParams();
  const id = Array.isArray(params.pollId) ? params.pollId[0] : params.pollId;

  const [poll, setPoll] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFading, setIsFading] = useState(false);

  const pollInterval = useRef<NodeJS.Timeout | null>(null);

  /* ---------------------------------------------------------
     SAFE POLL LOADING (NO JOIN — FIXES RLS ISSUES)
  --------------------------------------------------------- */
  async function loadEverything() {
    if (!id) return;

    try {
      const { data: pollData } = await supabase
        .from("polls")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      setPoll(pollData || null);
    } catch (err) {
      console.error("❌ Poll load error:", err);
    } finally {
      setLoading(false);
    }
  }

  /* ---------------------------------------------------------
     INITIAL LOAD + POLLING
  --------------------------------------------------------- */
  useEffect(() => {
    if (!id) return;

    loadEverything();

    if (pollInterval.current) clearInterval(pollInterval.current);
    pollInterval.current = setInterval(loadEverything, POLL_REFRESH_MS);

    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current);
    };
  }, [id]);

  /* ---------------------------------------------------------
     REALTIME UPDATES (SAFE MERGE)
  --------------------------------------------------------- */
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`router-poll-${id}`)
      .on(
        "postgres_changes",
        {
          schema: "public",
          table: "polls",
          event: "*",
          filter: `id=eq.${id}`,
        },
        (payload) => {
          setPoll((prev) =>
            prev ? { ...prev, ...payload.new } : payload.new
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  /* ---------------------------------------------------------
     FADE LOGIC (SAFE + STABLE)
  --------------------------------------------------------- */
  useEffect(() => {
    if (!poll) return;

    setIsFading(true);
    const timeout = setTimeout(() => setIsFading(false), 1500);

    return () => clearTimeout(timeout);
  }, [poll?.status]);

  /* ---------------------------------------------------------
     RENDER
  --------------------------------------------------------- */
  if (loading)
    return (
      <div
        className={cn(
          "flex",
          "items-center",
          "justify-center",
          "h-screen",
          "text-white",
          "text-2xl",
          "bg-black"
        )}
      >
        Loading Poll…
      </div>
    );

  if (!poll)
    return (
      <div
        className={cn(
          "flex",
          "items-center",
          "justify-center",
          "h-screen",
          "text-white",
          "text-2xl",
          "bg-black"
        )}
      >
        Poll not found.
      </div>
    );

  const showInactive =
    poll.status !== "active" || (poll.status === "active" && isFading);
  const showActive = poll.status === "active" && !isFading;

  return (
    <div
      style={{
        width: "100%",
        height: "100vh",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Inactive Wall */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: showInactive ? 1 : 0,
          transition: "opacity 1.5s ease",
          pointerEvents: showInactive ? "auto" : "none",
        }}
      >
        <InactivePollWall poll={poll} />
      </div>

      {/* Active Wall */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: showActive ? 1 : 0,
          transition: "opacity 1.5s ease",
          pointerEvents: showActive ? "auto" : "none",
        }}
      >
        <ActivePollWall poll={poll} />
      </div>
    </div>
  );
}
