'use client';

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import QRCode from "qrcode";

/* FIXED PANEL WIDTHS */
const LEFT_PANEL_WIDTH = 240;
const RIGHT_PANEL_WIDTH = 240;

interface AdBuilderModalProps {
  adId: string;
  hostId: string;
  onClose: () => void;
}

interface QROptions {
  fg: string;
  bg: string;
  glowColor: string;
  glowRadius: number;
  cornerRadius: number;
  borderThickness: number;
  borderRadius: number;
  dotStyle: "square" | "round";
}

export default function AdBuilderModal({ adId, hostId, onClose }: AdBuilderModalProps) {
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [tempVideoUrl, setTempVideoUrl] = useState<string | null>(null);
  const [tempVideoMeta, setTempVideoMeta] = useState<any>(null);

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrX, setQrX] = useState(100);
  const [qrY, setQrY] = useState(100);
  const [qrSize, setQrSize] = useState(200);
  const [isDragging, setIsDragging] = useState(false);
  const [resizeMode, setResizeMode] = useState(false);

  /* FULL OPTIONS RESTORED */
  const [qrOptions, setQrOptions] = useState<QROptions>({
    fg: "#000000",
    bg: "#ffffff",
    glowColor: "#00ffff",
    glowRadius: 12,
    cornerRadius: 8,
    borderThickness: 4,
    borderRadius: 10,
    dotStyle: "square",
  });

  /* LOAD EXISTING AD */
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("ad_slides")
        .select("*")
        .eq("id", adId)
        .single();

      if (!data) return;

      // Determine initial display (image or video)
      if (data.file_type === "video" && data.video_url) {
        setTempVideoUrl(data.video_url);
        setTempVideoMeta({
          url: data.video_url,
          duration: data.video_duration
        });
        setBackgroundUrl(null);
      } else {
        setBackgroundUrl(data.flyer_url ?? null);
        setTempVideoUrl(null);
      }

      /* RESTORE QR */
      if (data.qr_layer) {
        const q = data.qr_layer;

        setQrDataUrl(q.dataUrl);
        setQrX(q.x);
        setQrY(q.y);
        setQrSize(q.size);

        setQrOptions({
          fg: q.fg ?? "#000000",
          bg: q.bg ?? "#ffffff",
          glowColor: q.glowColor ?? "#00ffff",
          glowRadius: q.glowRadius ?? 12,
          cornerRadius: q.cornerRadius ?? 8,
          borderThickness: q.borderThickness ?? 4,
          borderRadius: q.borderRadius ?? 10,
          dotStyle: q.dotStyle ?? "square",
        });
      }
    }

    load();
  }, [adId]);

  /* IMAGE UPLOAD (1920×1080) */
  async function handleBackgroundUpload(e: any) {
    const file = e.target.files?.[0];
    if (!file) return;

    const img = new Image();
    img.src = URL.createObjectURL(file);
    await new Promise((res) => (img.onload = res));

    if (img.width !== 1920 || img.height !== 1080) {
      alert(`Image must be 1920×1080. Yours is ${img.width}×${img.height}`);
      return;
    }

    const ext = file.name.split(".").pop();
    const path = `${hostId}/ads/${adId}/background.${ext}`;

    const { error } = await supabase.storage
      .from("ad-slideshow-images")
      .upload(path, file, { upsert: true, contentType: file.type });

    if (error) return alert(error.message);

    const { data: urlData } = supabase
      .storage
      .from("ad-slideshow-images")
      .getPublicUrl(path);

    setBackgroundUrl(urlData.publicUrl);
    setTempVideoUrl(null);
    setTempVideoMeta(null);

    alert("Image uploaded! Click SAVE to finalize.");
  }

  /* VIDEO UPLOAD (1920×1080 + duration detect) */
  async function handleVideoUpload(e: any) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.includes("mp4")) {
      alert("Only MP4 videos are supported.");
      return;
    }

    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = URL.createObjectURL(file);

    await new Promise(resolve => (video.onloadedmetadata = resolve));

    const width = video.videoWidth;
    const height = video.videoHeight;
    const duration = Math.round(video.duration);

    if (width !== 1920 || height !== 1080) {
      alert(`MP4 must be 1920×1080 — yours is ${width}×${height}`);
      return;
    }

    const ext = file.name.split(".").pop();
    const path = `${hostId}/ads/${adId}/video.${ext}`;

    const { error } = await supabase.storage
      .from("ad-slideshow-images")
      .upload(path, file, { upsert: true, contentType: file.type });

    if (error) {
      alert(error.message);
      return;
    }

    const { data: urlData } = supabase
      .storage
      .from("ad-slideshow-images")
      .getPublicUrl(path);

    // store locally until Save button is clicked
    setTempVideoUrl(urlData.publicUrl);
    setTempVideoMeta({
      url: urlData.publicUrl,
      duration
    });

    setBackgroundUrl(null);
    alert("Video uploaded! Click SAVE to finalize.");
  }

  /* AUTO CANVAS SIZE */
  const centerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 100, h: 56 });

  useEffect(() => {
    function recalc() {
      const region = centerRef.current;
      if (!region) return;

      const maxW = region.clientWidth;
      const maxH = region.clientHeight;

      const aspectW = maxH * (16 / 9);
      const aspectH = maxW * (9 / 16);

      let finalW, finalH;
      if (aspectW <= maxW) {
        finalW = aspectW;
        finalH = maxH;
      } else {
        finalW = maxW;
        finalH = aspectH;
      }

      setCanvasSize({ w: finalW, h: finalH });
    }

    recalc();
    window.addEventListener("resize", recalc);
    return () => window.removeEventListener("resize", recalc);
  }, []);

  /* GENERATE QR */
  async function generateQR() {
    const url = `https://www.faninteract.com/lead/signup?ad=${adId}&host=${hostId}&src=qr`;

    const qr = await QRCode.toDataURL(url, {
      margin: 1,
      color: {
        dark: qrOptions.fg,
        light: qrOptions.bg,
      },
    });

    setQrDataUrl(qr);
  }

  async function deleteQR() {
    setQrDataUrl(null);
  }

  /* DRAG + RESIZE */
  function startDrag(e: any) {
    setIsDragging(true);
    e.stopPropagation();
  }
  function stopDrag() {
    setIsDragging(false);
    setResizeMode(false);
  }
  function onDrag(e: any) {
    if (!isDragging) return;
    const rect = e.target.closest(".canvas-box")?.getBoundingClientRect();
    if (!rect) return;

    setQrX(e.clientX - rect.left - qrSize / 2);
    setQrY(e.clientY - rect.top - qrSize / 2);
  }

  function startResize(e: any) {
    e.stopPropagation();
    setResizeMode(true);
  }

  function onResize(e: any) {
    if (!resizeMode) return;
    const rect = e.target.closest(".canvas-box")?.getBoundingClientRect();
    if (!rect) return;

    const dx = e.clientX - (rect.left + qrX);
    const dy = e.clientY - (rect.top + qrY);
    const size = Math.max(80, Math.max(dx, dy));
    setQrSize(size);
  }

  /* FINAL SAVE & CLOSE */
  async function finalizeSlide() {
    let updates: any = {
      qr_layer: qrDataUrl
        ? {
            dataUrl: qrDataUrl,
            x: qrX,
            y: qrY,
            size: qrSize,
            ...qrOptions,
          }
        : null,
    };

    if (tempVideoUrl && tempVideoMeta) {
      updates = {
        ...updates,
        file_type: "video",
        video_url: tempVideoMeta.url,
        video_duration: tempVideoMeta.duration,
        flyer_url: null,
        rendered_url: null,
      };
    } else if (backgroundUrl) {
      updates = {
        ...updates,
        file_type: "image",
        flyer_url: backgroundUrl,
        video_url: null,
        video_duration: null,
      };
    }

    await supabase
      .from("ad_slides")
      .update(updates)
      .eq("id", adId);

    onClose();
  }

  /* UI */
  return (
    <div
      className={cn(
        "fixed inset-0 bg-black/70 backdrop-blur-md z-[99999]",
        "flex items-center justify-center"
      )}
      onMouseMove={onDrag}
      onMouseUp={stopDrag}
      onMouseLeave={stopDrag}
    >
      <div
        className={cn(
          "relative rounded-2xl border border-cyan-400/30",
          "bg-gradient-to-br from-[#0b0f1a]/95 to-[#111827]/95",
          "shadow-[0_0_50px_rgba(0,170,255,0.45)]",
          "w-[95vw] h-[92vh] max-w-[1800px] min-w-[1200px]",
          "flex flex-col overflow-hidden"
        )}
      >
        {/* CLOSE BUTTON */}
        <button
          onClick={onClose}
          className={cn("absolute top-3 right-4 z-[999] text-white hover:text-red-400 transition")}
        >
          <X size={30} />
        </button>

        {/* TOP BAR */}
        <div
          className={cn(
            "w-full h-14 flex items-center justify-between px-6",
            "border-b border-white/10 bg-white/5"
          )}
        >
          <h2 className={cn("text-xl font-semibold text-white")}>✏️ Editing Ad</h2>

          <div className={cn("flex gap-3 pr-16")}>
            <button
              onClick={finalizeSlide}
              className={cn(
                "px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm font-semibold hover:bg-cyan-700 transition"
              )}
            >
              Save & Close
            </button>
          </div>
        </div>

        {/* BODY */}
        <div className={cn("flex flex-1 overflow-hidden")}>

          {/* LEFT PANEL */}
          <div
            className={cn(
              "border-r border-white/10 bg-white/5 overflow-y-auto p-3 text-white"
            )}
            style={{ width: LEFT_PANEL_WIDTH, minWidth: LEFT_PANEL_WIDTH }}
          >
            <h3 className={cn("text-sm font-semibold mb-3")}>Layers</h3>

            {/* IMAGE UPLOAD */}
            <label
              className={cn(
                "block w-full px-3 py-2 mb-3 bg-cyan-600 rounded-lg text-center cursor-pointer hover:bg-cyan-700 transition"
              )}
            >
              Upload Background (Image)
              <input
                type="file"
                accept="image/*"
                onChange={handleBackgroundUpload}
                className="hidden"
              />
            </label>

            <p className={cn('text-xs', 'text-white/50', 'mb-4')}>
              Must be 1920×1080.
            </p>

            {/* VIDEO UPLOAD */}
            <label
              className={cn(
                "block w-full px-3 py-2 mb-3 bg-purple-600 rounded-lg text-center cursor-pointer hover:bg-purple-700 transition"
              )}
            >
              Upload MP4 Video
              <input
                type="file"
                accept="video/mp4"
                onChange={handleVideoUpload}
                className="hidden"
              />
            </label>

            <p className={cn('text-xs', 'text-white/50', 'mb-4')}>
              Must be 1920×1080 MP4.
            </p>

            {/* VIDEO META */}
            {tempVideoMeta && (
              <p className={cn('text-xs', 'text-white/70', 'mb-3')}>
                Video Duration: <strong>{tempVideoMeta.duration}s</strong>
              </p>
            )}
          </div>

          {/* CANVAS PREVIEW */}
          <div
            ref={centerRef}
            className={cn(
              "flex-1 bg-black flex items-center justify-center overflow-hidden"
            )}
          >
            <div
              className={cn(
                "canvas-box relative bg-black overflow-hidden border border-white/10 shadow-xl"
              )}
              style={{ width: canvasSize.w, height: canvasSize.h }}
              onMouseMove={resizeMode ? onResize : undefined}
            >
              {/* IMAGE PREVIEW */}
              {backgroundUrl && !tempVideoUrl && (
                <img
                  src={backgroundUrl}
                  className={cn(
                    "absolute inset-0 w-full h-full object-cover pointer-events-none"
                  )}
                />
              )}

              {/* VIDEO PREVIEW */}
              {tempVideoUrl && (
                <video
                  src={tempVideoUrl}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className={cn(
                    "absolute inset-0 w-full h-full object-cover pointer-events-none"
                  )}
                />
              )}

              {/* QR OVERLAY */}
              {qrDataUrl && (
                <div
                  onMouseDown={startDrag}
                  style={{
                    position: "absolute",
                    left: qrX,
                    top: qrY,
                    width: qrSize,
                    height: qrSize,
                    cursor: "move",
                    boxShadow: `0 0 ${qrOptions.glowRadius}px ${qrOptions.glowColor}`,
                    border: `${qrOptions.borderThickness}px solid ${qrOptions.fg}`,
                    borderRadius: qrOptions.borderRadius,
                  }}
                >
                  <img
                    src={qrDataUrl}
                    className={cn('w-full', 'h-full')}
                    draggable={false}
                  />

                  {/* Resize Handle */}
                  <div
                    onMouseDown={startResize}
                    style={{
                      position: "absolute",
                      right: -10,
                      bottom: -10,
                      width: 20,
                      height: 20,
                      background: "white",
                      borderRadius: 4,
                      cursor: "nwse-resize",
                      border: "2px solid black",
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* QR OPTIONS PANEL */}
          <div
            className={cn(
              "border-l border-white/10 bg-white/5 overflow-y-auto p-3 text-white"
            )}
            style={{ width: RIGHT_PANEL_WIDTH, minWidth: RIGHT_PANEL_WIDTH }}
          >
            <h3 className={cn("text-sm font-semibold mb-3")}>QR Code Options</h3>

            {/* FULL QR EDITING OPTIONS */}
            <label className={cn('text-xs', 'text-white/70')}>Foreground Color</label>
            <input
              type="color"
              value={qrOptions.fg}
              onChange={(e) =>
                setQrOptions({ ...qrOptions, fg: e.target.value })
              }
              className={cn("w-full h-8 mb-3")}
            />

            <label className={cn('text-xs', 'text-white/70')}>Background Color</label>
            <input
              type="color"
              value={qrOptions.bg}
              onChange={(e) =>
                setQrOptions({ ...qrOptions, bg: e.target.value })
              }
              className={cn("w-full h-8 mb-3")}
            />

            <label className={cn('text-xs', 'text-white/70')}>Glow Color</label>
            <input
              type="color"
              value={qrOptions.glowColor}
              onChange={(e) =>
                setQrOptions({ ...qrOptions, glowColor: e.target.value })
              }
              className={cn("w-full h-8 mb-3")}
            />

            <label className={cn('text-xs', 'text-white/70')}>Glow Radius</label>
            <input
              type="number"
              min={0}
              max={50}
              value={qrOptions.glowRadius}
              onChange={(e) =>
                setQrOptions({
                  ...qrOptions,
                  glowRadius: Number(e.target.value),
                })
              }
              className={cn(
                "w-full px-2 py-1 mb-3 bg-black/30 border border-white/30 rounded"
              )}
            />

            <label className={cn('text-xs', 'text-white/70')}>Corner Radius</label>
            <input
              type="number"
              min={0}
              max={50}
              value={qrOptions.cornerRadius}
              onChange={(e) =>
                setQrOptions({
                  ...qrOptions,
                  cornerRadius: Number(e.target.value),
                })
              }
              className={cn(
                "w-full px-2 py-1 mb-3 bg-black/30 border border-white/30 rounded"
              )}
            />

            <label className={cn('text-xs', 'text-white/70')}>Border Thickness</label>
            <input
              type="number"
              min={0}
              max={20}
              value={qrOptions.borderThickness}
              onChange={(e) =>
                setQrOptions({
                  ...qrOptions,
                  borderThickness: Number(e.target.value),
                })
              }
              className={cn(
                "w-full px-2 py-1 mb-3 bg-black/30 border border-white/30 rounded"
              )}
            />

            <label className={cn('text-xs', 'text-white/70')}>Border Radius</label>
            <input
              type="number"
              min={0}
              max={50}
              value={qrOptions.borderRadius}
              onChange={(e) =>
                setQrOptions({
                  ...qrOptions,
                  borderRadius: Number(e.target.value),
                })
              }
              className={cn(
                "w-full px-2 py-1 mb-3 bg-black/30 border border-white/30 rounded"
              )}
            />

            <label className={cn('text-xs', 'text-white/70')}>Dot Style</label>
            <select
              value={qrOptions.dotStyle}
              onChange={(e) =>
                setQrOptions({
                  ...qrOptions,
                  dotStyle: e.target.value as "square" | "round",
                })
              }
              className={cn(
                "w-full px-2 py-1 mb-4 bg-black/30 border border-white/30 rounded text-white"
              )}
            >
              <option value="square">Square</option>
              <option value="round">Round</option>
            </select>

            {!qrDataUrl && (
              <button
                onClick={generateQR}
                className={cn(
                  "w-full px-4 py-2 mb-2 bg-green-600 rounded-lg hover:bg-green-700 text-white"
                )}
              >
                Create QR Code
              </button>
            )}

            {qrDataUrl && (
              <button
                onClick={deleteQR}
                className={cn(
                  "w-full px-4 py-2 bg-red-600 rounded-lg hover:bg-red-700 text-white"
                )}
              >
                Delete QR Code
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
