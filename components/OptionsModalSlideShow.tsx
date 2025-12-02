'use client';

import { useState, useEffect } from 'react';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { cn } from "../lib/utils";

const supabase = getSupabaseClient();

export default function OptionsModalSlideShow({
  show,
  hostId,
  onClose,
  refreshSlideshows,
}) {
  const [saving, setSaving] = useState(false);
  const [adsQueue, setAdsQueue] = useState<any[]>([]);

  const [localShow, setLocalShow] = useState({
    ...show,
    name: show.name,
    transition: show.transition || "Fade In / Fade Out",
    duration_seconds: show.duration_seconds || 8,
    slide_ids: show.slide_ids || [],
  });

  /* ------------------------------------------------------------
     LOAD HOST + CORPORATE ADS
  ------------------------------------------------------------ */
  useEffect(() => {
    async function loadQueue() {
      const { data, error } = await supabase
        .from("ad_slides")
        .select("id, name, rendered_url, flyer_url, file_type, video_url, host_id")
        .not("rendered_url", "is", null)
        .or(`host_id.eq.${hostId},host_id.is.null`)
        .order("created_at", { ascending: false });

      if (!error && data) setAdsQueue(data);
    }
    loadQueue();
  }, [hostId]);

  /* ------------------------------------------------------------
     GENERATE VIDEO THUMBNAIL
  ------------------------------------------------------------ */
  function generateVideoThumbnail(file: File): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.src = URL.createObjectURL(file);
      video.crossOrigin = "anonymous";
      video.muted = true;

      video.addEventListener("loadeddata", () => {
        video.currentTime = 0.1;
      });

      video.addEventListener("seeked", () => {
        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = 180;

        const ctx = canvas.getContext("2d");
        ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(
          (blob) => blob ? resolve(blob) : reject("Thumbnail creation failed"),
          "image/png"
        );
      });

      video.onerror = (err) => reject(err);
    });
  }

  /* ------------------------------------------------------------
     UPLOAD HANDLER (IMAGES + VIDEOS)
  ------------------------------------------------------------ */
  async function handleUpload(e: any) {
    const file = e.target.files[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    const isVideo = ext === "mp4";

    try {
      let finalImageUrl = null;  // Thumbnail always
      let finalVideoUrl = null;  // Actual MP4 if video

      /* ---------------------------
         VIDEO UPLOAD + THUMBNAIL
      ---------------------------- */
      if (isVideo) {
        const thumbnailBlob = await generateVideoThumbnail(file);
        const thumbName = `${crypto.randomUUID()}.png`;

        const { error: thumbErr } = await supabase.storage
          .from("ad-slideshow-images")
          .upload(thumbName, thumbnailBlob);

        if (thumbErr) {
          console.error("Thumbnail Upload Error:", thumbErr);
          alert("Failed to upload video thumbnail.");
          return;
        }

        // Public thumbnail URL
        const { data: thumbUrl } = supabase.storage
          .from("ad-slideshow-images")
          .getPublicUrl(thumbName);

        finalImageUrl = thumbUrl.publicUrl;

        // Upload actual video file
        const videoName = `${crypto.randomUUID()}.mp4`;

        const { error: videoErr } = await supabase.storage
          .from("ad-slideshow-images")
          .upload(videoName, file);

        if (videoErr) {
          console.error("Video Upload Error:", videoErr);
          alert("Failed to upload video.");
          return;
        }

        const { data: videoUrl } = supabase.storage
          .from("ad-slideshow-images")
          .getPublicUrl(videoName);

        finalVideoUrl = videoUrl.publicUrl;
      }

      /* ---------------------------
         IMAGE UPLOAD
      ---------------------------- */
      else {
        const fileName = `${crypto.randomUUID()}.${ext}`;

        const { error: imgErr } = await supabase.storage
          .from("ad-slideshow-images")
          .upload(fileName, file);

        if (imgErr) {
          console.error("Image Upload Failed:", imgErr);
          alert("Image upload failed.");
          return;
        }

        const { data: imgUrl } = supabase.storage
          .from("ad-slideshow-images")
          .getPublicUrl(fileName);

        finalImageUrl = imgUrl.publicUrl;
        finalVideoUrl = imgUrl.publicUrl; // same for images
      }

      /* ------------------------------------------------------------
         INSERT INTO DATABASE — PATCHED FOR VIDEO SUPPORT
      ------------------------------------------------------------ */
      const { data: insertData, error: insertError } = await supabase
        .from("ad_slides")
        .insert({
          name: file.name,
          rendered_url: finalImageUrl, 
          flyer_url: finalVideoUrl,    

          // 🎯 REQUIRED FIX
          file_type: isVideo ? "video" : "image",
          video_url: isVideo ? finalVideoUrl : null,

          host_id: hostId,
        })
        .select()
        .single();

      if (insertError) {
        console.error("Insert Error:", insertError);
        alert("Failed to save slide.");
        return;
      }

      // Add to queue immediately
      setAdsQueue((q) => [insertData, ...q]);

      alert(isVideo ? "Video uploaded successfully!" : "Image uploaded!");
    } catch (err) {
      console.error("UPLOAD ERROR:", err);
      alert("Upload failed.");
    }
  }

  /* ------------------------------------------------------------
     SAVE SLIDESHOW
  ------------------------------------------------------------ */
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

      await supabase.from("slide_shows").update(updates).eq("id", show.id);

      await refreshSlideshows();
      onClose();
    } catch (err) {
      console.error("SAVE ERROR:", err);
    } finally {
      setSaving(false);
    }
  }

  /* ------------------------------------------------------------
     ADD / REMOVE / REORDER SLIDES
  ------------------------------------------------------------ */
  function addQueueItem(ad: any) {
    if (!localShow.slide_ids.includes(ad.id)) {
      setLocalShow({ ...localShow, slide_ids: [...localShow.slide_ids, ad.id] });
    }
  }

  function removeSlide(i: number) {
    const updated = [...localShow.slide_ids];
    updated.splice(i, 1);
    setLocalShow({ ...localShow, slide_ids: updated });
  }

  function moveSlideUp(i: number) {
    if (i === 0) return;
    const updated = [...localShow.slide_ids];
    [updated[i - 1], updated[i]] = [updated[i], updated[i - 1]];
    setLocalShow({ ...localShow, slide_ids: updated });
  }

  function moveSlideDown(i: number) {
    if (i === localShow.slide_ids.length - 1) return;
    const updated = [...localShow.slide_ids];
    [updated[i + 1], updated[i]] = [updated[i], updated[i + 1]];
    setLocalShow({ ...localShow, slide_ids: updated });
  }

  function findSlideById(id: string) {
    return adsQueue.find((x) => x.id === id);
  }

  /* ------------------------------------------------------------
     DELETE AD
  ------------------------------------------------------------ */
  async function deleteAdFromQueue(ad: any) {
    if (!confirm(`Delete ad "${ad.name}" permanently?`)) return;

    try {
      const paths = [];

      const p1 = ad.rendered_url?.split("/ad-slideshow-images/")[1];
      const p2 = ad.flyer_url?.split("/ad-slideshow-images/")[1];

      if (p1) paths.push(p1);
      if (p2 && p2 !== p1) paths.push(p2);

      if (paths.length > 0) {
        await supabase.storage.from("ad-slideshow-images").remove(paths);
      }

      await supabase.from("ad_slides").delete().eq("id", ad.id);

      setAdsQueue((q) => q.filter((x) => x.id !== ad.id));

      setLocalShow((prev) => ({
        ...prev,
        slide_ids: prev.slide_ids.filter((sid) => sid !== ad.id),
      }));
    } catch (err) {
      console.error("Delete Ad Error:", err);
      alert("Failed to delete ad.");
    }
  }

  /* ------------------------------------------------------------
     DELETE SLIDESHOW
  ------------------------------------------------------------ */
  async function deleteSlideshow() {
    if (!confirm(`Delete slideshow "${localShow.name}"?`)) return;

    await supabase.from("slide_shows").delete().eq("id", show.id);
    await refreshSlideshows();
    onClose();
  }

  /* ------------------------------------------------------------
     UI START
  ------------------------------------------------------------ */
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
        {/* CLOSE BUTTON */}
        <button
          onClick={onClose}
          className={cn('absolute', 'top-3', 'right-3', 'text-white/80', 'hover:text-white', 'text-xl')}
        >
          ✕
        </button>

        <h3 className={cn('text-center', 'text-xl', 'font-semibold', 'mb-6')}>
          🖼 Edit Slide Show
        </h3>

        {/* ------------------------------------ */}
        {/* MAIN GRID */}
        {/* ------------------------------------ */}
        <div className={cn('grid', 'grid-cols-2', 'gap-10')}>
          <div className="space-y-5">

            {/* NAME */}
            <div>
              <label className={cn('block', 'text-sm', 'font-semibold', 'mb-1')}>
                Slideshow Name
              </label>
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
              <label className={cn('block', 'text-sm', 'font-semibold', 'mb-1')}>
                Transition Style
              </label>
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
                value={localShow.duration_seconds}
                onChange={(e) =>
                  setLocalShow({
                    ...localShow,
                    duration_seconds: Number(e.target.value),
                  })
                }
                className={cn('w-full', 'px-3', 'py-2', 'rounded-lg', 'bg-black/40', 'border', 'border-white/10')}
              />
            </div>

          </div>

          {/* ------------------------------------ */}
          {/* ACTIVE SLIDES */}
          {/* ------------------------------------ */}
          <div>
            <h4 className={cn('text-md', 'font-semibold', 'mb-2')}>Active Slides</h4>

            <div className={cn('max-h-[350px]', 'overflow-y-auto', 'p-2', 'bg-black/20', 'border', 'border-white/10', 'rounded-lg')}>
              {localShow.slide_ids.length === 0 ? (
                <p className={cn('text-gray-400', 'text-sm', 'text-center', 'py-4')}>
                  No active slides.
                </p>
              ) : (
                localShow.slide_ids.map((slideId: string, i: number) => {
                  const slide = findSlideById(slideId);

                  return (
                    <div
                      key={i}
                      className={cn('flex', 'items-center', 'justify-between', 'mb-3', 'p-2', 'rounded-md', 'bg-black/30', 'border', 'border-white/10')}
                    >
                      {slide ? (
                        <img
                          src={slide.rendered_url}
                          className={cn('w-20', 'h-14', 'object-cover', 'rounded-md', 'border', 'border-white/20')}
                        />
                      ) : (
                        <div className={cn('w-20', 'h-14', 'bg-gray-700', 'rounded-md', 'flex', 'items-center', 'justify-center', 'text-xs')}>
                          Missing
                        </div>
                      )}

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
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ------------------------------------ */}
        {/* AD QUEUE */}
        {/* ------------------------------------ */}
        <div className="mt-10">
          <div className={cn('flex', 'items-center', 'justify-between', 'mb-3')}>
            <h4 className={cn('text-md', 'font-semibold')}>Ad Queue</h4>

            <label className={cn('px-3', 'py-1', 'bg-emerald-600', 'hover:bg-emerald-700', 'rounded', 'text-white', 'text-xs', 'font-semibold', 'cursor-pointer')}>
              ⬆ Upload
              <input
                type="file"
                accept="image/jpeg, image/jpg, image/png, video/mp4"
                className="hidden"
                onChange={handleUpload}
              />
            </label>
          </div>

          <div className={cn('max-h-[300px]', 'overflow-y-auto', 'p-2', 'bg-black/20', 'border', 'border-white/10', 'rounded-lg')}>
            {adsQueue.length === 0 ? (
              <p className={cn('text-gray-400', 'text-sm', 'text-center', 'py-4')}>
                No ads available.
              </p>
            ) : (
              adsQueue.map((ad) => (
                <div
                  key={ad.id}
                  className={cn('flex', 'items-center', 'justify-between', 'mb-3', 'p-2', 'rounded-md', 'bg-black/30', 'border', 'border-white/10')}
                >
                  <div className={cn('flex', 'items-center', 'gap-3')}>
                    <img
                      src={ad.rendered_url}
                      className={cn('w-20', 'h-14', 'object-cover', 'rounded-md', 'border', 'border-white/20')}
                    />
                    <span className="text-sm">{ad.name}</span>
                  </div>

                  <div className={cn('flex', 'gap-2')}>
                    <button
                      onClick={() => addQueueItem(ad)}
                      className={cn('px-3', 'py-1', 'bg-blue-600', 'hover:bg-blue-700', 'rounded', 'text-white', 'text-xs', 'font-semibold')}
                    >
                      ➕ Add
                    </button>

                    <button
                      onClick={() => deleteAdFromQueue(ad)}
                      className={cn('px-3', 'py-1', 'bg-red-600', 'hover:bg-red-700', 'rounded', 'text-white', 'text-xs', 'font-semibold')}
                    >
                      🗑 Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ------------------------------------ */}
        {/* FOOTER */}
        {/* ------------------------------------ */}
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
