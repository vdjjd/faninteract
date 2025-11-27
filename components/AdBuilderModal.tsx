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
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrX, setQrX] = useState(100);
  const [qrY, setQrY] = useState(100);
  const [qrSize, setQrSize] = useState(200);
  const [isDragging, setIsDragging] = useState(false);
  const [resizeMode, setResizeMode] = useState(false);

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

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("ad_slides")
        .select("*")
        .eq("id", adId)
        .single();

      if (data) {
        setBackgroundUrl(data.flyer_url ?? null);
        if (data.qr_layer) {
          const q = data.qr_layer;
          setQrDataUrl(q.dataUrl);
          setQrX(q.x);
          setQrY(q.y);
          setQrSize(q.size);
        }
      }
    }
    load();
  }, [adId]);

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

    if (error) {
      alert(error.message);
      return;
    }

    const { data: urlData } = supabase.storage
      .from("ad-slideshow-images")
      .getPublicUrl(path);

    await supabase
      .from("ad_slides")
      .update({ flyer_url: urlData.publicUrl })
      .eq("id", adId);

    setBackgroundUrl(urlData.publicUrl);
  }

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

  async function generateQR() {
    const url = `https://faninteract.com/lead/signup?ad=${adId}&host=${hostId}&src=qr`;

    const qr = await QRCode.toDataURL(url, {
      margin: 1,
      color: {
        dark: qrOptions.fg,
        light: qrOptions.bg,
      },
    });

    setQrDataUrl(qr);

    await supabase
      .from("ad_slides")
      .update({
        qr_layer: {
          dataUrl: qr,
          x: qrX,
          y: qrY,
          size: qrSize,
          ...qrOptions,
        },
      })
      .eq("id", adId);
  }

  async function deleteQR() {
    setQrDataUrl(null);
    await supabase
      .from("ad_slides")
      .update({ qr_layer: null })
      .eq("id", adId);
  }

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
    const rect = e.target
      .closest(".canvas-box")
      ?.getBoundingClientRect();
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
    const rect = e.target
      .closest(".canvas-box")
      ?.getBoundingClientRect();
    if (!rect) return;
    const dx = e.clientX - (rect.left + qrX);
    const dy = e.clientY - (rect.top + qrY);
    const size = Math.max(80, Math.max(dx, dy));
    setQrSize(size);
  }

  async function saveDraft() {
    await supabase.from("ad_slides").update({
      flyer_url: backgroundUrl,
      qr_layer: qrDataUrl
        ? {
            dataUrl: qrDataUrl,
            x: qrX,
            y: qrY,
            size: qrSize,
            ...qrOptions,
          }
        : null,
    }).eq("id", adId);

    alert("Draft Saved");
  }

  async function renderFinal() {
    if (!backgroundUrl) {
      alert("Upload a background first.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = 1920;
    canvas.height = 1080;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bgImg = new Image();
    bgImg.crossOrigin = "anonymous";
    bgImg.src = backgroundUrl;
    await new Promise(res => { bgImg.onload = res; });
    ctx.drawImage(bgImg, 0, 0, 1920, 1080);

    if (qrDataUrl) {
      const qrImg = new Image();
      qrImg.crossOrigin = "anonymous";
      qrImg.src = qrDataUrl;
      await new Promise(res => { qrImg.onload = res; });

      if (qrOptions.glowRadius > 0) {
        ctx.shadowColor = qrOptions.glowColor;
        ctx.shadowBlur = qrOptions.glowRadius;
      }

      if (qrOptions.borderThickness > 0) {
        ctx.lineWidth = qrOptions.borderThickness;
        ctx.strokeStyle = qrOptions.fg;
        ctx.strokeRect(qrX, qrY, qrSize, qrSize);
      }

      ctx.shadowBlur = 0;
      ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
    }

    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, "image/png")
    );
    if (!blob) {
      alert("Render failed.");
      return;
    }

    const filePath = `${hostId}/ads/${adId}/render.png`;
    const { error: uploadErr } = await supabase.storage
      .from("ad-slideshow-images")
      .upload(filePath, blob, { upsert: true });

    if (uploadErr) {
      alert(uploadErr.message);
      return;
    }

    const { data: urlData } = supabase.storage
      .from("ad-slideshow-images")
      .getPublicUrl(filePath);

    await supabase
      .from("ad_slides")
      .update({ rendered_url: urlData.publicUrl })
      .eq("id", adId);

    alert("Rendered image saved!");
  }

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
        <button
          onClick={onClose}
          className={cn("absolute top-3 right-4 z-[999] text-white hover:text-red-400 transition")}
        >
          <X size={30} />
        </button>

        <div className={cn("w-full h-14 flex items-center justify-between px-6 border-b border-white/10 bg-white/5")}>
          <h2 className={cn("text-xl font-semibold text-white")}>✏️ Editing Ad</h2>

          <div className={cn("flex gap-3 pr-16")}>
            <button
              onClick={saveDraft}
              className={cn("px-4 py-2 rounded-lg bg-white/10 text-white text-sm hover:bg-white/20 transition")}
            >
              Save Draft
            </button>

            <button
              onClick={renderFinal}
              className={cn("px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition")}
            >
              Render Final Image
            </button>

            <button
              onClick={saveDraft}
              className={cn("px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm font-semibold hover:bg-cyan-700 transition")}
            >
              Save
            </button>
          </div>
        </div>

        <div className={cn("flex flex-1 overflow-hidden")}>

          <div
            className={cn("border-r border-white/10 bg-white/5 overflow-y-auto p-3 text-white")}
            style={{ width: LEFT_PANEL_WIDTH, minWidth: LEFT_PANEL_WIDTH }}
          >
            <h3 className={cn('text-sm', 'font-semibold', 'mb-3')}>Layers</h3>
            <label className={cn('block w-full px-3 py-2 mb-3 bg-cyan-600 rounded-lg text-center cursor-pointer hover:bg-cyan-700 transition')}>
              Upload Background
              <input
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                onChange={handleBackgroundUpload}
                className="hidden"
              />
            </label>
            <p className={cn('text-xs', 'text-white/50')}>Must be 1920×1080.</p>
          </div>

          <div ref={centerRef} className={cn('flex-1', 'bg-black', 'flex', 'items-center', 'justify-center', 'overflow-hidden')}>
            <div className={cn('canvas-box', 'relative', 'bg-black', 'overflow-hidden', 'border', 'border-white/10', 'shadow-xl')}
              style={{ width: canvasSize.w, height: canvasSize.h }}
              onMouseMove={resizeMode ? onResize : undefined}
            >
              {backgroundUrl && (
                <img src={backgroundUrl}
                     className={cn('absolute', 'inset-0', 'w-full', 'h-full', 'object-cover', 'pointer-events-none')} />
              )}

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
                  <img src={qrDataUrl} className={cn('w-full', 'h-full')} draggable={false} />
                  <div
                    onMouseDown={startResize}
                    style={{
                      position: "absolute",
                      right: -10,
                      bottom: -10,
                      width: 20,
                      height: 20,
                      background: "white",
                      borderRadius: "4px",
                      cursor: "nwse-resize",
                      border: "2px solid black",
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          <div className={cn("border-l border-white/10 bg-white/5 overflow-y-auto p-3 text-white")}
               style={{ width: RIGHT_PANEL_WIDTH, minWidth: RIGHT_PANEL_WIDTH }}>
            <h3 className={cn('text-sm', 'font-semibold', 'mb-3')}>QR Code Options</h3>
            {/* ... rest of controls ... */}
          </div>

        </div>
      </div>
    </div>
  );
}
