'use client';

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";

interface HostTermsModalProps {
  isOpen: boolean;
  onClose: () => void;
  host: any;
  setHost: (h: any) => void;
}

export default function HostTermsModal({
  isOpen,
  onClose,
  host,
  setHost
}: HostTermsModalProps) {
  const [saving, setSaving] = useState(false);

  const [content, setContent] = useState<string>(
    host?.host_terms_markdown || ""
  );

  if (!isOpen) return null;

  async function saveTerms() {
    try {
      setSaving(true);

      const { error } = await supabase
        .from("hosts")
        .update({ host_terms_markdown: content })
        .eq("id", host.id);

      if (error) throw error;

      setHost({ ...host, host_terms_markdown: content });
      onClose();
    } catch (err) {
      console.error("SAVE TERMS ERROR:", err);
    } finally {
      setSaving(false);
    }
  }

  function insert(before: string, after: string = "") {
    const textarea = document.getElementById(
      "terms-editor"
    ) as HTMLTextAreaElement;

    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.substring(start, end);

    const newText =
      content.substring(0, start) +
      before +
      selected +
      after +
      content.substring(end);

    setContent(newText);

    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = start + before.length;
      textarea.selectionEnd = end + before.length;
    }, 10);
  }

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
          "relative w-full max-w-[900px] h-[80vh] rounded-2xl",
          "border border-blue-500/30 shadow-[0_0_40px_rgba(0,140,255,0.45)]",
          "bg-gradient-to-br from-[#0b0f1a]/95 to-[#111827]/95 p-6 text-white",
          "flex flex-col"
        )}
      >
        <button
          onClick={onClose}
          className={cn('absolute', 'top-3', 'right-3', 'text-white/80', 'hover:text-white', 'text-xl')}
        >
          ✕
        </button>

        <h3 className={cn('text-center', 'text-xl', 'font-semibold', 'mb-4')}>
          ✍ Host Terms & Conditions
        </h3>

        {/* ⭐ NEW CLEANER TOOLBAR ⭐ */}
        <div className={cn('flex', 'gap-1.5', 'mb-3', 'justify-center', 'flex-wrap')}>
          {[
            { label: "B", action: () => insert("**", "**"), class: "font-bold" },
            { label: "I", action: () => insert("*", "*"), class: "italic" },
            { label: "U", action: () => insert("__", "__"), class: "underline" },
            { label: "🔗", action: () => insert("[", "](https://)") },
            { label: "•", action: () => insert("- ") },
            { label: "1.", action: () => insert("1. ") }
          ].map((btn, i) => (
            <button
              key={i}
              onClick={btn.action}
              className={cn(
                "px-2 py-1 rounded-md text-xs",
                "bg-white/5 hover:bg-white/15",
                "border border-white/10",
                "transition-all",
                btn.class
              )}
            >
              {btn.label}
            </button>
          ))}
        </div>

        <textarea
          id="terms-editor"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className={cn(
            "flex-grow w-full p-4 rounded-lg bg-black/40 border border-white/10",
            "text-white resize-none overflow-y-auto text-sm leading-relaxed"
          )}
          style={{ minHeight: "60vh" }}
        />

        <div className={cn('flex', 'justify-center', 'gap-4', 'pt-4', 'mt-4', 'border-t', 'border-white/10')}>
          <button
            onClick={onClose}
            className={cn('px-4', 'py-2', 'rounded-md', 'text-sm', 'bg-white/10', 'hover:bg-white/15')}
          >
            Cancel
          </button>

          <button
            onClick={saveTerms}
            disabled={saving}
            className={
              saving
                ? "px-4 py-2 rounded-md text-sm border font-medium opacity-60 cursor-wait"
                : "px-4 py-2 rounded-md text-sm border font-medium bg-emerald-600/80 border-emerald-500 hover:bg-emerald-600"
            }
          >
            {saving ? "Saving…" : "Save Terms"}
          </button>
        </div>
      </div>
    </div>
  );
}
