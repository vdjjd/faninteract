"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Cropper from "react-easy-crop";
import imageCompression from "browser-image-compression";
import { supabase } from "@/lib/supabaseClient";

/* -------------------------------------------------------------- */
/* Load stored guest profile                                      */
/* -------------------------------------------------------------- */
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

  // Image Crop State
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const fileRef = useRef<HTMLInputElement>(null);

  /* -------------------------------------------------------------- */
  /* Load profile or redirect                                       */
  /* -------------------------------------------------------------- */
  useEffect(() => {
    const stored = getStoredGuestProfile();
    if (!stored) {
      router.replace(`/guest/signup?basketball=${gameId}`);
      return;
    }
    setProfile(stored);
  }, [router, gameId]);

  /* -------------------------------------------------------------- */
  /* LOAD GAME — Correct Supabase Join                              */
  /* -------------------------------------------------------------- */
  useEffect(() => {
    async function loadGame() {
      const { data, error } = await supabase
        .from("bb_games")
        .select(`
          id,
          title,
          status,
          max_players,
          duration_seconds,
          host:hosts (
            branding_logo_url,
            logo_url
          )
        `)
        .eq("id", gameId)
        .single();

      if (error) {
        console.error("❌ Failed to load bb_game:", error);
        return;
      }

      setGame(data);
    }

    loadGame();
  }, [gameId]);

  /* -------------------------------------------------------------- */
  /* IMAGE + CROP HANDLING                                          */
  /* -------------------------------------------------------------- */
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

  const uploadImage = async () => {
    if (!imageSrc) return null;

    const blob = base64ToBlob(imageSrc);
    const fileName = `${profile.id}-${Date.now()}-bb.jpg`;

    const { error } = await supabase.storage
      .from("guest_uploads")
      .upload(fileName, blob, { contentType: "image/jpeg" });

    if (error) {
      console.error("❌ Upload error:", error);
      return null;
    }

    const { data } = supabase.storage
      .from("guest_uploads")
      .getPublicUrl(fileName);

    return data.publicUrl;
  };

  /* -------------------------------------------------------------- */
  /* SUBMIT ENTRY                                                   */
  /* -------------------------------------------------------------- */
  const submitEntry = async (e: any) => {
    e.preventDefault();
    setErrorMsg("");

    // Require selfie
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

    // FINAL FIX — Correct Thank You Redirect
    router.push(`/thanks/${gameId}?type=basketball`);
  };

  if (!game || !profile) return null;

  /* -------------------------------------------------------------- */
  /* BACKGROUND + LOGO                                              */
  /* -------------------------------------------------------------- */
  const bg = "url(/BBgamebackground.png)";

  const displayLogo =
    game?.host?.branding_logo_url ||
    game?.host?.logo_url ||
    "/faninteractlogo.png";

  /* -------------------------------------------------------------- */
  /* UI                                                             */
  /* -------------------------------------------------------------- */
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

      {/* MAIN SUBMISSION FORM */}
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
            filter: "drop-shadow(0 0 25px rgba(255,165,0,0.6))",
          }}
        />

        <h2 style={{ marginBottom: 16 }}>{game.title}</h2>

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
          <div style={{ color: "#ffb3b3", marginBottom: 10 }}>{errorMsg}</div>
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

        <input
          value={`${profile.first_name} ${profile.last_name}`}
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
            background: "linear-gradient(90deg,#ff8a00,#ff3d00)",
            color: "#fff",
            fontWeight: 700,
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? "Submitting…" : "Enter Basketball Game"}
        </button>
      </form>
    </div>
  );
}
