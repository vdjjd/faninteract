'use client';

import { useState, useEffect } from 'react';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { cn } from "../lib/utils";
import imageCompression from 'browser-image-compression';

const supabase = getSupabaseClient();

export default function OptionsModalSlideShow({
  show,
  hostId,
  onClose,
  refreshSlideshows,
}) {
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [adsQueue, setAdsQueue] = useState<any[]>([]);

  const [localShow, setLocalShow] = useState({
    ...show,
    name: show.name,
    transition: show.transition || 'Fade In / Fade Out',
    duration_seconds: show.duration_seconds || 8,
    slide_ids: show.slide_ids || [],
  });

  /* ------------------------------------------------------ */
  /* LOAD AD QUEUE (only rendered ads)                      */
  /* ------------------------------------------------------ */
  useEffect(() => {
    async function loadQueue() {
      const { data, error } = await supabase
        .from("ad_slides")
        .select("id, name, rendered_url")
        .eq("host_id", hostId)
        .not("rendered_url", "is", null)
        .order("created_at", { ascending: false });

      if (!error && data) setAdsQueue(data);
    }

    loadQueue();
  }, [hostId]);

  /* ------------------------------------------------------ */
  /* SAVE SLIDESHOW                                         */
  /* ------------------------------------------------------ */
  async function handleSave() {
    try {
      setSaving(true);

      const updates = {
        name: localShow.name.trim(),
        transition: localShow.transition,
        duration_seconds: localShow.duration_seconds,
        slide_ids: localShow.slide_ids,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("slide_shows")
        .update(updates)
        .eq("id", show.id);

      if (error) throw error;

      await refreshSlideshows();
      onClose();
    } catch (err) {
      console.error("SAVE ERROR:", err);
    } finally {
      setSaving(false);
    }
  }

  /* ------------------------------------------------------ */
  /* ADD AD TO ACTIVE SLIDES                                */
  /* ------------------------------------------------------ */
  function addQueueItem(ad) {
    if (localShow.slide_ids.includes(ad.rendered_url)) return; // avoid duplicates

    setLocalShow({
      ...localShow,
      slide_ids: [...localShow.slide_ids, ad.rendered_url],
    });
  }

  /* ------------------------------------------------------ */
  /* REMOVE / REORDER SLIDES                                 */
  /* ------------------------------------------------------ */
  function removeSlide(index) {
    const newSlides = [...localShow.slide_ids];
    newSlides.splice(index, 1);

    setLocalShow({
      ...localShow,
      slide_ids: newSlides,
    });
  }

  function moveSlideUp(i) {
    if (i === 0) return;
    const s = [...localShow.slide_ids];
    [s[i - 1], s[i]] = [s[i], s[i - 1]];
    setLocalShow({ ...localShow, slide_ids: s });
  }

  function moveSlideDown(i) {
    if (i === localShow.slide_ids.length - 1) return;
    const s = [...localShow.slide_ids];
    [s[i + 1], s[i]] = [s[i], s[i + 1]];
    setLocalShow({ ...localShow, slide_ids: s });
  }

  /* ------------------------------------------------------ */
  /* DELETE SLIDESHOW                                        */
  /* ------------------------------------------------------ */
  async function deleteSlideshow() {
    if (!confirm(`Delete slideshow "${localShow.name}"? This cannot be undone.`)) return;

    const { error } = await supabase
      .from("slide_shows")
      .delete()
      .eq("id", show.id);

    if (error) {
      console.error("❌ Delete Error:", error);
      alert("Failed to delete slideshow.");
      return;
    }

    await refreshSlideshows();
    onClose();
  }

  /* ------------------------------------------------------ */
  /* UI                                                     */
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
          "relative w-full max-w-[1200px] rounded-2xl",
          "border border-blue-500/30 shadow-[0_0_40px_rgba(0,140,255,0.45)]",
          "bg-gradient-to-br from-[#0b0f1a]/95 to-[#111827]/95 p-6 text-white"
        )}
      >
        <button
          onClick={onClose}
          className={cn("absolute top-3 right-3 text-white/80 hover:text-white text-xl")}
        >
          ✕
        </button>

        <h3 className={cn("text-center text-xl font-semibold mb-6")}>
          🖼 Edit Slide Show
        </h3>

        {/* -------------------------------------------------- */}
        {/*      GRID: LEFT SETTINGS | RIGHT ACTIVE SLIDES     */}
        {/* -------------------------------------------------- */}
        <div className={cn('grid', 'grid-cols-2', 'gap-10')}>

          {/* LEFT SETTINGS */}
          <div className="space-y-5">

            {/* NAME */}
            <div>
              <label className={cn('block', 'text-sm', 'font-semibold', 'mb-1')}>Slideshow Name</label>
              <input
                className={cn('w-full', 'px-3', 'py-2', 'rounded-lg', 'bg-black/40', 'border', 'border-white/10')}
                value={localShow.name}
                onChange={(e) =>
                  setLocalShow({ ...localShow, name: e.target.value })
                }
              />
            </div>

            {/* TRANSITION */}
            <div>
              <label className={cn('block', 'text-sm', 'font-semibold', 'mb-1')}>Transition Style</label>
              <select
                className={cn('w-full', 'px-3', 'py-2', 'rounded-lg', 'bg-black/40', 'border', 'border-white/10')}
                value={localShow.transition}
                onChange={(e) =>
                  setLocalShow({ ...localShow, transition: e.target.value })
                }
              >
                <option>Fade In / Fade Out</option>
                <option>Slide Up / Slide Out</option>
                <option>Slide Down / Slide Out</option>
                <option>Slide Left / Slide Right</option>
                <option>Slide Right / Slide Left</option>
                <option>Zoom In / Zoom Out</option>
                <option>Zoom Out / Zoom In</option>
                <option>Flip</option>
                <option>Rotate In / Rotate Out</option>
              </select>
            </div>

            {/* DURATION */}
            <div>
              <label className={cn('block', 'text-sm', 'font-semibold', 'mb-1')}>
                Slide Duration (seconds)
              </label>
              <input
                type="number"
                min={1}
                max={60}
                className={cn('w-full', 'px-3', 'py-2', 'rounded-lg', 'bg-black/40', 'border', 'border-white/10')}
                value={localShow.duration_seconds}
                onChange={(e) =>
                  setLocalShow({ ...localShow, duration_seconds: Number(e.target.value) })
                }
              />
            </div>

          </div>

          {/* RIGHT: ACTIVE SLIDES */}
          <div>
            <h4 className={cn('text-md', 'font-semibold', 'mb-2')}>Active Slides</h4>

            <div className={cn('max-h-[350px]', 'overflow-y-auto', 'p-2', 'bg-black/20', 'border', 'border-white/10', 'rounded-lg')}>
              {localShow.slide_ids.length === 0 ? (
                <p className={cn('text-gray-400', 'text-sm', 'text-center', 'py-4')}>
                  No active slides. Add from the queue below.
                </p>
              ) : (
                localShow.slide_ids.map((url, i) => (
                  <div
                    key={i}
                    className={cn('flex', 'items-center', 'justify-between', 'mb-3', 'p-2', 'rounded-md', 'bg-black/30', 'border', 'border-white/10')}
                  >
                    <img
                      src={url}
                      alt="slide"
                      className={cn('w-20', 'h-14', 'object-cover', 'rounded-md', 'border', 'border-white/20')}
                    />

                    <div className={cn('flex', 'gap-2')}>
                      <button
                        onClick={() => moveSlideUp(i)}
                        className={cn('px-2', 'py-1', 'rounded', 'bg-gray-600', 'hover:bg-gray-700', 'text-white', 'text-xs')}
                      >
                        ↑
                      </button>

                      <button
                        onClick={() => moveSlideDown(i)}
                        className={cn('px-2', 'py-1', 'rounded', 'bg-gray-600', 'hover:bg-gray-700', 'text-white', 'text-xs')}
                      >
                        ↓
                      </button>

                      <button
                        onClick={() => removeSlide(i)}
                        className={cn('px-2', 'py-1', 'rounded', 'bg-red-700', 'hover:bg-red-800', 'text-white', 'text-xs')}
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

        {/* -------------------------------------------------- */}
        {/*                     AD QUEUE                       */}
        {/* -------------------------------------------------- */}
        <div className="mt-10">
          <h4 className={cn('text-md', 'font-semibold', 'mb-3')}>Ad Queue</h4>

          <div className={cn('max-h-[300px]', 'overflow-y-auto', 'p-2', 'bg-black/20', 'border', 'border-white/10', 'rounded-lg')}>

            {adsQueue.length === 0 && (
              <p className={cn('text-gray-400', 'text-sm', 'text-center', 'py-4')}>
                No ads available yet.
              </p>
            )}

            {adsQueue.map((ad) => (
              <div
                key={ad.id}
                className={cn('flex', 'items-center', 'justify-between', 'mb-3', 'p-2', 'rounded-md', 'bg-black/30', 'border', 'border-white/10')}
              >
                <div className={cn('flex', 'items-center', 'gap-3')}>
                  <img
                    src={ad.rendered_url}
                    alt="ad"
                    className={cn('w-20', 'h-14', 'object-cover', 'rounded-md', 'border', 'border-white/20')}
                  />
                  <span className="text-sm">{ad.name}</span>
                </div>

                <button
                  onClick={() => addQueueItem(ad)}
                  className={cn('px-3', 'py-1', 'bg-blue-600', 'hover:bg-blue-700', 'rounded', 'text-white', 'text-xs', 'font-semibold')}
                >
                  ➕ Add
                </button>
              </div>
            ))}

          </div>
        </div>

        {/* FOOTER */}
        <div className={cn('flex', 'justify-center', 'items-center', 'gap-4', 'border-t', 'border-white/10', 'mt-8', 'pt-4')}>
          <button
            onClick={deleteSlideshow}
            className={cn('px-4', 'py-2', 'rounded-md', 'text-sm', 'bg-red-600/80', 'hover:bg-red-700')}
          >
            Delete Slideshow
          </button>

          <button
            onClick={onClose}
            className={cn('px-4', 'py-2', 'rounded-md', 'text-sm', 'bg-white/10', 'hover:bg-white/15')}
          >
            Cancel
          </button>

          <button
            disabled={saving}
            onClick={handleSave}
            className={
              saving
                ? "px-4 py-2 rounded-md text-sm opacity-60 cursor-wait"
                : "px-4 py-2 rounded-md text-sm bg-emerald-600/80 hover:bg-emerald-600"
            }
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
