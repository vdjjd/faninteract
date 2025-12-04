"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";

/* ---------------------------------------------------
   Local helper to load stored guest profile
--------------------------------------------------- */
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

export default function ThankYouPage() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const supabase = getSupabaseClient();

  const rawType = searchParams.get("type");

  // Auto-detect fallback types (wall, wheel, poll)
  const path =
    typeof window !== "undefined" ? window.location.pathname : "";

  let detectedType =
    path.includes("/polls/") ? "poll" :
    path.includes("/prizewheel/") ? "wheel" :
    path.includes("/wall/") ? "wall" :
    null;

  if (rawType) detectedType = rawType.toLowerCase();

  // Default fallback type
  const type = detectedType || "lead";

  const [data, setData] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [remoteEnabled, setRemoteEnabled] = useState(false);
  const [armed, setArmed] = useState(false);
  const [pressing, setPressing] = useState(false);
  const [showCloseHint, setShowCloseHint] = useState(false);

  const wheelRowRef = useRef<any>(null);

  /* ---------------------------------------------------
     Load Guest Profile
  --------------------------------------------------- */
  useEffect(() => {
    setProfile(getStoredGuestProfile());
  }, []);

  /* ---------------------------------------------------
     Fetch Data (not used for basketball)
  --------------------------------------------------- */
  useEffect(() => {
    if (!id) return;

    // Basketball does NOT load host tables like wheels/polls/walls:
    if (type === "basketball") {
      setData({
        host: {
          branding_logo_url: "/faninteractlogo.png"
        }
      });
      return;
    }

    // Regular types
    async function fetchData() {
      const table =
        type === "poll"
          ? "polls"
          : type === "wheel"
          ? "prize_wheels"
          : "fan_walls";

      const { data } = await supabase
        .from(table)
        .select(
          `id, title, background_value,
           remote_spin_enabled, selected_remote_spinner,
           host:host_id ( branding_logo_url )`
        )
        .eq("id", id as string)
        .maybeSingle();

      setData(data);

      if (type === "wheel" && data) {
        wheelRowRef.current = data;
        setRemoteEnabled(!!data.remote_spin_enabled);
        setArmed(
          !!data.remote_spin_enabled &&
            !!profile?.id &&
            data.selected_remote_spinner === profile.id
        );
      }
    }

    fetchData();
  }, [id, type, supabase, profile?.id]);

  /* ---------------------------------------------------
     Real-time updates for wheel (unchanged)
  --------------------------------------------------- */
  useEffect(() => {
    if (type !== "wheel" || !id) return;

    const rowChannel = supabase
      .channel(`pw-row-${id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "prize_wheels",
          filter: `id=eq.${id}`,
        },
        (payload: any) => {
          const row = payload.new;
          wheelRowRef.current = row;
          setRemoteEnabled(!!row.remote_spin_enabled);
          setArmed(
            !!row.remote_spin_enabled &&
              !!profile?.id &&
              row.selected_remote_spinner === profile.id
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(rowChannel);
    };
  }, [id, type, supabase, profile?.id]);

  /* ---------------------------------------------------
     Basketball UI Overrides
  --------------------------------------------------- */
  const basketballBackground = "url(/BBgamebackground.png)";

  const basketballMessage = `
    You're entered into the Basketball Battle!
    Watch the big screen to see if you're picked!
  `;

  const basketballLogo = "/faninteractlogo.png";

  /* ---------------------------------------------------
     Default UI
  --------------------------------------------------- */
  const defaultMessage = useMemo(() => {
    switch (type) {
      case "lead":
        return "Your request has been submitted!";
      case "poll":
        return "Your vote has been recorded!";
      case "wheel":
        return "You're in! Watch for your chance…";
      case "trivia":
        return "Your answer has been submitted!";
      default:
        return "Your post has been sent for approval!";
    }
  }, [type]);

  const handleClose = () => {
    const closed = window.close();
    if (!closed) setShowCloseHint(true);
  };

  /* ---------------------------------------------------
     Render
  --------------------------------------------------- */
  const isBasketball = type === "basketball";

  const bg = isBasketball
    ? basketballBackground
    : data?.background_value ||
      "linear-gradient(135deg,#0a2540,#1b2b44,#000000)";

  const displayLogo = isBasketball
    ? basketballLogo
    : data?.host?.branding_logo_url ||
      "/faninteractlogo.png";

  const message = isBasketball ? basketballMessage : defaultMessage;

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
        padding: 25,
        textAlign: "center",
      }}
    >
      {/* Darken overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(6px)",
        }}
      />

      {/* CARD */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          maxWidth: 500,
          width: "100%",
          padding: "42px 26px",
          borderRadius: 22,
          background: "rgba(0,0,0,0.55)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 0 35px rgba(0,0,0,0.6)",
        }}
      >
        <img
          src={displayLogo}
          style={{
            width: "68%",
            maxWidth: 260,
            margin: "0 auto 16px",
            filter: isBasketball
              ? "drop-shadow(0 0 45px rgba(255,165,0,0.65))"
              : "drop-shadow(0 0 25px rgba(255,128,64,0.65))",
            animation: "pulseGlow 2.5s ease-in-out infinite",
          }}
          alt="logo"
        />

        <h1
          style={{
            fontSize: "2.4rem",
            marginBottom: 6,
            fontWeight: 900,
            background: isBasketball
              ? "linear-gradient(90deg,#ffea80,#ffb300,#ff6a00,#ff3b00)"
              : "linear-gradient(90deg,#ffd8a6,#ffa65c,#ff7a00,#ff3b0a)",
            WebkitBackgroundClip: "text",
            color: "transparent",
            textShadow: isBasketball
              ? "0 0 22px rgba(255,150,40,0.4)"
              : "0 0 18px rgba(255,120,40,0.25)",
          }}
        >
          🎉 Thank You!
        </h1>

        <p
          style={{
            color: "#f3e8e0",
            marginBottom: 18,
            opacity: 0.9,
            whiteSpace: "pre-line",
            fontSize: isBasketball ? "1.2rem" : "1rem",
          }}
        >
          {message}
        </p>

        {!showCloseHint ? (
          <button
            onClick={handleClose}
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              background:
                "linear-gradient(90deg,#475569,#0f172a)",
              color: "#fff",
              fontWeight: 600,
              border: "none",
              width: "100%",
            }}
          >
            Close
          </button>
        ) : (
          <p style={{ color: "#fff", fontSize: 16, marginTop: 6 }}>
            You can now close this tab
          </p>
        )}
      </div>

      {/* ANIMATIONS */}
      <style>{`
        @keyframes pulseGlow {
          0%, 100% { filter: drop-shadow(0 0 15px rgba(255,150,40,0.55)); }
          50% { filter: drop-shadow(0 0 35px rgba(255,200,80,0.9)); }
        }
      `}</style>
    </div>
  );
}
