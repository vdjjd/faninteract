"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Cropper from "react-easy-crop";
import imageCompression from "browser-image-compression";
import { getSupabaseClient } from "@/lib/supabaseClient";

/* ---------------------------------------------------------
   Get stored profile
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

/* ✅ REQUIRED HARD GUARD (ADDED) */
function requireGuestProfileId(profile: any): string {
  if (!profile || !profile.id) {
    throw new Error("Guest profile ID missing — invalid signup state");
  }
  return profile.id;
}

export default function GuestSubmissionPage() {
  const router = useRouter();
  const params = useParams();
  const wallUUID = Array.isArray(params.wallId)
    ? params.wallId[0]
    : (params.wallId as string);

  const supabase = getSupabaseClient();

  const [wall, setWall] = useState<any>(null);
  const [profile, setProfile] = useState<any | null>(undefined);

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  /* ---------------------------------------------------------
     Enforce signup BEFORE rendering anything
  --------------------------------------------------------- */
  useEffect(() => {
    const p = getStoredGuestProfile();

    if (!p) {
      router.replace(`/guest/signup?wall=${wallUUID}`);
      setProfile(null);
      return;
    }

    setProfile(p);
  }, [router, wallUUID]);

  /* ---------------------------------------------------------
     Load wall data
  --------------------------------------------------------- */
  useEffect(() => {
    async function loadWall() {
      const { data } = await supabase
        .from("fan_walls")
        .select(
          "id,title,background_type,background_value,host:host_id (id, branding_logo_url)"
        )
        .eq("id", wallUUID)
        .single();

      setWall(data);
    }
    loadWall();
  }, [supabase, wallUUID]);

  /* ---------------------------------------------------------
     Camera open
  --------------------------------------------------------- */
  const openCamera = () => {
    if (fileRef.current) {
      fileRef.current.setAttribute("capture", "user");
      fileRef.current.click();
    }
  };

  /* ---------------------------------------------------------
     File handler
  --------------------------------------------------------- */
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

  /* ---------------------------------------------------------
     Upload helper
  --------------------------------------------------------- */
  const uploadImage = async () => {
    if (!imageSrc) return null;

    const blob = await (await fetch(imageSrc)).blob();
    const file = new File([blob], "upload.jpg", { type: "image/jpeg" });
    const fileName = `${Date.now()}-guest.jpg`;

    const { error } = await supabase.storage
      .from("guest_uploads")
      .upload(fileName, file);

    if (error) return null;

    const { data } = supabase.storage
      .from("guest_uploads")
      .getPublicUrl(fileName);

    return data.publicUrl;
  };

  /* ---------------------------------------------------------
     Submit
  --------------------------------------------------------- */
  const submitPost = async (e: any) => {
    e.preventDefault();

    if (!imageSrc) {
      alert("Please take or upload a photo before submitting.");
      return;
    }

    if (!message.trim()) {
      alert("Please enter a message.");
      return;
    }

    setSubmitting(true);

    try {
      const guestProfileId = requireGuestProfileId(profile);
      const photoUrl = await uploadImage();

      if (!photoUrl) {
        throw new Error("Photo upload failed.");
      }

      await supabase.from("guest_posts").insert([
        {
          fan_wall_id: wallUUID,
          guest_profile_id: guestProfileId, // ✅ GUARANTEED UUID
          nickname: profile.first_name,
          message,
          photo_url: photoUrl,
          status: "pending",
        },
      ]);

      // ✅ REQUIRED ROUTING FIX
      router.push(`/thanks/${wallUUID}?type=wall`);
    } catch (err) {
      console.error(err);
      alert("Something went wrong. Please rescan and try again.");
      setSubmitting(false);
    }
  };

  /* ---------------------------------------------------------
     Prevent rendering while loading OR redirecting
  --------------------------------------------------------- */
  if (profile === undefined || !wall) return null;
  if (profile === null) return null;

  /* ---------------------------------------------------------
     Background + logo
  --------------------------------------------------------- */
  const bg = wall.background_value?.includes("http")
    ? `url(${wall.background_value})`
    : wall.background_value;

  const logo =
    wall.host?.branding_logo_url?.trim() !== ""
      ? wall.host.branding_logo_url
      : "/faninteractlogo.png";

  /* ---------------------------------------------------------
     RENDER UI
  --------------------------------------------------------- */
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
        onSubmit={submitPost}
        style={{
          position: "relative",
          maxWidth: 480,
          margin: "auto",
          padding: 25,
          textAlign: "center",
          borderRadius: 18,
          background: "rgba(0,0,0,0.55)",
          boxShadow: "0 0 30px rgba(0,0,0,0.7)",
          border: "1px solid rgba(255,255,255,0.15)",
        }}
      >
        <img
          src={logo}
          style={{
            width: "70%",
            display: "block",
            margin: "0 auto 12px",
            animation: "pulse 2.2s infinite",
            filter: "drop-shadow(0 0 25px rgba(56,189,248,0.6))",
          }}
        />

        <h2 style={{ marginBottom: 16, fontWeight: 800 }}>{wall.title}</h2>

        <div
          style={{
            width: "100%",
            height: 260,
            position: "relative",
            marginBottom: 10,
            borderRadius: 12,
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(0,0,0,0.35)",
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
            />
          ) : (
            <div
              style={{
                color: "#aaa",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              📸 No Photo Yet
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={openCamera}
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 10,
            background: "linear-gradient(90deg,#0284c7,#2563eb)",
            color: "#fff",
            fontWeight: 600,
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
            fontWeight: 600,
            marginBottom: 10,
          }}
        >
          📁 Choose File
        </button>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={handleFile}
        />

        <input
          value={profile.first_name}
          readOnly
          style={{
            width: "100%",
            padding: 12,
            textAlign: "center",
            marginBottom: 10,
            borderRadius: 10,
            background: "rgba(0,0,0,0.4)",
            color: "#fff",
            border: "1px solid #334155",
          }}
        />

        <textarea
          maxLength={150}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Your message"
          style={{
            width: "100%",
            minHeight: 90,
            padding: 12,
            borderRadius: 10,
            background: "rgba(0,0,0,0.4)",
            color: "#fff",
            marginBottom: 5,
            border: "1px solid #334155",
          }}
        />

        <div style={{ textAlign: "right", fontSize: 12 }}>
          {message.length}/150
        </div>

        <button
          disabled={submitting}
          style={{
            width: "100%",
            padding: "12px 0",
            marginTop: 10,
            borderRadius: 10,
            fontWeight: 700,
            color: "#fff",
            background: "linear-gradient(90deg,#0284c7,#2563eb)",
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? "Submitting…" : "Send to Wall"}
        </button>
      </form>
    </div>
  );
}
