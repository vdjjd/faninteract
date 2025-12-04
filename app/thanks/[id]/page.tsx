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

/* ----------------------------- helper fn OUTSIDE blocks ----------------------------- */
async function loadBasketballData(supabase: any, id: string) {
  // Load bb_game → host_id
  const { data: game, error: gErr } = await supabase
    .from("bb_games")
    .select("host_id")
    .eq("id", id)
    .maybeSingle();

  if (gErr) {
    console.error("❌ Basketball ThankYou load error:", gErr);
    return {
      host: { branding_logo_url: "/faninteractlogo.png" },
    };
  }

  if (!game?.host_id) {
    return {
      host: { branding_logo_url: "/faninteractlogo.png" },
    };
  }

  // Load host record
  const { data: host, error: hErr } = await supabase
    .from("hosts")
    .select("branding_logo_url, logo_url")
    .eq("id", game.host_id)
    .maybeSingle();

  if (hErr) {
    console.error("❌ Basketball host load error:", hErr);
  }

  return {
    host: {
      branding_logo_url:
        host?.branding_logo_url ||
        host?.logo_url ||
        "/faninteractlogo.png",
    },
  };
}

export default function ThankYouPage() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const supabase = getSupabaseClient();

  const rawType = searchParams.get("type");
  const path =
    typeof window !== "undefined" ? window.location.pathname : "";

  let detectedType =
    path.includes("/basketball/") ? "basketball" :
    path.includes("/polls/") ? "poll" :
    path.includes("/prizewheel/") ? "wheel" :
    path.includes("/wall/") ? "wall" :
    null;

  if (rawType) detectedType = rawType.toLowerCase();

  const type = detectedType || "lead";

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

    (async () => {
      if (type === "basketball") {
        const result = await loadBasketballData(supabase, id as string);
        setData(result);
        return;
      }

      if (type === "lead") {
        setData({
          background_value: null,
          host: { branding_logo_url: "/faninteractlogo.png" },
        });
        return;
      }

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
           host:host_id ( branding_logo_url, logo_url )`
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
    })();
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
    data?.host?.branding_logo_url ||
    data?.host?.logo_url ||
    "/faninteractlogo.png";

  const message = useMemo(() => {
    switch (type) {
      case "basketball":
        return "Your basketball entry was submitted!";
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
    // ❌ window.close() returns void → cannot test it
    // ✔ Always show hint instead
    setShowCloseHint(true);
    try {
      window.close();
    } catch {}
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

        {/* wheel-only messaging */}
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

        {/* wheel remote button */}
        {type === "wheel" && remoteEnabled && armed && (
          <button
            onClick={handleRemotePress}
            disabled={pressing}
            style={{
              width: "100%",
              padding: "26px 0",
              borderRadius: 9999,
              color: "#fff",
              fontWeight: 900,
              cursor: pressing ? "not-allowed" : "pointer",
              marginBottom: 14,
              background:
                "radial-gradient(circle at 50% 50%, #ff7a00 0%, #ff3b0a 55%, #b81d08 100%)",
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

      <style>{`
        @keyframes pulseGlow {
          0%, 100% { filter: drop-shadow(0 0 15px rgba(255,120,40,0.5)); }
          50% { filter: drop-shadow(0 0 35px rgba(255,160,80,0.9)); }
        }
      `}</style>
    </div>
  );
}
