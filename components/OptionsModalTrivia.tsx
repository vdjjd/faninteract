"use client";

import { useState } from "react";
import imageCompression from "browser-image-compression";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";

const DEFAULT_TRIVIA_GRADIENT =
  "linear-gradient(135deg,#0d47a1cc 0%, #0d47a199 45%, #1976d299 60%, #1976d2cc 100%)";

/* ------------------------------------------------------ */
/* GRADIENT + BRIGHTNESS HELPERS                          */
/* ------------------------------------------------------ */
function applyBrightnessToGradient(gradient: string, brightness: number) {
  if (!gradient?.includes("linear-gradient")) return gradient;

  const multiplier = brightness / 100;

  return gradient.replace(/(#\w{6})(\w{2})/g, (_, hex, alpha) => {
    const base = alpha ? parseInt(alpha, 16) : 255;
    const newAlpha = Math.max(0, Math.min(255, base * multiplier));
    return `${hex}${Math.round(newAlpha).toString(16).padStart(2, "0")}`;
  });
}

function buildGradient(
  start: string,
  end: string,
  pos: number,
  brightness: number
) {
  const mid1 = pos;
  const mid2 = Math.min(pos + 15, 100);

  const raw = `
    linear-gradient(
      135deg,
      ${start} 0%,
      ${start}cc ${mid1}%,
      ${end}99 ${mid2}%,
      ${end} 100%
    )
  `.replace(/\s+/g, " ");

  return applyBrightnessToGradient(raw, brightness);
}

/* ------------------------------------------------------ */
/* PROPS                                                  */
/* ------------------------------------------------------ */
type OptionsModalTriviaProps = {
  trivia: any; // full trivia_cards row
  hostId: string; // current host.id
  onClose: () => void;
  refreshTrivia?: () => void | Promise<void>;
};

/* ------------------------------------------------------ */
/* MAIN COMPONENT                                         */
/* ------------------------------------------------------ */
export default function OptionsModalTrivia({
  trivia,
  hostId,
  onClose,
  refreshTrivia,
}: OptionsModalTriviaProps) {
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // pull existing values from trivia row, with sane fallbacks
  const initialGradientPos = trivia.gradient_pos ?? 60;
  const initialBrightness = trivia.background_brightness ?? 100;

  const [gradientPosition, setGradientPosition] = useState<number>(
    initialGradientPos
  );
  const [brightness, setBrightness] = useState<number>(initialBrightness);

  const [localTrivia, setLocalTrivia] = useState(() => {
    const start = trivia.color_start || "#0d47a1";
    const end = trivia.color_end || "#1976d2";

    const gradient =
      trivia.background_type === "gradient" && trivia.background_value
        ? trivia.background_value
        : buildGradient(start, end, initialGradientPos, initialBrightness);

    return {
      ...trivia,
      public_name: trivia.public_name || "",
      private_name: trivia.private_name || "",
      background_type: trivia.background_type || "gradient",
      background_value: trivia.background_value || gradient,
      color_start: start,
      color_end: end,
      gradient_pos: initialGradientPos,
      background_brightness: initialBrightness,
    };
  });

  /* ------------------------------------------------------ */
  /* SAVE HANDLER                                           */
  /* ------------------------------------------------------ */
  async function handleSave() {
    try {
      setSaving(true);

      let finalBg = localTrivia.background_value;

      if (localTrivia.background_type === "gradient") {
        finalBg = buildGradient(
          localTrivia.color_start,
          localTrivia.color_end,
          gradientPosition,
          brightness
        );
      }

      const updates = {
        public_name: localTrivia.public_name?.trim() || localTrivia.public_name,
        private_name:
          localTrivia.private_name?.trim() || localTrivia.private_name,
        background_type: localTrivia.background_type,
        background_value: finalBg,
        color_start: localTrivia.color_start,
        color_end: localTrivia.color_end,
        gradient_pos: gradientPosition,
        background_brightness: brightness,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("trivia_cards")
        .update(updates)
        .eq("id", localTrivia.id);

      if (error) {
        console.error("❌ SAVE TRIVIA OPTIONS ERROR:", error);
        return;
      }

      await refreshTrivia?.();
      onClose();
    } catch (err) {
      console.error("SAVE ERROR:", err);
    } finally {
      setSaving(false);
    }
  }

  /* ------------------------------------------------------ */
  /* IMAGE UPLOAD                                           */
  /* ------------------------------------------------------ */
  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    try {
      const file = e.target.files?.[0];
      if (!file) return;

      setUploading(true);

      // quick preview
      const preview = URL.createObjectURL(file);
      setLocalTrivia((prev: any) => ({
        ...prev,
        background_type: "image",
        background_value: preview,
      }));

      const compressed = await imageCompression(file, {
        maxWidthOrHeight: 1900,
        useWebWorker: true,
      });

      const ext = file.type.split("/")[1] || "jpg";
      const path = `host_${hostId}/trivia_${localTrivia.id}/background-${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("wall-backgrounds")
        .upload(path, compressed, { upsert: true });

      if (uploadErr) {
        console.error("UPLOAD ERROR:", uploadErr);
        return;
      }

      const { data } = supabase.storage
        .from("wall-backgrounds")
        .getPublicUrl(path);

      const finalUrl = data.publicUrl;

      const { error: updateErr } = await supabase
        .from("trivia_cards")
        .update({
          background_type: "image",
          background_value: finalUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", localTrivia.id);

      if (updateErr) {
        console.error("TRIVIA BG UPDATE ERROR:", updateErr);
      }

      setLocalTrivia((prev: any) => ({
        ...prev,
        background_type: "image",
        background_value: finalUrl,
      }));

      await refreshTrivia?.();
    } catch (err) {
      console.error("UPLOAD ERROR:", err);
    } finally {
      setUploading(false);
    }
  }

  /* ------------------------------------------------------ */
  /* DELETE BACKGROUND                                      */
  /* ------------------------------------------------------ */
  async function handleDeleteImage() {
    try {
      const { error } = await supabase
        .from("trivia_cards")
        .update({
          background_type: "gradient",
          background_value: DEFAULT_TRIVIA_GRADIENT,
          updated_at: new Date().toISOString(),
        })
        .eq("id", localTrivia.id);

      if (error) {
        console.error("DELETE IMAGE ERROR:", error);
        return;
      }

      setLocalTrivia((prev: any) => ({
        ...prev,
        background_type: "gradient",
        background_value: DEFAULT_TRIVIA_GRADIENT,
      }));

      await refreshTrivia?.();
    } catch (err) {
      console.error("DELETE IMAGE ERROR:", err);
    }
  }

  /* ------------------------------------------------------ */
  /* RENDER                                                 */
  /* ------------------------------------------------------ */
  return (
    <div
      className={cn(
        "fixed inset-0 bg-black/70 backdrop-blur-md z-[9999] flex items-center justify-center"
      )}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "relative w-full max-w-[1000px] h-auto rounded-2xl",
          "border border-blue-500/30 shadow-[0_0_40px_rgba(0,140,255,0.45)]",
          "bg-gradient-to-br from-[#0b0f1a]/95 to-[#111827]/95 p-6 text-white"
        )}
      >
        {/* CLOSE BUTTON */}
        <button
          onClick={onClose}
          className={cn(
            "absolute top-3 right-3 text-white/80 hover:text-white text-xl"
          )}
        >
          ✕
        </button>

        {/* TITLE */}
        <h3 className={cn("text-center text-xl font-semibold mb-6")}>
          ⚙ Edit Trivia Appearance
        </h3>

        {/* GRID LAYOUT */}
        <div className={cn("grid grid-cols-2 gap-8 w-full")}>
          {/* LEFT: text + options */}
          <div className="space-y-4">
            {/* PUBLIC NAME */}
            <div>
              <label className={cn("block text-sm font-semibold mb-1")}>
                Public Game Name
              </label>
              <input
                className={cn(
                  "w-full px-3 py-2 rounded-lg",
                  "bg-black/40 border border-white/10 text-sm"
                )}
                value={localTrivia.public_name || ""}
                onChange={(e) =>
                  setLocalTrivia((prev: any) => ({
                    ...prev,
                    public_name: e.target.value,
                  }))
                }
              />
            </div>

            {/* PRIVATE NAME */}
            <div>
              <label className={cn("block text-sm font-semibold mb-1")}>
                Private Dashboard Name
              </label>
              <input
                className={cn(
                  "w-full px-3 py-2 rounded-lg",
                  "bg-black/40 border border-white/10 text-sm"
                )}
                value={localTrivia.private_name || ""}
                onChange={(e) =>
                  setLocalTrivia((prev: any) => ({
                    ...prev,
                    private_name: e.target.value,
                  }))
                }
              />
            </div>

            {/* BACKGROUND TYPE */}
            <div>
              <label className={cn("block text-sm font-semibold mb-1")}>
                Background Type
              </label>
              <select
                className={cn(
                  "w-full px-3 py-2 rounded-lg",
                  "bg-black/40 border border-white/10 text-sm"
                )}
                value={localTrivia.background_type || "gradient"}
                onChange={(e) =>
                  setLocalTrivia((prev: any) => ({
                    ...prev,
                    background_type: e.target.value,
                  }))
                }
              >
                <option value="gradient">Gradient</option>
                <option value="image">Image</option>
              </select>
            </div>

            {/* COLOR PICKERS */}
            <div className={cn("flex justify-center gap-10")}>
              {["Left Color", "Right Color"].map((label, i) => (
                <div key={label}>
                  <label className={cn("block text-xs mb-1 text-center")}>
                    {label}
                  </label>
                  <input
                    type="color"
                    className={cn("w-[60px] h-[40px] rounded-md cursor-pointer")}
                    value={
                      i === 0
                        ? localTrivia.color_start
                        : localTrivia.color_end
                    }
                    onChange={(e) => {
                      setLocalTrivia((prev: any) => {
                        const newStart =
                          i === 0 ? e.target.value : prev.color_start;
                        const newEnd =
                          i === 1 ? e.target.value : prev.color_end;

                        const g = buildGradient(
                          newStart,
                          newEnd,
                          gradientPosition,
                          brightness
                        );

                        return {
                          ...prev,
                          color_start: newStart,
                          color_end: newEnd,
                          background_type: "gradient",
                          background_value: g,
                        };
                      });
                    }}
                  />
                </div>
              ))}
            </div>

            {/* GRADIENT POSITION */}
            <div className={cn("flex flex-col items-center")}>
              <label className={cn("text-xs mb-1")}>Gradient Position</label>
              <input
                type="range"
                min={0}
                max={100}
                value={gradientPosition}
                className={cn("w-[60%] accent-blue-400")}
                onChange={(e) => {
                  const num = Number(e.target.value);
                  setGradientPosition(num);

                  setLocalTrivia((prev: any) => ({
                    ...prev,
                    gradient_pos: num,
                    background_type: "gradient",
                    background_value: buildGradient(
                      prev.color_start,
                      prev.color_end,
                      num,
                      brightness
                    ),
                  }));
                }}
              />
              <p className={cn("text-xs mt-1")}>{gradientPosition}%</p>
            </div>

            {/* BRIGHTNESS */}
            <div className={cn("flex flex-col items-center")}>
              <label className={cn("text-xs mb-1")}>
                Background Brightness
              </label>
              <input
                type="range"
                min={20}
                max={150}
                value={brightness}
                className={cn("w-[60%] accent-blue-400")}
                onChange={(e) => {
                  const num = Number(e.target.value);
                  setBrightness(num);

                  setLocalTrivia((prev: any) => ({
                    ...prev,
                    background_brightness: num,
                    background_type: "gradient",
                    background_value: buildGradient(
                      prev.color_start,
                      prev.color_end,
                      gradientPosition,
                      num
                    ),
                  }));
                }}
              />
              <p className={cn("text-xs mt-1")}>{brightness}%</p>
            </div>
          </div>

          {/* RIGHT: preview + image upload */}
          <div className="space-y-6">
            {/* PREVIEW */}
            <div className="text-center">
              <div
                className={cn(
                  "w-[220px] h-[120px] mx-auto rounded-md border border-white/20 shadow-inner"
                )}
                style={{
                  background:
                    localTrivia.background_type === "image"
                      ? `url(${localTrivia.background_value}) center/cover no-repeat`
                      : localTrivia.background_value,
                }}
              />
              <p className={cn("text-xs text-gray-300 mt-2")}>
                {localTrivia.background_type === "image"
                  ? "Current Trivia Background Image"
                  : "Current Trivia Gradient Background"}
              </p>
            </div>

            {/* UPLOAD IMAGE */}
            <div className={cn("flex flex-col items-center")}>
              <p className={cn("text-sm font-semibold mb-2")}>
                Upload Background Image
              </p>

              <label
                htmlFor="triviaBgUpload"
                className={cn(
                  "px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700",
                  "text-white font-semibold cursor-pointer text-sm"
                )}
              >
                Choose File
              </label>

              <input
                id="triviaBgUpload"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleImageUpload}
              />

              <p
                className={cn(
                  "text-xs text-gray-300 mt-2 text-center min-h-[1.5rem]"
                )}
              >
                {uploading
                  ? "Uploading…"
                  : localTrivia.background_type === "image"
                  ? localTrivia.background_value?.split("/").pop()
                  : "No file chosen"}
              </p>
            </div>
          </div>
        </div>

        {/* FOOTER BUTTONS */}
        <div
          className={cn(
            "flex justify-center items-center gap-4 border-t border-white/10 mt-8 pt-4"
          )}
        >
          <button
            onClick={handleDeleteImage}
            className={cn(
              "px-4 py-2 rounded-md text-sm bg-red-600/80 hover:bg-red-700 font-medium"
            )}
          >
            Delete Background
          </button>

          <button
            onClick={onClose}
            className={cn(
              "px-4 py-2 rounded-md text-sm bg-white/10 hover:bg-white/15 font-medium"
            )}
          >
            Cancel
          </button>

          <button
            disabled={saving}
            onClick={handleSave}
            className={
              saving
                ? "px-4 py-2 rounded-md text-sm border font-medium opacity-60 cursor-wait"
                : "px-4 py-2 rounded-md text-sm border font-medium bg-emerald-600/80 border-emerald-500 hover:bg-emerald-600"
            }
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
