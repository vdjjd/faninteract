'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { cn } from '@/lib/utils';

export default function CreateNewAdModal({ hostId, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const nameValid = name.trim().length > 0;

  async function handleCreate() {
    if (!nameValid) return;
    setCreating(true);

    // 1️⃣ Create ad_slides entry
    const { data: ad, error: adErr } = await supabase
      .from("ad_slides")
      .insert({
        host_id: hostId,
        name,
        layers: [],
        canvas_width: 1920,
        canvas_height: 1080,
        background_type: "none",
        background_url: null
      })
      .select()
      .single();

    if (adErr || !ad) {
      alert("Error creating new ad");
      setCreating(false);
      return;
    }

    // 2️⃣ Create publish history row
    await supabase.from("ad_publish_history").insert({
      ad_slide_id: ad.id,
      host_id: hostId,
      published_to_injector: false,
      published_to_slideshow: false
    });

    setCreating(false);
    onClose();
    onCreated(ad.id);   // ⭐ open builder modal with adId
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
          "relative w-full max-w-[500px] rounded-2xl border border-blue-500/30",
          "bg-gradient-to-br from-[#0b0f1a]/95 to-[#111827]/95 shadow-[0_0_40px_rgba(0,140,255,0.45)]",
          "p-6 flex flex-col"
        )}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className={cn("absolute top-3 right-3 text-white text-xl")}
        >
          ✕
        </button>

        {/* Title */}
        <div className={cn('text-center', 'mb-4', 'border-b', 'border-white/10', 'pb-3')}>
          <h1
            className={cn(
              "text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent"
            )}
          >
            ✏️ Create New Ad
          </h1>
        </div>

        {/* Name Field */}
        <label className={cn('text-white/80', 'text-sm', 'mb-1')}>Ad Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter ad name"
          className={cn(
            "w-full bg-black/30 border border-white/20 rounded-lg px-3 py-2 text-white mb-2"
          )}
        />

        <p className={cn('text-xs', 'text-white/50', 'mb-4', 'italic')}>
          * This name cannot be changed later
        </p>

        {/* Buttons */}
        <div className={cn('flex', 'justify-end', 'gap-2')}>
          <button
            onClick={onClose}
            className={cn('px-4', 'py-2', 'bg-gray-600', 'text-white', 'rounded-lg')}
          >
            Cancel
          </button>

          <button
            disabled={!nameValid || creating}
            onClick={handleCreate}
            className={cn(
              "px-4 py-2 rounded-lg text-white font-semibold",
              nameValid
                ? "bg-cyan-600 hover:bg-cyan-700"
                : "bg-gray-500 cursor-not-allowed"
            )}
          >
            {creating ? "Creating…" : "Create Ad"}
          </button>
        </div>
      </div>
    </div>
  );
}
