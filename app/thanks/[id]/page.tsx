"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { getOrCreateGuestDeviceId } from "@/lib/syncGuest";

/* ---------------------------------------------------------
   Helpers
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

async function recordVisit({
  device_id,
  guest_profile_id,
  host_id,
}: {
  device_id: string;
  guest_profile_id: string;
  host_id: string;
}) {
  const res = await fetch(
    "https://zicbtsxjrhbpqjqemjrg.functions.supabase.co/record-guest-visit",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        device_id,
        guest_profile_id,
        host_id,
      }),
    }
  );

  if (!res.ok) return null;
  return res.json();
}

/* ---------------------------------------------------------
   Component
--------------------------------------------------------- */
export default function ThankYouPage() {
  const params = useParams();
  const gameId =
    typeof params.id === "string"
      ? params.id
      : Array.isArray(params.id)
      ? params.id[0]
      : "";

  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = getSupabaseClient();

  const rawType = searchParams.get("type");

  const path =
    typeof window !== "undefined" ? window.location.pathname : "";

  // Auto-detect type from URL path, then allow ?type= override
  let detectedType =
    path.includes("/basketball/") ? "basketball" :
    path.includes("/trivia/") ? "trivia" :
    path.includes("/polls/") ? "poll" :
    path.includes("/prizewheel/") ? "wheel" :
    path.includes("/wall/") ? "wall" :
    "lead";

  if (rawType) detectedType = rawType.toLowerCase();

  const type = detectedType as
    | "basketball"
    | "trivia"
    | "poll"
    | "wheel"
    | "wall"
    | "lead";

  const [data, setData] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [visitInfo, setVisitInfo] = useState<any>(null);

  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const wakeLockRef = useRef<any>(null);

  // Trivia state
  const [triviaPhase, setTriviaPhase] =
    useState<"waiting" | "countdown" | "playing">("waiting");
  const [countdownStartedAtMs, setCountdownStartedAtMs] =
    useState<number | null>(null);

  // For ticking countdown
  const [now, setNow] = useState<number>(() => Date.now());

  /* ---------------------------------------------------------
     Load guest profile
  --------------------------------------------------------- */
  useEffect(() => {
    setProfile(getStoredGuestProfile());
  }, []);

  /* ---------------------------------------------------------
     Load host + background (with FK-based join)
  --------------------------------------------------------- */
  useEffect(() => {
    if (!gameId) return;

    (async () => {
      if (type === "lead") {
        setData({ background_value: null, host: null });
        return;
      }

      const table =
        type === "poll"
          ? "polls"
          : type === "wheel"
          ? "prize_wheels"
          : type === "basketball"
          ? "bb_games"
          : type === "trivia"
          ? "trivia_cards"
          : "fan_walls";

      // Special-case trivia, because trivia_cards currently have no background_value
      const select =
        type === "basketball"
          ? `
              id,
              host:host_id (
                id,
                branding_logo_url,
                logo_url
              )
            `
          : type === "trivia"
          ? `
              id,
              host_id,
              host:host_id (
                id,
                branding_logo_url,
                logo_url
              )
            `
          : `
              id,
              background_value,
              host:host_id (
                id,
                branding_logo_url,
                logo_url
              )
            `;

      const { data, error } = await supabase
        .from(table)
        .select(select)
        .eq("id", gameId as string)
        .maybeSingle();

      if (error) {
        console.error(`❌ ${table} fetch error (thanks):`, error);
        setData(null);
        return;
      }

      setData(data);
    })();
  }, [gameId, type, supabase]);

  /* ---------------------------------------------------------
     Record visit (loyalty / badge)
  --------------------------------------------------------- */
  useEffect(() => {
    if (!profile || !data?.host?.id) return;

    const deviceId = getOrCreateGuestDeviceId();

    recordVisit({
      device_id: deviceId,
      guest_profile_id: profile.id,
      host_id: data.host.id,
    }).then((res) => {
      if (!res) return;
      setVisitInfo(res);
    });
  }, [profile, data?.host?.id]);

  /* ---------------------------------------------------------
     Wake Lock (basketball controller mode)
  --------------------------------------------------------- */
  useEffect(() => {
    if (type !== "basketball") return;

    async function lockScreen() {
      try {
        if ("wakeLock" in navigator) {
          wakeLockRef.current = await (navigator as any).wakeLock.request(
            "screen"
          );
        }
      } catch {
        // Safari / unsupported — ignore
      }
    }

    lockScreen();

    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [type]);

  /* ---------------------------------------------------------
     Basketball: Poll for approval → redirect to shooter
  --------------------------------------------------------- */
  useEffect(() => {
    if (type !== "basketball" || !profile?.id || !gameId) return;

    async function pollApproval() {
      const { data: entry } = await supabase
        .from("bb_game_entries")
        .select("id")
        .eq("game_id", gameId)
        .eq("guest_profile_id", profile.id)
        .eq("status", "approved")
        .maybeSingle();

      if (!entry) return;

      const { data: player } = await supabase
        .from("bb_game_players")
        .select("id")
        .eq("game_id", gameId)
        .eq("guest_profile_id", profile.id)
        .is("disconnected_at", null)
        .maybeSingle();

      if (!player) return;

      localStorage.setItem("bb_player_id", player.id);

      if (pollRef.current) clearInterval(pollRef.current);

      router.replace(`/basketball/${gameId}/shoot`);
    }

    pollRef.current = setInterval(pollApproval, 2000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [type, profile, gameId, supabase, router]);

  /* ---------------------------------------------------------
     Trivia: watch trivia_cards for countdown / running state
     (Realtime + polling, using countdown_started_at)
  --------------------------------------------------------- */
  useEffect(() => {
    if (type !== "trivia" || !gameId) return;

    let mounted = true;

    function applyCardState(card: {
      status: string;
      countdown_active: boolean;
      countdown_started_at?: string | null;
    }) {
      // Countdown ON
      if (card.countdown_active) {
        setTriviaPhase("countdown");

        if (card.countdown_started_at) {
          setCountdownStartedAtMs(
            new Date(card.countdown_started_at).getTime()
          );
        } else {
          // Fallback if somehow missing
          setCountdownStartedAtMs(Date.now());
        }
        return;
      }

      // Game RUNNING → go to trivia user interface
      if (card.status === "running") {
        setTriviaPhase("playing");
        router.replace(`/trivia/userinterface?game=${gameId}`);
        return;
      }

      // Any other state → waiting
      setTriviaPhase("waiting");
      setCountdownStartedAtMs(null);
    }

    async function loadInitialCard() {
      const { data: card, error } = await supabase
        .from("trivia_cards")
        .select("status,countdown_active,countdown_started_at")
        .eq("id", gameId as string)
        .maybeSingle();

      if (!mounted || !card || error) return;
      applyCardState(card as any);
    }

    loadInitialCard();

    // 🔔 Realtime subscription
    const channel = supabase
      .channel(`trivia-card-${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "trivia_cards",
          filter: `id=eq.${gameId}`,
        },
        (payload) => {
          if (!mounted) return;
          const card = payload.new as any;
          console.log("🔔 trivia_cards update on thanks:", card);
          applyCardState(card);
        }
      )
      .subscribe();

    // ⏱ Polling fallback: check every 1s
    let prevCountdownActive: boolean | null = null;
    let prevStatus: string | null = null;

    const pollId = setInterval(async () => {
      if (!mounted) return;

      const { data: card, error } = await supabase
        .from("trivia_cards")
        .select("status,countdown_active,countdown_started_at")
        .eq("id", gameId as string)
        .maybeSingle();

      if (!card || error) return;

      const changedCountdown =
        card.countdown_active !== prevCountdownActive;
      const changedStatus = card.status !== prevStatus;

      prevCountdownActive = card.countdown_active;
      prevStatus = card.status;

      if (changedCountdown || changedStatus) {
        applyCardState(card as any);
      }
    }, 1000);

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
      clearInterval(pollId);
    };
  }, [type, gameId, supabase, router]);

  /* ---------------------------------------------------------
     Trivia countdown ticking (black screen)
  --------------------------------------------------------- */
  useEffect(() => {
    if (type !== "trivia") return;
    if (triviaPhase !== "countdown") return;
    if (!countdownStartedAtMs) return;

    const id = setInterval(() => {
      setNow(Date.now());
    }, 250);

    return () => {
      clearInterval(id);
    };
  }, [type, triviaPhase, countdownStartedAtMs]);

  /* ---------------------------------------------------------
     Badge logic
  --------------------------------------------------------- */
  const badge =
    visitInfo?.loyaltyDisabled ? null : visitInfo?.badge ?? null;

  /* ---------------------------------------------------------
     UI helpers
  --------------------------------------------------------- */
  const bg =
    type === "basketball"
      ? `url(/newbackground.png)`
      : type === "trivia"
      ? "linear-gradient(135deg,#0a2540,#1b2b44,#000000)"
      : data?.background_value?.includes?.("http")
      ? `url(${data.background_value})`
      : data?.background_value ||
        "linear-gradient(135deg,#0a2540,#1b2b44,#000000)";

  const logo =
    data?.host?.branding_logo_url?.trim() ||
    data?.host?.logo_url?.trim() ||
    "/faninteractlogo.png";

  const headline = visitInfo?.isReturning
    ? `Welcome back, ${profile?.first_name || "friend"}!`
    : `Thank You, ${profile?.first_name || "friend"}!`;

  const message = useMemo(() => {
    switch (type) {
      case "basketball":
        return "You’re in! Get ready to play.";
      case "poll":
        return "Your vote has been recorded!";
      case "wheel":
        return "You're in! Watch for your chance…";
      case "trivia":
        return "You’re in! Get ready for the trivia game.";
      default:
        return "Your submission was received!";
    }
  }, [type, profile?.first_name]);

  /* ---------------------------------------------------------
     Trivia countdown full-screen (black) override
     (single source of truth for timer)
  --------------------------------------------------------- */
  if (
    type === "trivia" &&
    triviaPhase === "countdown" &&
    countdownStartedAtMs
  ) {
    // Fixed 10-second pre-game countdown (same as dashboard)
    const elapsed = Math.floor((now - countdownStartedAtMs) / 1000);
    const secondsLeft = Math.max(0, 10 - elapsed);

    return (
      <div
        style={{
          minHeight: "100vh",
          background: "black",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontSize: "5rem",
          fontWeight: 900,
        }}
      >
        {secondsLeft}
      </div>
    );
  }

  /* ---------------------------------------------------------
     Render normal Thank You / Waiting view
  --------------------------------------------------------- */
  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundImage: bg,
        backgroundSize: "cover",
        backgroundPosition: "center",
        position: "relative",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: 24,
        textAlign: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.6)",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 10,
          maxWidth: 460,
          width: "100%",
          padding: "42px 26px",
          borderRadius: 22,
          background: "rgba(0,0,0,0.65)",
          border: "1px solid rgba(255,255,255,0.15)",
          boxShadow: "0 0 35px rgba(0,0,0,0.7)",
        }}
      >
        <img
          src={logo}
          alt="logo"
          style={{
            width: "72%",
            maxWidth: 260,
            margin: "0 auto 16px",
            display: "block",
          }}
        />

        <h1
          style={{
            fontSize: "2.2rem",
            fontWeight: 900,
            marginBottom: 6,
            background:
              "linear-gradient(90deg,#ffd8a6,#ffa65c,#ff7a00,#ff3b0a)",
            WebkitBackgroundClip: "text",
            color: "transparent",
          }}
        >
          {headline}
        </h1>

        <p style={{ color: "#f3e8e0", marginBottom: 12 }}>
          {message}
        </p>

        {/* WAITING STATE FOR BASKETBALL */}
        {type === "basketball" && (
          <>
            <div
              style={{
                marginTop: 22,
                fontSize: "1.4rem",
                fontWeight: 900,
                color: "#00ffd0",
                textShadow:
                  "0 0 10px rgba(0,255,208,0.9), 0 0 22px rgba(0,255,208,0.6)",
                animation: "pulseGlow 1.6s ease-in-out infinite",
              }}
            >
              Waiting for host approval…
            </div>

            <p
              style={{
                marginTop: 10,
                fontSize: "0.9rem",
                color: "#cbd5e1",
                opacity: 0.85,
              }}
            >
              Keep this screen open — it becomes your controller.
              <br />
              <span style={{ opacity: 0.7 }}>
                (On Safari, please keep your screen awake manually.)
              </span>
            </p>
          </>
        )}

        {/* WAITING STATE FOR TRIVIA */}
        {type === "trivia" && triviaPhase === "waiting" && (
          <>
            <div
              style={{
                marginTop: 22,
                fontSize: "1.4rem",
                fontWeight: 900,
                color: "#38bdf8",
                textShadow: "0 0 12px rgba(56,189,248,0.8)",
              }}
            >
              Waiting for the game to begin…
            </div>

            <p
              style={{
                marginTop: 10,
                fontSize: "0.9rem",
                color: "#cbd5e1",
                opacity: 0.85,
              }}
            >
              Keep this screen open.
              <br />
              The countdown and first question will appear automatically.
            </p>
          </>
        )}

        {/* Loyalty badge (if enabled & returned) */}
        {badge && (
          <div
            style={{
              marginTop: 18,
              padding: 16,
              borderRadius: 16,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.15)",
            }}
          >
            {badge.icon_url && (
              <img
                src={badge.icon_url}
                alt={badge.label}
                style={{
                  width: 96,
                  height: 96,
                  margin: "0 auto 10px",
                  display: "block",
                }}
              />
            )}

            <div
              style={{
                fontSize: "1.35rem",
                fontWeight: 900,
                color: "#ffd166",
                marginBottom: 6,
              }}
            >
              {badge.label}
            </div>

            <div
              style={{
                fontSize: "0.95rem",
                color: "#f1f5f9",
                opacity: 0.95,
              }}
            >
              {badge.description}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulseGlow {
          0% { opacity: 0.6; }
          50% { opacity: 1; }
          100% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
