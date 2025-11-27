"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";

/* ----------------------------- helpers ----------------------------- */
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

  /* ---------------------------------------------------------------
     DETECT TYPE (NOW INCLUDES LEAD)
  ---------------------------------------------------------------- */
  const rawType = searchParams.get("type");
  const path =
    typeof window !== "undefined" ? window.location.pathname : "";

  let detectedType =
    path.includes("/polls/") ? "poll" :
    path.includes("/prizewheel/") ? "wheel" :
    path.includes("/wall/") ? "wall" :
    null;

  if (rawType) detectedType = rawType.toLowerCase();

  // NEW: LEADS default to type "lead"
  const type = detectedType || "lead";

  /* --------------------------------------------------------------- */

  const [data, setData] = useState<any>(null);
  const [showCloseHint, setShowCloseHint] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [remoteEnabled, setRemoteEnabled] = useState(false);
  const [armed, setArmed] = useState(false);
  const [pressing, setPressing] = useState(false);

  const wheelRowRef = useRef<any>(null);

  /* ----------------------------- load profile ----------------------------- */
  useEffect(() => {
    setProfile(getStoredGuestProfile());
  }, []);

  /* ----------------------------- fetch data ----------------------------- */
  useEffect(() => {
    if (!id) return;

    // LEADS DO NOT FETCH FAN WALL / POLL / WHEEL TABLES  
    if (type === "lead") {
      setData({ background_value: null, host: { branding_logo_url: "/faninteractlogo.png" } });
      return;
    }

    async function fetchData() {
      const table =
        type === "poll"
          ? "polls"
          : type === "wheel"
          ? "prize_wheels"
          : "fan_walls";

      const { data, error } = await supabase
        .from(table)
        .select(
          `id, title, background_value,
           remote_spin_enabled, selected_remote_spinner,
           host:host_id ( branding_logo_url )`
        )
        .eq("id", id as string)
        .maybeSingle();

      if (error) console.error("❌ ThankYou fetch error:", error);

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

  /* ----------------------------- realtime (wheel only) ----------------------------- */
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

    const bc = supabase
      .channel(`prizewheel-${id}`)
      .on("broadcast", { event: "remote_spinner_selected" }, (msg: any) => {
        const { selected_guest_id } = msg?.payload || {};
        if (!selected_guest_id) return;
        setArmed(
          !!remoteEnabled &&
            !!profile?.id &&
            selected_guest_id === profile.id
        );
      })
      .subscribe();

    return () => {
      supabase.removeChannel(rowChannel);
      supabase.removeChannel(bc);
    };
  }, [id, type, supabase, profile?.id, remoteEnabled]);

  /* ----------------------------- ui helpers ----------------------------- */

  const bg =
    type === "lead"
      ? "linear-gradient(135deg,#0a2540,#1b2b44,#000000)"
      : data?.background_value ||
        "linear-gradient(135deg,#0a2540,#1b2b44,#000000)";

  const displayLogo =
    type === "lead"
      ? "/faninteractlogo.png"
      : data?.host?.branding_logo_url &&
        data.host.branding_logo_url.trim() !== ""
      ? data.host.branding_logo_url
      : "/faninteractlogo.png";

  const message = useMemo(() => {
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

  /* ----------------------------- handlers ----------------------------- */
  const handleClose = () => {
    const closed = window.close();
    if (!closed) setShowCloseHint(true);
  };

  async function handleRemotePress() {
    if (!id || !profile?.id) return;
    setPressing(true);
    try {
      await supabase
        .channel(`prizewheel-${id}`)
        .send({
          type: "broadcast",
          event: "remote_spin_pressed",
          payload: { wheel_id: id, guest_id: profile.id },
        });

      await supabase
        .from("prize_wheels")
        .update({ selected_remote_spinner: null })
        .eq("id", id as string);

      setArmed(false);
    } catch (e) {
      console.error("remote press error", e);
    } finally {
      setPressing(false);
    }
  }

  /* ----------------------------- styles ----------------------------- */
  const firePulseButton: React.CSSProperties = {
    width: "100%",
    padding: "26px 0",
    border: "none",
    borderRadius: 9999,
    fontSize: "1.5rem",
    textTransform: "uppercase",
    color: "#fff",
    fontWeight: 900,
    letterSpacing: "1px",
    background:
      "radial-gradient(circle at 50% 50%, #ff7a00 0%, #ff3b0a 55%, #b81d08 100%)",
    boxShadow:
      "0 0 34px rgba(255,90,0,0.55), inset 0 0 22px rgba(255,170,0,0.40)",
    animation: "firePulse 1.6s ease-in-out infinite",
    transform: "translateZ(0)",
  };

  const isFanWall =
    typeof window !== "undefined" &&
    window.location.href.includes("fanwall");

  /* ----------------------------- render ----------------------------- */
  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundImage: bg.includes("http") ? `url(${bg})` : bg,
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
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(6px)",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 10,
          maxWidth: 480,
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
            width: "72%",
            maxWidth: 260,
            margin: "0 auto 16px",
            filter: "drop-shadow(0 0 25px rgba(255,128,64,0.65))",
            animation: "pulseGlow 2.5s ease-in-out infinite",
          }}
          alt="logo"
        />

        <h1
          style={{
            fontSize: "2.2rem",
            marginBottom: 6,
            fontWeight: 900,
            background:
              "linear-gradient(90deg,#ffd8a6,#ffa65c,#ff7a00,#ff3b0a)",
            WebkitBackgroundClip: "text",
            color: "transparent",
            textShadow: "0 0 18px rgba(255,120,40,0.25)",
          }}
        >
          🎉 Thank You!
        </h1>

        <p style={{ color: "#f3e8e0", marginBottom: 18, opacity: 0.9 }}>
          {message}
        </p>

        {/* 🔥 ONLY SHOW FOR WHEELS */}
        {type === "wheel" && (
          <div
            style={{
              fontSize: 14,
              lineHeight: 1.35,
              color: "#ffe7d6",
              background:
                "linear-gradient(180deg, rgba(255,90,0,0.12), rgba(255,90,0,0.06))",
              border: "1px solid rgba(255,140,80,0.35)",
              padding: "10px 12px",
              borderRadius: 12,
              boxShadow: "0 0 14px rgba(255,110,20,0.18) inset",
              marginBottom: 16,
            }}
          >
            <strong>Stay right here…</strong>
            <br />
            At any moment, you could be chosen to{" "}
            <strong>SPIN THE WHEEL</strong> from your phone.
          </div>
        )}

        {/* 🔥 WHEEL REMOTE BUTTON */}
        {type === "wheel" && !isFanWall && remoteEnabled && armed && (
          <button
            onClick={handleRemotePress}
            disabled={pressing}
            style={{
              ...firePulseButton,
              opacity: pressing ? 0.7 : 1,
              cursor: pressing ? "not-allowed" : "pointer",
              marginBottom: 14,
            }}
          >
            🔥 SPIN THE WHEEL!
          </button>
        )}

        {!showCloseHint ? (
          <button
            onClick={handleClose}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
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
            ✅ You can now close this tab
          </p>
        )}
      </div>

      {/* ANIMATIONS */}
      <style>{`
        @keyframes pulseGlow {
          0%, 100% { filter: drop-shadow(0 0 15px rgba(255,120,40,0.5)); }
          50% { filter: drop-shadow(0 0 35px rgba(255,160,80,0.9)); }
        }
        @keyframes firePulse {
          0%   { box-shadow: 0 0 18px rgba(255,90,0,0.32), inset 0 0 10px rgba(255,170,0,0.28); transform: scale(1); }
          50%  { box-shadow: 0 0 38px rgba(255,60,0,0.55), inset 0 0 22px rgba(255,185,0,0.42); transform: scale(1.03); }
          100% { box-shadow: 0 0 18px rgba(255,90,0,0.32), inset 0 0 10px rgba(255,170,0,0.28); transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
