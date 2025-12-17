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
  const { id: gameId } = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = getSupabaseClient();

  const rawType = searchParams.get("type");
  const path =
    typeof window !== "undefined" ? window.location.pathname : "";

  let detectedType =
    path.includes("/basketball/") ? "basketball" :
    path.includes("/polls/") ? "poll" :
    path.includes("/prizewheel/") ? "wheel" :
    path.includes("/wall/") ? "wall" :
    "lead";

  if (rawType) detectedType = rawType.toLowerCase();
  const type = detectedType;

  const [data, setData] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [visitInfo, setVisitInfo] = useState<any>(null);

  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const wakeLockRef = useRef<any>(null);

  /* ---------------------------------------------------------
     Load guest profile
  --------------------------------------------------------- */
  useEffect(() => {
    setProfile(getStoredGuestProfile());
  }, []);

  /* ---------------------------------------------------------
     Load host + background
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
          : "fan_walls";

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
          : `
              id,
              background_value,
              host:host_id (
                id,
                branding_logo_url,
                logo_url
              )
            `;

      const { data } = await supabase
        .from(table)
        .select(select)
        .eq("id", gameId as string)
        .maybeSingle();

      setData(data);
    })();
  }, [gameId, type, supabase]);

  /* ---------------------------------------------------------
     Record visit
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
     Wake Lock (controller mode)
  --------------------------------------------------------- */
  useEffect(() => {
    if (type !== "basketball") return;

    async function lockScreen() {
      try {
        if ("wakeLock" in navigator) {
          wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
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
     Poll for approval → redirect to shooter
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
      : data?.background_value?.includes("http")
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
      default:
        return "Your submission was received!";
    }
  }, [type]);

  /* ---------------------------------------------------------
     Render
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

        {/* WAITING STATE */}
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
