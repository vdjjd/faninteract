"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
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
    "lead";

  if (rawType) detectedType = rawType.toLowerCase();
  const type = detectedType;

  const [data, setData] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [visitInfo, setVisitInfo] = useState<any>(null);

  /* ---------------------------------------------------------
     Load guest profile
  --------------------------------------------------------- */
  useEffect(() => {
    setProfile(getStoredGuestProfile());
  }, []);

  /* ---------------------------------------------------------
     Load host + background (PATCHED)
  --------------------------------------------------------- */
  useEffect(() => {
    if (!id) return;

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

      // ✅ PATCH: basketball does NOT have background_value
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
        .eq("id", id as string)
        .maybeSingle();

      setData(data);
    })();
  }, [id, type, supabase]);

  /* ---------------------------------------------------------
     Record visit (ALWAYS)
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
     Badge logic (STRICT)
  --------------------------------------------------------- */
  const badge =
    visitInfo?.loyaltyDisabled ? null : visitInfo?.badge ?? null;

  /* ---------------------------------------------------------
     UI helpers (PATCHED)
  --------------------------------------------------------- */
  const bg =
    type === "basketball"
      ? "linear-gradient(135deg,#0a2540,#1b2b44,#000000)"
      : data?.background_value?.includes("http")
      ? `url(${data.background_value})`
      : data?.background_value ||
        "linear-gradient(135deg,#0a2540,#1b2b44,#000000)";

  // ✅ PATCH: safer logo fallback
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
        return "Your basketball entry was submitted!";
        return "Keep This Page Open It becomes Your Controller!!";
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
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(6px)",
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
          background: "rgba(0,0,0,0.6)",
          border: "1px solid rgba(255,255,255,0.1)",
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

        <button
          onClick={() => window.close()}
          style={{
            width: "100%",
            padding: "10px 16px",
            borderRadius: 10,
            background: "linear-gradient(90deg,#475569,#0f172a)",
            color: "#fff",
            fontWeight: 600,
            marginTop: 22,
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
