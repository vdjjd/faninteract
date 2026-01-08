"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Cropper, { Area } from "react-easy-crop";
import imageCompression from "browser-image-compression";
import { supabase } from "@/lib/supabaseClient";

/* -------------------------------------------------------------- */
/* Guest Profile                                                  */
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

/* -------------------------------------------------------------- */
/* Basketball device token (stable per phone)                      */
/* -------------------------------------------------------------- */
function getOrCreateBbDeviceToken() {
  const KEY = "bb_device_token";
  let tok = "";
  try {
    tok = localStorage.getItem(KEY) || "";
  } catch {}

  if (!tok) {
    tok =
      (globalThis.crypto && "randomUUID" in globalThis.crypto
        ? (globalThis.crypto as any).randomUUID()
        : `bb_${Math.random().toString(16).slice(2)}_${Date.now()}`);
    try {
      localStorage.setItem(KEY, tok);
    } catch {}
  }

  return tok;
}

/* -------------------------------------------------------------- */
/* Crop helpers (canvas)                                          */
/* -------------------------------------------------------------- */
function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", (err) => reject(err));
    img.crossOrigin = "anonymous";
    img.src = url;
  });
}

async function getCroppedBlob(imageSrc: string, cropPixels: Area): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");

  canvas.width = cropPixels.width;
  canvas.height = cropPixels.height;

  ctx.drawImage(
    image,
    cropPixels.x,
    cropPixels.y,
    cropPixels.width,
    cropPixels.height,
    0,
    0,
    cropPixels.width,
    cropPixels.height
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error("Failed to create blob"));
        resolve(blob);
      },
      "image/jpeg",
      0.92
    );
  });
}

export default function BasketballSubmissionPage() {
  const router = useRouter();
  const params = useParams();

  const gameId = Array.isArray(params.gameId)
    ? params.gameId[0]
    : (params.gameId as string);

  const [game, setGame] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);

  const [deviceToken, setDeviceToken] = useState<string>("");

  // Image Crop State
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

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
    setDeviceToken(getOrCreateBbDeviceToken());
  }, [router, gameId]);

  /* -------------------------------------------------------------- */
  /* LOAD GAME                                                      */
  /* -------------------------------------------------------------- */
  useEffect(() => {
    async function loadGame() {
      const { data, error } = await supabase
        .from("bb_games")
        .select(
          `
          id,
          title,
          status,
          max_players,
          duration_seconds,
          host:hosts (
            branding_logo_url,
            logo_url
          )
        `
        )
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

    // compress before cropping to keep memory sane
    const compressed = await imageCompression(file, {
      maxSizeMB: 0.8,
      maxWidthOrHeight: 1400,
      useWebWorker: true,
    });

    const reader = new FileReader();
    reader.onload = () => setImageSrc(reader.result as string);
    reader.readAsDataURL(compressed);
  };

  const onCropComplete = useCallback((_croppedArea: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const uploadCroppedImage = async () => {
    if (!imageSrc || !croppedAreaPixels) return null;

    // crop to blob
    let blob = await getCroppedBlob(imageSrc, croppedAreaPixels);

    // optional: compress AFTER crop so uploads are small & consistent
    blob = await imageCompression(new File([blob], "bb.jpg", { type: "image/jpeg" }), {
      maxSizeMB: 0.35,
      maxWidthOrHeight: 900,
      useWebWorker: true,
    });

    const fileName = `${profile.id}-${Date.now()}-bb.jpg`;

    const { error } = await supabase.storage
      .from("guest_uploads")
      .upload(fileName, blob, { contentType: "image/jpeg" });

    if (error) {
      console.error("❌ Upload error:", error);
      return null;
    }

    const { data } = supabase.storage.from("guest_uploads").getPublicUrl(fileName);
    return data.publicUrl;
  };

  /* -------------------------------------------------------------- */
  /* SUBMIT ENTRY                                                   */
  /* -------------------------------------------------------------- */
  const submitEntry = async (e: any) => {
    e.preventDefault();
    setErrorMsg("");

    if (!imageSrc) {
      setErrorMsg("You must upload a selfie to continue.");
      return;
    }

    if (!croppedAreaPixels) {
      setErrorMsg("Please adjust the crop before submitting.");
      return;
    }

    const hasEmail = profile?.email?.trim();
    const hasPhone = profile?.phone?.trim();
    if (!hasEmail && !hasPhone) {
      setErrorMsg("You must provide either email or phone.");
      return;
    }

    if (!deviceToken) {
      setErrorMsg("Device token missing — please refresh and try again.");
      return;
    }

    setSubmitting(true);

    const photoUrl = await uploadCroppedImage();

    const { error } = await supabase.from("bb_game_entries").insert([
      {
        game_id: gameId,
        guest_profile_id: profile.id,
        device_token: deviceToken,
        photo_url: photoUrl,
        first_name: profile.first_name,
        last_name: profile.last_name,
        status: "pending",
      },
    ]);

    if (error) {
      console.error("❌ bb_game_entries insert error:", error);
      setErrorMsg("Submission failed. Please try again.");
      setSubmitting(false);
      return;
    }

    router.push(`/thanks/${gameId}?type=basketball`);
  };

  if (!game || !profile) return null;

  // ✅ NEW background
  const bg = "url(/bbgame1920x1080.png)";

  const displayLogo =
    game?.host?.branding_logo_url ||
    game?.host?.logo_url ||
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
        <img
          src={displayLogo}
          alt="logo"
          style={{
            width: "70%",
            margin: "0 auto 12px",
            display: "block",
            filter: "drop-shadow(0 0 25px rgba(255,165,0,0.6))",
          }}
        />

        <h2 style={{ marginBottom: 16 }}>{game.title}</h2>

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
              onCropComplete={onCropComplete}
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
          accept="image/*"
          onChange={handleFile}
          style={{ display: "none" }}
        />

        <button
          type="submit"
          disabled={submitting}
          style={{
            width: "100%",
            padding: 14,
            borderRadius: 12,
            background: submitting ? "#333" : "#ff6a00",
            color: "#000",
            fontWeight: 900,
            fontSize: 18,
            cursor: submitting ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "Submitting..." : "Submit"}
        </button>
      </form>
    </div>
  );
}
