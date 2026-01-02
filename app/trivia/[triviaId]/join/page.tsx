"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Cropper from "react-easy-crop";
import imageCompression from "browser-image-compression";
import { getSupabaseClient } from "@/lib/supabaseClient";

/* ---------- Load stored guest profile ---------- */
function getStoredGuestProfile() {
  if (typeof window === "undefined") return null;
  try {
    const raw =
      localStorage.getItem("guest_profile") ||
      localStorage.getItem("guestInfo");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const supabase = getSupabaseClient();

export default function TriviaJoinPage() {
  const router = useRouter();
  const params = useParams();

  const triviaId = Array.isArray(params.triviaId)
    ? params.triviaId[0]
    : (params.triviaId as string);

  const [trivia, setTrivia] = useState<any | null>(null);

  const [profile, setProfile] = useState<any | null | undefined>(undefined);
  // undefined = still checking
  // null       = redirecting / missing
  // object     = ready

  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");

  const [playerId, setPlayerId] = useState<string | null>(null);
  const [waitingApproval, setWaitingApproval] = useState(false);

  /* Image / crop state (selfie) */
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

  const [errorMsg, setErrorMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  /* -------------------------------------------------- */
  /* 1️⃣ LOAD PROFILE OR REDIRECT TO SIGNUP             */
  /* -------------------------------------------------- */
  useEffect(() => {
    if (!triviaId) {
      setProfile(null);
      return;
    }

    let cancelled = false;

    async function loadAndValidateProfile() {
      const p = getStoredGuestProfile();

      const hasValidLocal = p && typeof p.id === "string" && p.id.length > 0;

      // No local profile → redirect to signup
      if (!hasValidLocal) {
        try {
          localStorage.removeItem("guest_profile");
          localStorage.removeItem("guestInfo");
        } catch {
          // ignore
        }

        const backTo = `/trivia/${triviaId}/join`;
        router.replace(
          `/guest/signup?trivia=${triviaId}&redirect=${encodeURIComponent(
            backTo
          )}`
        );

        setProfile(null); // show "Redirecting..." instead of white
        return;
      }

      // ✅ Check that this guest actually still exists in guest_profiles
      const { data, error } = await supabase
        .from("guest_profiles")
        .select("id, email, phone, first_name, last_name")
        .eq("id", p.id)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error("❌ guest_profiles DB check error:", error);
      }

      if (!data) {
        // Local cache is stale / deleted in DB
        try {
          localStorage.removeItem("guest_profile");
          localStorage.removeItem("guestInfo");
        } catch {
          // ignore
        }

        const backTo = `/trivia/${triviaId}/join`;
        router.replace(
          `/guest/signup?trivia=${triviaId}&redirect=${encodeURIComponent(
            backTo
          )}`
        );

        setProfile(null);
        return;
      }

      // Merge latest DB basics into local profile (so email/phone are fresh)
      setProfile({
        ...p,
        email: data.email,
        phone: data.phone,
        first_name: data.first_name,
        last_name: data.last_name,
      });
    }

    loadAndValidateProfile();

    return () => {
      cancelled = true;
    };
  }, [router, triviaId]);

  /* -------------------------------------------------- */
  /* 2️⃣ LOAD TRIVIA CONFIG (TITLE / BG / LOGO / SELFIE) */
  /* -------------------------------------------------- */
  useEffect(() => {
    if (!triviaId) return;

    let cancelled = false;

    async function loadTrivia() {
      // Step 1: load trivia card (no relationship magic)
      const { data, error } = await supabase
        .from("trivia_cards")
        .select(
          `
          id,
          public_name,
          background_type,
          background_value,
          require_selfie,
          host_id
        `
        )
        .eq("id", triviaId)
        .maybeSingle();

      if (cancelled) return;

      if (error || !data) {
        console.error("❌ Load trivia card error:", error);
        // Fallback so the page STILL WORKS
        setTrivia({
          id: triviaId,
          public_name: "Trivia Game",
          background_type: "color",
          background_value: "linear-gradient(135deg,#020617,#0f172a)",
          require_selfie: true,
          host: null,
        });
        return;
      }

      // Step 2: load host logo separately (if host_id exists)
      let host: any = null;
      if (data.host_id) {
        const { data: hostRow, error: hostErr } = await supabase
          .from("hosts")
          .select("id, venue_name, branding_logo_url, logo_url")
          .eq("id", data.host_id)
          .maybeSingle();

        if (!cancelled) {
          if (hostErr) {
            console.error("❌ Load trivia host error:", hostErr);
          }
          if (hostRow) {
            host = hostRow;
          }
        }
      }

      if (!cancelled) {
        setTrivia({ ...data, host });
      }
    }

    loadTrivia();

    return () => {
      cancelled = true;
    };
  }, [triviaId]);

  /* -------------------------------------------------- */
  /* CAMERA + FILE HANDLING                             */
  /* -------------------------------------------------- */
  const openCamera = () => {
    if (fileRef.current) {
      fileRef.current.setAttribute("capture", "user");
      fileRef.current.click();
    }
  };

  const handleFile = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const compressed = await imageCompression(file, {
      maxSizeMB: 0.6,
      maxWidthOrHeight: 1080,
      useWebWorker: true,
    });

    const reader = new FileReader();
    reader.onload = () => setImageSrc(reader.result as string);
    reader.readAsDataURL(compressed);
  };

  /* Base64 → Blob */
  function base64ToBlob(dataURL: string) {
    const [header, base64] = dataURL.split(",");
    const mime = header.match(/:(.*?);/)?.[1] || "image/jpeg";
    const binary = atob(base64);
    const len = binary.length;
    const buffer = new ArrayBuffer(len);
    const view = new Uint8Array(buffer);

    for (let i = 0; i < len; i++) {
      view[i] = binary.charCodeAt(i);
    }

    return new Blob([buffer], { type: mime });
  }

  /* Simple crop export – we're already compressing on input. */
  async function uploadImage() {
    if (!imageSrc || !profile?.id) return null;

    const blob = base64ToBlob(imageSrc);
    const fileName = `${profile.id}-${Date.now()}-trivia.jpg`;

    const { error } = await supabase.storage
      .from("guest_uploads")
      .upload(fileName, blob, { contentType: "image/jpeg" });

    if (error) {
      console.error("❌ Upload trivia selfie error:", error);
      return null;
    }

    const { data } = supabase.storage
      .from("guest_uploads")
      .getPublicUrl(fileName);

    return data.publicUrl;
  }

  /* -------------------------------------------------- */
  /* 3️⃣ JOIN TRIVIA → INSERT trivia_players             */
  /*    Stay here & wait for moderation                  */
  /* -------------------------------------------------- */
  async function handleJoinTrivia(e: any) {
    e.preventDefault();
    setJoinError("");
    setErrorMsg("");

    if (!profile?.id) {
      setJoinError("Missing guest profile. Please sign up again.");
      try {
        localStorage.removeItem("guest_profile");
        localStorage.removeItem("guestInfo");
      } catch {
        // ignore
      }
      const backTo = `/trivia/${triviaId}/join`;
      router.replace(
        `/guest/signup?trivia=${triviaId}&redirect=${encodeURIComponent(
          backTo
        )}`
      );
      return;
    }

    if (!triviaId) {
      setJoinError("Invalid trivia link.");
      return;
    }

    const hasEmail = profile?.email?.trim();
    const hasPhone = profile?.phone?.trim();

    if (!hasEmail && !hasPhone) {
      setErrorMsg("You must provide either an email or a phone number.");
      return;
    }

    const requireSelfie = trivia?.require_selfie ?? true;

    if (requireSelfie && !imageSrc) {
      setErrorMsg("You must upload a selfie to continue.");
      return;
    }

    setJoining(true);

    try {
      // 1️⃣ Find MOST RECENT session for this card (any status)
      const { data: session, error: sessionErr } = await supabase
        .from("trivia_sessions")
        .select("id,status,created_at")
        .eq("trivia_card_id", triviaId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sessionErr) {
        console.error("❌ trivia_sessions fetch error:", sessionErr);
        setJoinError("Something went wrong. Please try again.");
        return;
      }

      let sessionId: string;

      // 2️⃣ If no session, or last is finished → create a new "waiting" session
      if (!session || session.status === "finished") {
        const { data: newSession, error: newSessionErr } = await supabase
          .from("trivia_sessions")
          .insert({
            trivia_card_id: triviaId,
            status: "waiting",
          })
          .select("id")
          .single();

        if (newSessionErr || !newSession) {
          console.error(
            "❌ trivia_sessions create error:",
            newSessionErr
          );
          setJoinError("Could not join the game. Please try again.");
          return;
        }

        sessionId = newSession.id;
      } else {
        // Otherwise use the latest existing session
        sessionId = session.id;
      }

      // 🔒 Remember which session + card this guest is in
      try {
        localStorage.setItem("current_trivia_session_id", sessionId);
        localStorage.setItem("current_trivia_card_id", triviaId);
      } catch {
        // ignore storage errors
      }

      // 3️⃣ Upload selfie (if required)
      let photoUrl: string | null = null;
      if (requireSelfie && imageSrc) {
        photoUrl = await uploadImage();
      }

      const displayName =
        `${profile.first_name || ""} ${profile.last_name || ""}`.trim() ||
        profile.nickname ||
        "Guest";

      // 4️⃣ Check if player already exists for THIS session
      const { data: existingPlayer } = await supabase
        .from("trivia_players")
        .select("id")
        .eq("session_id", sessionId)
        .eq("guest_id", profile.id)
        .maybeSingle();

      let newPlayerId: string | null = null;

      if (existingPlayer) {
        const { data: updated, error: updateErr } = await supabase
          .from("trivia_players")
          .update({
            display_name: displayName,
            photo_url: photoUrl,
            status: "pending", // back into moderation
          })
          .eq("id", existingPlayer.id)
          .select("id")
          .maybeSingle();

        if (updateErr) {
          console.error("❌ trivia_players update error:", updateErr);
          setJoinError("Could not update your info. Please try again.");
          return;
        }

        newPlayerId = updated?.id || existingPlayer.id;
      } else {
        const { data: inserted, error: insertErr } = await supabase
          .from("trivia_players")
          .insert({
            session_id: sessionId,
            guest_id: profile.id,
            display_name: displayName,
            photo_url: photoUrl,
            status: "pending", // ALWAYS moderation
          })
          .select("id")
          .maybeSingle();

        if (insertErr) {
          console.error("❌ trivia_players insert error:", insertErr);
          setJoinError("Could not join the game. Please try again.");
          return;
        }

        newPlayerId = inserted?.id ?? null;
      }

      if (newPlayerId) {
        setPlayerId(newPlayerId);
        setWaitingApproval(true);
        console.log(
          "🔍 Waiting for approval on trivia_players id:",
          newPlayerId
        );
      }
      // We stay here and wait for moderation.
    } finally {
      setJoining(false);
    }
  }

  /* -------------------------------------------------- */
  /* 4️⃣ WATCH THIS trivia_player FOR APPROVAL / REJECT  */
  /*    POLLING ONLY (no realtime)                      */
  /* -------------------------------------------------- */
  useEffect(() => {
    if (!playerId || !triviaId) return;

    let cancelled = false;

    const checkStatus = async () => {
      const { data, error } = await supabase
        .from("trivia_players")
        .select("status")
        .eq("id", playerId)
        .maybeSingle();

      if (error) {
        console.error("❌ Poll trivia_players error:", error);
        return;
      }

      if (!data || cancelled) return;

      if (data.status === "approved") {
        console.log("✅ Player approved (polling), redirecting…");
        router.replace(`/thanks/${triviaId}?type=trivia`);
      } else if (data.status === "rejected") {
        console.log("🚫 Player rejected (polling)");
        setJoinError("Sorry, the host rejected your entry.");
        setWaitingApproval(false);
      }
    };

    checkStatus();
    const intervalId = setInterval(checkStatus, 2000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [playerId, triviaId, router]);

  /* -------------------------------------------------- */
  /* 5️⃣ RENDER JOIN UI                                 */
  /* -------------------------------------------------- */

  // Still figuring out profile (or redirecting)
  if (profile === undefined) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "black",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
        }}
      >
        Loading your profile…
      </div>
    );
  }

  // We decided you have no valid profile → redirecting to signup
  if (profile === null) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "black",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
        }}
      >
        Redirecting to signup…
      </div>
    );
  }

  // Trivia still loading (but we *do* have a profile)
  if (!trivia) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "black",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
        }}
      >
        Loading trivia…
      </div>
    );
  }

  const bg =
    trivia?.background_type === "image" &&
    trivia?.background_value?.startsWith("http")
      ? `url(${trivia.background_value})`
      : trivia?.background_value || "linear-gradient(135deg,#020617,#0f172a)";

  const logo =
    trivia?.host?.branding_logo_url?.trim() ||
    trivia?.host?.logo_url?.trim() ||
    "/faninteractlogo.png";

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundImage: bg,
        backgroundSize: "cover",
        backgroundPosition: "center",
        position: "relative",
        padding: 20,
        color: "#fff",
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

      <form
        onSubmit={handleJoinTrivia}
        style={{
          position: "relative",
          maxWidth: 480,
          margin: "80px auto 40px",
          padding: 24,
          borderRadius: 18,
          background: "rgba(0,0,0,0.6)",
          boxShadow: "0 0 30px rgba(0,0,0,0.7)",
          border: "1px solid rgba(255,255,255,0.15)",
          textAlign: "center",
          zIndex: 10,
        }}
      >
        <img
          src={logo}
          alt="Host Logo"
          style={{
            width: "60%",
            margin: "0 auto 12px",
            display: "block",
            filter: "drop-shadow(0 0 25px rgba(56,189,248,0.6))",
          }}
        />

        <h2 style={{ marginBottom: 8, fontSize: 24, fontWeight: 700 }}>
          {trivia?.public_name || "Trivia Game"}
        </h2>

        <p
          style={{
            fontSize: 14,
            opacity: 0.85,
            marginBottom: 16,
          }}
        >
          You&apos;re signing in as:
        </p>

        <input
          value={
            (profile.first_name || "") +
            (profile.last_name ? " " + profile.last_name : "")
          }
          readOnly
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 10,
            marginBottom: 12,
            background: "rgba(0,0,0,0.4)",
            color: "#fff",
            textAlign: "center",
            border: "1px solid #334155",
          }}
        />

        {/* SELFIE CROP AREA */}
        <div
          style={{
            width: "100%",
            height: 260,
            position: "relative",
            borderRadius: 12,
            overflow: "hidden",
            marginBottom: 10,
            background: "rgba(0,0,0,0.3)",
            touchAction: "none",
            zIndex: 1,
          }}
        >
          {imageSrc ? (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_, c) => setCroppedAreaPixels(c)}
              style={{
                containerStyle: {
                  touchAction: "none",
                },
              }}
            />
          ) : (
            <div
              style={{
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#aaa",
                fontSize: 16,
              }}
            >
              📸 No Photo Yet
            </div>
          )}
        </div>

        {errorMsg && (
          <div
            style={{
              color: "#ffb3b3",
              fontSize: 14,
              marginBottom: 10,
              fontWeight: 600,
            }}
          >
            {errorMsg}
          </div>
        )}

        {joinError && (
          <div
            style={{
              color: "#ffb3b3",
              fontSize: 14,
              marginBottom: 10,
              fontWeight: 600,
            }}
          >
            {joinError}
          </div>
        )}

        <button
          type="button"
          onClick={openCamera}
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 10,
            background: "linear-gradient(90deg,#0284c7,#2563eb)",
            color: "#fff",
            marginBottom: 6,
          }}
        >
          📸 Take Photo
        </button>

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 10,
            background: "rgba(255,255,255,0.12)",
            color: "#fff",
            marginBottom: 10,
          }}
        >
          📁 Choose File
        </button>

        <input
          ref={fileRef}
          type="file"
          hidden
          accept="image/*"
          onChange={handleFile}
        />

        <button
          type="submit"
          disabled={joining || waitingApproval}
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 10,
            marginTop: 10,
            background: "linear-gradient(90deg,#22c55e,#16a34a)",
            color: "#fff",
            fontWeight: 700,
            opacity: joining || waitingApproval ? 0.6 : 1,
          }}
        >
          {waitingApproval
            ? "Waiting for Host Approval…"
            : joining
            ? "Joining…"
            : "Join Trivia Game"}
        </button>

        {waitingApproval && (
          <p
            style={{
              marginTop: 8,
              fontSize: 13,
              color: "#bfdbfe",
            }}
          >
            Please keep this screen open. The host is reviewing your selfie.
          </p>
        )}

        <p
          style={{
            marginTop: 10,
            fontSize: 12,
            opacity: 0.75,
          }}
        >
          Your selfie may be shown on the big screen after host approval.
        </p>
      </form>
    </div>
  );
}
