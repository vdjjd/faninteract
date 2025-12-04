"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
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
  const { data: game } = await supabase
    .from("bb_games")
    .select("host_id")
    .eq("id", id)
    .maybeSingle();

  if (!game?.host_id) {
    return {
      host: { branding_logo_url: "/faninteractlogo.png" },
    };
  }

  const { data: host } = await supabase
    .from("hosts")
    .select("branding_logo_url, logo_url")
    .eq("id", game.host_id)
    .maybeSingle();

  return {
    host: {
      branding_logo_url:
        host?.branding_logo_url ||
        host?.logo_url ||
        "/faninteractlogo.png",
    },
  };
}

/* ====================================================================== */
/*                              COMPONENT                                 */
/* ====================================================================== */
export default function ThankYouPage() {
  const { id } = useParams();
  const router = useRouter();
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
  const [profile, setProfile] = useState<any>(null);
  const [showCloseHint, setShowCloseHint] = useState(false);
  const wheelRowRef = useRef<any>(null);

  /* ----------------------------- load profile ----------------------------- */
  useEffect(() => {
    setProfile(getStoredGuestProfile());
  }, []);

  /* ----------------------------- auto mark basketball session ----------------------------- */
  useEffect(() => {
    if (type === "basketball") {
      try {
        localStorage.setItem("bb_waiting", "true");
      } catch {}
    }
  }, [type]);

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

      const { data } = await supabase
        .from(table)
        .select(
          `id, title, background_value,
           remote_spin_enabled, selected_remote_spinner,
           host:host_id ( branding_logo_url, logo_url )`
        )
        .eq("id", id as string)
        .maybeSingle();

      setData(data);

      if (type === "wheel" && data) {
        wheelRowRef.current = data;
      }
    })();
  }, [id, type, supabase]);

  /* ====================================================================== */
  /*               REALTIME LISTENER → PLAYER APPROVED                     */
  /* ====================================================================== */
  useEffect(() => {
    if (type !== "basketball" || !profile?.id || !id) return;

    const channel = supabase
      .channel(`bb-approval-${profile.id}`)
      .on(
        "postgres_changes",
        {
          schema: "public",
          table: "bb_game_players",
          event: "INSERT",
          filter: `guest_profile_id=eq.${profile.id}`,
        },
        async (payload: any) => {
          const player = payload.new;
          if (!player) return;

          try {
            localStorage.setItem("bb_player_id", player.id);
            localStorage.removeItem("bb_waiting");
          } catch {}

          router.replace(`/basketball/${id}/shoot`);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [type, profile?.id, id, supabase, router]);

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
    setShowCloseHint(true);
    try {
      window.close();
    } catch {}
  };

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
          }}
        >
          🎉 Thank You!
        </h1>

        <p style={{ color: "#f3e8e0", marginBottom: 18, opacity: 0.9 }}>
          {message}
        </p>

        {/* 🔥 BASKETBALL NOTICE */}
        {type === "basketball" && (
          <div
            style={{
              marginTop: 20,
              padding: "14px 18px",
              background: "rgba(255,150,0,0.15)",
              border: "1px solid rgba(255,120,0,0.35)",
              borderRadius: 12,
              color: "#ffd9b3",
              fontSize: "1.2rem",
              fontWeight: 700,
              lineHeight: 1.4,
            }}
          >
            🚀 <span style={{ color: "#fff" }}>Keep this page open!</span>
            <br />
            This becomes your <strong>Basketball Controller</strong> once approved.
          </div>
        )}

        {!showCloseHint ? (
          <button
            onClick={handleClose}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              background: "linear-gradient(90deg,#475569,#0f172a)",
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
    </div>
  );
}
