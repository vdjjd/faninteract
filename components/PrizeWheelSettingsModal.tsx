"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";

interface PrizeWheelSettingsModalProps {
  open: boolean;
  wheel: any | null;
  onClose: () => void;
  onSaved?: (patch: {
    thank_you_popup_enabled: boolean;
    thank_you_popup_message: string | null;
  }) => void;
}

const DEFAULT_POPUP_MESSAGE =
  "We want everyone to be a winner! Show this screen at the merchandise table for $10 off and pick your free poster.";

export default function PrizeWheelSettingsModal({
  open,
  wheel,
  onClose,
  onSaved,
}: PrizeWheelSettingsModalProps) {
  const [message, setMessage] = useState<string>(DEFAULT_POPUP_MESSAGE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync local state from wheel when opened
  useEffect(() => {
    if (!open || !wheel) return;

    const initialMessage =
      typeof wheel.thank_you_popup_message === "string" &&
      wheel.thank_you_popup_message.trim().length > 0
        ? wheel.thank_you_popup_message
        : DEFAULT_POPUP_MESSAGE;

    setMessage(initialMessage);
    setError(null);
  }, [open, wheel?.id]);

  if (!open || !wheel) return null;

  async function handleSave() {
    if (!wheel?.id) return;
    setSaving(true);
    setError(null);

    const trimmed = message.trim();
    const finalMessage = trimmed || DEFAULT_POPUP_MESSAGE;

    try {
      const { error } = await supabase
        .from("prize_wheels")
        .update({
          // Feature is already enabled via the card toggle
          thank_you_popup_enabled: true,
          thank_you_popup_message: finalMessage,
        })
        .eq("id", wheel.id);

      if (error) {
        console.error("❌ prize_wheels popup settings update error:", error);
        setError("Could not save settings. Please try again.");
        return;
      }

      onSaved?.({
        thank_you_popup_enabled: true,
        thank_you_popup_message: finalMessage,
      });

      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center",
        "bg-black/60 backdrop-blur-sm"
      )}
    >
      <div
        className={cn(
          "w-full max-w-lg mx-4 rounded-2xl",
          "bg-slate-900 border border-slate-600/70",
          "shadow-2xl text-slate-50"
        )}
      >
        {/* Header */}
        <div
          className={cn(
            "px-5",
            "pt-4",
            "pb-3",
            "border-b",
            "border-slate-700/70",
            "flex",
            "items-center",
            "justify-between"
          )}
        >
          <div>
            <h2 className={cn("text-lg", "font-bold")}>
              Prize Wheel Thank You Popup
            </h2>
            <p
              className={cn(
                "text-xs",
                "text-slate-300/80",
                "mt-0.5"
              )}
            >
              Edit the message guests see on the mobile thank-you page after
              they scan your Prize Wheel QR code.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={cn(
              "ml-3",
              "text-slate-400",
              "hover:text-slate-100",
              "text-lg",
              "leading-none"
            )}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className={cn("px-5", "py-4", "space-y-4")}>
          {/* Message editor */}
          <div>
            <div
              className={cn(
                "flex",
                "items-center",
                "justify-between",
                "mb-1.5"
              )}
            >
              <label
                htmlFor="wheel-popup-message"
                className={cn("text-sm", "font-semibold")}
              >
                Popup Message
              </label>
              <span
                className={cn(
                  "text-[0.7rem]",
                  "text-slate-400"
                )}
              >
                This will show on the thank-you screen
              </span>
            </div>

            <textarea
              id="wheel-popup-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              className={cn(
                "w-full text-sm rounded-xl px-3 py-2.5",
                "bg-slate-950/70 border border-slate-500/70",
                "outline-none resize-none",
                "focus:border-amber-400"
              )}
              placeholder="Type the message guests should see after scanning the Prize Wheel QR…"
            />

            <p
              className={cn(
                "text-[0.7rem]",
                "text-slate-400",
                "mt-1.5"
              )}
            >
              Example: “We want everyone to be a winner! Use this code at the
              merch table for $10 off and pick your free poster.”
            </p>
          </div>

          {error && (
            <p
              className={cn(
                "text-xs",
                "text-red-400",
                "mt-1"
              )}
            >
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div
          className={cn(
            "px-5",
            "py-3",
            "border-t",
            "border-slate-700/70",
            "flex",
            "items-center",
            "justify-end",
            "gap-2"
          )}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className={cn(
              "px-3.5 py-1.5 rounded-full text-xs font-semibold",
              "border border-slate-500/70 text-slate-200",
              "hover:bg-slate-800/70",
              saving && "opacity-60 cursor-not-allowed"
            )}
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={cn(
              "px-4 py-1.5 rounded-full text-xs font-semibold",
              "bg-amber-400 text-slate-900",
              "hover:bg-amber-300",
              "shadow-[0_0_12px_rgba(251,191,36,0.7)]",
              saving && "opacity-60 cursor-not-allowed shadow-none"
            )}
          >
            {saving ? "Saving..." : "Save Message"}
          </button>
        </div>
      </div>
    </div>
  );
}
