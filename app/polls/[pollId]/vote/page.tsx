"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

/* ---------------------------------------------------------
   Load guest profile if previously saved
--------------------------------------------------------- */
function getStoredGuestProfile() {
  try {
    const raw =
      localStorage.getItem("guest_profile") ||
      localStorage.getItem("guestInfo");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------
   Local Vote Lock
--------------------------------------------------------- */
function hasVoted(pollId: string) {
  return localStorage.getItem(`voted_${pollId}`) === "true";
}

function setVoted(pollId: string) {
  localStorage.setItem(`voted_${pollId}`, "true");
}

export default function VotePage() {
  const router = useRouter();
  const params = useParams();
  const pollId = Array.isArray(params.pollId) ? params.pollId[0] : params.pollId;

  const [poll, setPoll] = useState<any>(null);
  const [options, setOptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  /* ---------------------------------------------------------
     Enforce guest signup
--------------------------------------------------------- */
  useEffect(() => {
    const profile = getStoredGuestProfile();
    if (!profile) {
      router.push(`/guest/signup?redirect=/polls/${pollId}/vote`);
      return;
    }
  }, []);

  /* ---------------------------------------------------------
     Load poll + poll options
--------------------------------------------------------- */
  async function loadEverything() {
    const { data: pollData } = await supabase
      .from("polls")
      .select("*, host:host_id (branding_logo_url)")
      .eq("id", pollId)
      .maybeSingle();

    const { data: opts } = await supabase
      .from("poll_options")
      .select("*")
      .eq("poll_id", pollId);

    setPoll(pollData);
    setOptions(opts || []);
    setLoading(false);
  }

  useEffect(() => {
    loadEverything();
  }, [pollId]);

  /* ---------------------------------------------------------
     Realtime poll status only
--------------------------------------------------------- */
  useEffect(() => {
    if (!pollId) return;

    const channel = supabase
      .channel(`poll-${pollId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "polls",
          filter: `id=eq.${pollId}`,
        },
        (payload: any) => {
          setPoll(payload.new);
        }
      )
      .subscribe();

    // ★ FIXED CLEANUP — must NOT return a Promise
    return () => {
      supabase.removeChannel(channel);
    };
  }, [pollId]);

  /* ---------------------------------------------------------
     Submit Vote (read → update)
--------------------------------------------------------- */
  async function submitVote(optionId: string) {
    if (submitting) return;
    if (hasVoted(pollId)) {
      alert("You already voted in this poll.");
      return;
    }

    setSubmitting(true);

    // 1️⃣ Read current votes
    const { data: optionRow, error: fetchError } = await supabase
      .from("poll_options")
      .select("vote_count")
      .eq("id", optionId)
      .single();

    if (fetchError) {
      alert("Could not read current votes.");
      setSubmitting(false);
      return;
    }

    // 2️⃣ Update +1
    const newCount = (optionRow.vote_count || 0) + 1;

    const { error: updateError } = await supabase
      .from("poll_options")
      .update({ vote_count: newCount })
      .eq("id", optionId);

    if (updateError) {
      alert("Vote failed.");
      setSubmitting(false);
      return;
    }

    // 3️⃣ Lock device vote
    setVoted(pollId);

    setSubmitting(false);
    router.push(`/thanks/${pollId}`);
  }

  /* ---------------------------------------------------------
     Loading states
--------------------------------------------------------- */
  if (loading) return <div style={{ color: "#fff" }}>Loading…</div>;
  if (!poll) return <div style={{ color: "#fff" }}>Poll not found.</div>;

  const isActive = poll.status === "active";

  /* ---------------------------------------------------------
     Background + Logo (MATCH WALL SUBMIT PAGE)
--------------------------------------------------------- */
  const bg =
    poll.background_type === "image" &&
    poll.background_value?.startsWith("http")
      ? `url(${poll.background_value})`
      : poll.background_value || "#111";

  const logo =
    poll.host?.branding_logo_url?.trim()
      ? poll.host.branding_logo_url
      : "/faninteractlogo.png";

  /* ---------------------------------------------------------
     BEAUTIFUL MODERN UI (Matches Wall Submit Page)
--------------------------------------------------------- */
  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundImage: bg,
        backgroundSize: "cover",
        backgroundPosition: "center",
        position: "relative",
      }}
    >
      {/* overlay blur */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backdropFilter: "blur(6px)",
          backgroundColor: "rgba(0,0,0,0.45)",
        }}
      />

      {/* CONTENT CARD */}
      <div
        style={{
          position: "relative",
          maxWidth: 480,
          margin: "0 auto",
          padding: 30,
          marginTop: "6vh",
          background: "rgba(0,0,0,0.55)",
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.15)",
          textAlign: "center",
          boxShadow: "0 0 30px rgba(0,0,0,0.7)",
        }}
      >
        {/* LOGO */}
        <img
          src={logo}
          style={{
            width: "70%",
            margin: "0 auto 16px",
            display: "block",
            animation: "pulse 2.2s infinite",
            filter: "drop-shadow(0 0 25px rgba(56,189,248,0.6))",
          }}
        />

        {/* QUESTION */}
        <h1
          style={{
            color: "#fff",
            fontWeight: 900,
            fontSize: "clamp(1.4rem, 6vw, 2.6rem)",
            marginBottom: "3vh",
            textShadow: "2px 2px 10px #000",
          }}
        >
          {poll.question}
        </h1>

        {/* OPTIONS */}
        {options.map((opt) => (
          <button
            key={opt.id}
            disabled={!isActive || hasVoted(pollId)}
            onClick={() => submitVote(opt.id)}
            style={{
              width: "100%",
              padding: 16,
              marginBottom: 14,
              borderRadius: 14,
              background: opt.bar_color || "#1e3a8a",
              opacity: isActive && !hasVoted(pollId) ? 1 : 0.35,
              color: "#fff",
              fontWeight: 800,
              fontSize: "1.6rem",
              border: "none",
              cursor: isActive && !hasVoted(pollId) ? "pointer" : "not-allowed",
              boxShadow: "0 0 25px rgba(0,0,0,0.6)",
              transition: "0.25s",
            }}
          >
            {opt.option_text}
          </button>
        ))}
      </div>

      {/* PULSE ANIMATION */}
      <style>{`
        @keyframes pulse {
          0% { filter: drop-shadow(0 0 12px rgba(56,189,248,0.6)); }
          50% { filter: drop-shadow(0 0 35px rgba(56,189,248,0.9)); }
          100% { filter: drop-shadow(0 0 12px rgba(56,189,248,0.6)); }
        }
      `}</style>
    </div>
  );
}
