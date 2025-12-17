"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function VotePage() {
  const router = useRouter();
  const params = useParams();

  // ✅ CORRECT PARAM
  const pollId = Array.isArray(params.pollId)
    ? params.pollId[0]
    : params.pollId;

  const [poll, setPoll] = useState<any>(null);
  const [options, setOptions] = useState<any[]>([]);
  const [hostLogo, setHostLogo] = useState<string>("/faninteractlogo.png");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [guestProfile, setGuestProfile] = useState<any | null>(null);
  const [hasLocalVoted, setHasLocalVoted] = useState<boolean | null>(null);

  /* ---------------------------------------------------------
     Load guest profile + vote status
  --------------------------------------------------------- */
  useEffect(() => {
    try {
      const raw =
        localStorage.getItem("guest_profile") ||
        localStorage.getItem("guestInfo");

      setGuestProfile(raw ? JSON.parse(raw) : null);

      const voted = localStorage.getItem(`voted_${pollId}`) === "true";
      setHasLocalVoted(voted);
    } catch {
      setGuestProfile(null);
      setHasLocalVoted(false);
    }
  }, [pollId]);

  /* ---------------------------------------------------------
     Load poll + options + HOST LOGO (initial)
  --------------------------------------------------------- */
  useEffect(() => {
    if (!pollId) return;

    (async () => {
      const { data: pollData } = await supabase
        .from("polls")
        .select(
          `*,
           host:host_id (
             branding_logo_url,
             logo_url
           )`
        )
        .eq("id", pollId)
        .maybeSingle();

      const { data: opts } = await supabase
        .from("poll_options")
        .select("*")
        .eq("poll_id", pollId);

      setPoll(pollData || null);
      setOptions(opts || []);

      const logo =
        pollData?.host?.branding_logo_url?.trim()
          ? pollData.host.branding_logo_url
          : pollData?.host?.logo_url?.trim()
          ? pollData.host.logo_url
          : "/faninteractlogo.png";

      setHostLogo(logo);
      setLoading(false);
    })();
  }, [pollId]);

  /* ---------------------------------------------------------
     Realtime poll updates
     - DB row UPDATE (postgres_changes)
     - Broadcasts: poll_status + poll_update
  --------------------------------------------------------- */
  useEffect(() => {
    if (!pollId) return;

    const channel = supabase
      .channel(`poll-${pollId}`)
      // ✅ 1) DB row updates on "polls" table
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "polls",
          filter: `id=eq.${pollId}`,
        },
        (payload) => {
          setPoll(payload.new);
        }
      )
      // ✅ 2) Broadcast-based status updates from dashboard
      .on(
        "broadcast",
        { event: "poll_status" },
        (payload: any) => {
          const data = payload?.payload;
          if (!data) return;

          setPoll((prev: any) =>
            prev
              ? {
                  ...prev,
                  status: data.status ?? prev.status,
                  countdown_active:
                    data.countdown_active ?? prev.countdown_active,
                  countdown: data.countdown ?? prev.countdown,
                }
              : prev
          );
        }
      )
      .on(
        "broadcast",
        { event: "poll_update" },
        (payload: any) => {
          const data = payload?.payload;
          if (!data) return;

          // In case some other place broadcasts status via `poll_update`
          setPoll((prev: any) =>
            prev
              ? {
                  ...prev,
                  status: data.status ?? prev.status,
                  countdown_active:
                    data.countdown_active ?? prev.countdown_active,
                  countdown: data.countdown ?? prev.countdown,
                }
              : prev
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [pollId]);

  /* ---------------------------------------------------------
     Submit vote → redirect to THANK YOU
  --------------------------------------------------------- */
  async function submitVote(optionId: string) {
    if (submitting || hasLocalVoted) return;

    setSubmitting(true);

    const { data: optionRow } = await supabase
      .from("poll_options")
      .select("vote_count")
      .eq("id", optionId)
      .single();

    const newCount = (optionRow?.vote_count || 0) + 1;

    await supabase
      .from("poll_options")
      .update({ vote_count: newCount })
      .eq("id", optionId);

    localStorage.setItem(`voted_${pollId}`, "true");

    router.push(`/thanks/${pollId}?type=poll`);
  }

  /* ---------------------------------------------------------
     Render guards
  --------------------------------------------------------- */
  if (loading || guestProfile === null || hasLocalVoted === null) {
    return <div style={{ color: "#fff", textAlign: "center" }}>Loading…</div>;
  }

  if (!guestProfile) {
    return (
      <div style={{ color: "#fff", textAlign: "center", paddingTop: "40vh" }}>
        Guest profile missing. Please rescan the QR code.
      </div>
    );
  }

  if (!poll) {
    return <div style={{ color: "#fff" }}>Poll not found.</div>;
  }

  const isActive = poll.status === "active";

  const bg =
    poll.background_type === "image" &&
    poll.background_value?.startsWith("http")
      ? `url(${poll.background_value})`
      : poll.background_value || "#111";

  /* ---------------------------------------------------------
     UI
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
      <div
        style={{
          position: "absolute",
          inset: 0,
          backdropFilter: "blur(6px)",
          backgroundColor: "rgba(0,0,0,0.45)",
        }}
      />

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
        <img
          src={hostLogo}
          style={{
            width: "70%",
            margin: "0 auto 16px",
            display: "block",
            animation: "pulse 2.2s infinite",
            filter: "drop-shadow(0 0 25px rgba(56,189,248,0.6))",
          }}
        />

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

        {options.map((opt) => (
          <button
            key={opt.id}
            disabled={!isActive || hasLocalVoted}
            onClick={() => submitVote(opt.id)}
            style={{
              width: "100%",
              padding: 16,
              marginBottom: 14,
              borderRadius: 14,
              background: opt.bar_color || "#1e3a8a",
              opacity: isActive && !hasLocalVoted ? 1 : 0.35,
              color: "#fff",
              fontWeight: 800,
              fontSize: "1.6rem",
              border: "none",
              cursor:
                isActive && !hasLocalVoted ? "pointer" : "not-allowed",
              boxShadow: "0 0 25px rgba(0,0,0,0.6)",
              transition: "0.25s",
            }}
          >
            {opt.option_text}
          </button>
        ))}
      </div>

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
