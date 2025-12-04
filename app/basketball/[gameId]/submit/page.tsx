"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Cropper from "react-easy-crop";
import imageCompression from "browser-image-compression";
import { supabase } from "@/lib/supabaseClient";

/* ---------------------------------------------- */
/* Load stored guest profile                      */
/* ---------------------------------------------- */
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

export default function BasketballSubmissionPage() {
  const router = useRouter();
  const params = useParams();

  const gameId = Array.isArray(params.gameId)
    ? params.gameId[0]
    : (params.gameId as string);

  const [game, setGame] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);

  /* Passcode */
  const [requirePasscode, setRequirePasscode] = useState(false);
  const [passInput, setPassInput] = useState("");
  const [passError, setPassError] = useState("");

  /* Image Crop State */
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

  /* Submission */
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const fileRef = useRef<HTMLInputElement>(null);

  /* ---------------------------------------------------------- */
  /* Load Profile or Redirect                                   */
  /* ---------------------------------------------------------- */
  useEffect(() => {
    const p = getStoredGuestProfile();
    if (!p) {
      router.replace(`/guest/signup?basketball=${gameId}`);
      return;
    }
    setProfile(p);
  }, [router, gameId]);

  /* ---------------------------------------------------------- */
  /* Load Game Config                                           */
  /* ---------------------------------------------------------- */
  useEffect(() => {
    async function loadGame() {
      const { data } = await supabase
        .from("bb_games")
        .select(
          "id,title,status,visibility,passphrase,host:host_id(branding_logo_url,logo_url)"
        )
        .eq("id", gameId)
        .single();

      setGame(data);

      if (data?.visibility === "private" && data?.passphrase) {
        setRequirePasscode(true);
      }
    }
    loadGame();
  }, [gameId]);

  /* ---------------------------------------------------------- */
  /* File Upload Handling                                       */
  /* ---------------------------------------------------------- */
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

  /* Convert base64 → Blob */
  function base64ToBlob(dataURL: string) {
    const [header, base64] = dataURL.split(",");
    const mime = header.match(/:(.*?);/)?.[1] || "image/jpeg";
    const binary = atob(base64);
    const len = binary.length;
    const buffer = new ArrayBuffer(len);
    const view = new Uint8Array(buffer);
    for (let i = 0; i < len; i++) view[i] = binary.charCodeAt(i);
    return new Blob([buffer], { type: mime });
  }

  /* Upload image to Supabase */
  const uploadImage = async () => {
    if (!imageSrc) return null;

    const blob = base64ToBlob(imageSrc);
    const fileName = `${profile.id}-${Date.now()}-bb.jpg`;

    const { error } = await supabase.storage
      .from("guest_uploads")
      .upload(fileName, blob, { contentType: "image/jpeg" });

    if (error) return null;

    const { data } = supabase.storage
      .from("guest_uploads")
      .getPublicUrl(fileName);

    return data.publicUrl;
  };

  /* ---------------------------------------------------------- */
  /* Submission: Insert into bb_game_entries                    */
  /* ---------------------------------------------------------- */
  const submitEntry = async (e: any) => {
    e.preventDefault();
    setErrorMsg("");
    setPassError("");

    /* Passcode Check */
    if (requirePasscode) {
      const gamePass = game?.passphrase || "";

      if (!passInput.trim()) {
        setPassError("Please enter the passcode.");
        return;
      }

      if (passInput.trim().toLowerCase() !== gamePass.toLowerCase()) {
        setPassError("Incorrect passcode.");
        return;
      }

      setRequirePasscode(false);
    }

    /* Image Required */
    if (!imageSrc) {
      setErrorMsg("You must upload a selfie to continue.");
      return;
    }

    const hasEmail = profile?.email?.trim();
    const hasPhone = profile?.phone?.trim();

    if (!hasEmail && !hasPhone) {
      setErrorMsg("You must provide either email or phone.");
      return;
    }

    setSubmitting(true);

    const photoUrl = await uploadImage();

    await supabase.from("bb_game_entries").insert([
      {
        game_id: gameId,
        guest_profile_id: profile.id,
        photo_url: photoUrl,
        first_name: profile.first_name,
        last_name: profile.last_name,
        status: "pending",
      },
    ]);

    router.push(`/thanks/basketball/${gameId}`);
  };

  if (!game || !profile) return null;

  /* Background logic (matches PrizeWheel) */
  const bg =
    game.background_type === "image" &&
    game.background_value?.startsWith("http")
      ? `url(${game.background_value})`
      : game.background_value || "linear-gradient(to bottom right,#1b2735,#090a0f)";

  /* Host Logo Logic */
  const displayLogo = game?.host?.branding_logo_url?.trim()
    ? game.host.branding_logo_url
    : game?.host?.logo_url?.trim()
    ? game.host.logo_url
    : "/faninteractlogo.png";

  /* ---------------------------------------------- */
  /* UI                                             */
  /* ---------------------------------------------- */
  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundImage: bg,
        backgroundSize: "cover",
        backgroundPosition: "center",
        position: "relative",
        padding: 20,
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

      {/* PASSCODE PROMPT */}
      {requirePasscode && (
        <div
          style={{
            position: "relative",
            zIndex: 20,
            maxWidth: 420,
            margin: "80px auto",
            padding: 24,
            borderRadius: 16,
            background: "rgba(0,0,0,0.7)",
            color: "#fff",
            textAlign: "center",
          }}
        >
          <h3 style={{ marginBottom: 12 }}>Enter Passcode</h3>

          <input
            value={passInput}
            onChange={(e) => setPassInput(e.target.value)}
            placeholder="Passcode"
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 10,
              marginBottom: 10,
              textAlign: "center",
              border: "1px solid #334155",
            }}
          />

          {passError && (
            <div style={{ color: "#ffb3b3", marginBottom: 10 }}>
              {passError}
            </div>
          )}

          <button
            onClick={submitEntry}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 10,
              background: "linear-gradient(90deg,#0284c7,#2563eb)",
              color: "#fff",
              marginTop: 8,
            }}
          >
            Continue
          </button>
        </div>
      )}

      {/* MAIN SUBMISSION FORM */}
      {!requirePasscode && (
        <form
          onSubmit={submitEntry}
          style={{
            position: "relative",
            zIndex: 20,
            maxWidth: 480,
            margin: "60px auto",
            padding: 25,
            borderRadius: 18,
            background: "rgba(0,0,0,0.55)",
            border: "1px solid rgba(255,255,255,0.15)",
            boxShadow: "0 0 30px rgba(0,0,0,0.6)",
            textAlign: "center",
          }}
        >
          {/* Logo */}
          <img
            src={displayLogo}
            style={{
              width: "70%",
              margin: "0 auto 12px",
              display: "block",
              filter: "drop-shadow(0 0 25px rgba(56,189,248,0.6))",
            }}
          />

          <h2 style={{ marginBottom: 16 }}>
            {game.title || "Basketball Battle Entry"}
          </h2>

          {/* Cropper */}
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
                onCropComplete={(_, area) => setCroppedAreaPixels(area)}
              />
            ) : (
              <div
                style={{
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#aaa",
                }}
              >
                📸 No Photo Yet
              </div>
            )}
          </div>

          {errorMsg && (
            <div style={{ color: "#ffb3b3", marginBottom: 10 }}>
              {errorMsg}
            </div>
          )}

          {/* Buttons */}
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

          {/* Name field (read-only) */}
          <input
            value={profile.first_name + " " + profile.last_name}
            readOnly
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 10,
              marginTop: 10,
              background: "rgba(0,0,0,0.4)",
              color: "#fff",
              textAlign: "center",
              border: "1px solid #334155",
            }}
          />

          <button
            disabled={submitting}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 10,
              marginTop: 20,
              background: "linear-gradient(90deg,#0284c7,#2563eb)",
              color: "#fff",
              fontWeight: 700,
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? "Submitting…" : "Enter Basketball Game"}
          </button>
        </form>
      )}
    </div>
  );
}
