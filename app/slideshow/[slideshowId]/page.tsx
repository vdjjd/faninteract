'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from "../../../lib/utils";

const transitions: Record<string, any> = {
  'Fade In / Fade Out': {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.8, ease: 'easeInOut' },
  },
  // ... your other transitions unchanged ...
};

export default function SlideShowPlayer() {
  const supabase = createClientComponentClient();
  const { slideshowId } = useParams();

  const [slideshow, setSlideshow] = useState<any>(null);
  const [slides, setSlides] = useState<any[]>([]);
  const [current, setCurrent] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  const lastSlideIdsRef = useRef<string[]>([]);
  const duration = slideshow?.duration_seconds ?? 8;
  const transitionType = slideshow?.transition ?? "Fade In / Fade Out";

  const loadSlideshow = useCallback(async () => {
    const { data: show } = await supabase
      .from("slide_shows")
      .select("*")
      .eq("id", slideshowId)
      .single();

    if (!show) return;
    setSlideshow(show);

    const newIds = show.slide_ids || [];
    const slideChanged =
      JSON.stringify(newIds) !== JSON.stringify(lastSlideIdsRef.current);
    lastSlideIdsRef.current = newIds;

    if (!slideChanged) return;

    const { data: allSlides } = await supabase
      .from("ad_slides")
      .select("*")
      .in("id", newIds);

    if (!allSlides) return;

    const ordered = newIds.map(id => allSlides.find(s => s.id === id)).filter(Boolean);
    setSlides(ordered);

    console.log("🎬 PLAYER RECEIVED:", ordered);
  }, [slideshowId, supabase]);

  useEffect(() => {
    loadSlideshow();
  }, [loadSlideshow]);

  useEffect(() => {
    const interval = setInterval(loadSlideshow, 8000);
    return () => clearInterval(interval);
  }, [loadSlideshow]);

  const currentSlide = slides[current];

  const videoUrl =
    currentSlide?.video_url ||
    (currentSlide?.flyer_url?.includes(".mp4") ? currentSlide.flyer_url : null);

  const isVideo = !!videoUrl;

  /* ===========================================
     AUTO ROTATION FOR IMAGES ONLY
  ============================================ */
  useEffect(() => {
    if (!slides.length) return;
    if (!slideshow?.is_playing) return;

    if (isVideo) return; // ⛔ video uses onEnded instead

    const timer = setInterval(() => {
      setCurrent((c) => (c + 1) % slides.length);
    }, duration * 1000);

    return () => clearInterval(timer);
  }, [slides, duration, slideshow?.is_playing, isVideo]);

  const transition = transitions[transitionType];

  return (
    <div className={cn('w-screen', 'h-screen', 'bg-black', 'overflow-hidden', 'relative', 'flex', 'items-center', 'justify-center')}>
      <AnimatePresence mode="wait">
        {currentSlide && (
          <motion.div
            key={currentSlide.id}
            className={cn('absolute', 'inset-0', 'flex', 'items-center', 'justify-center')}
            initial={transition.initial}
            animate={transition.animate}
            exit={transition.exit}
            transition={transition.transition}
          >
            {isVideo ? (
              <video
                ref={videoRef}
                key={videoUrl}
                src={videoUrl}
                autoPlay
                loop={false}
                muted
                playsInline
                preload="auto"
                onEnded={() => {
                  console.log("🎬 VIDEO FINISHED");
                  setCurrent((c) => (c + 1) % slides.length);
                }}
                className={cn('max-w-full', 'max-h-full', 'object-contain')}
              />
            ) : (
              <img
                src={currentSlide.rendered_url || currentSlide.flyer_url}
                className={cn('max-w-full', 'max-h-full', 'object-contain')}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
