'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { AnimatePresence, motion } from 'framer-motion';
import { Fullscreen, Minimize } from 'lucide-react';
import { cn } from "../../../lib/utils";

/* ===========================================
   TRANSITIONS
=========================================== */
const transitions: Record<string, any> = {
  'Fade In / Fade Out': {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.8, ease: 'easeInOut' },
  },
  'Slide Up / Slide Out': {
    initial: { opacity: 0, y: 100 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -100 },
    transition: { duration: 0.9, ease: 'easeInOut' },
  },
  'Slide Down / Slide Out': {
    initial: { opacity: 0, y: -100 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 100 },
    transition: { duration: 0.9, ease: 'easeInOut' },
  },
  'Slide Left / Slide Right': {
    initial: { opacity: 0, x: 120 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -120 },
    transition: { duration: 0.9, ease: 'easeInOut' },
  },
  'Slide Right / Slide Left': {
    initial: { opacity: 0, x: -120 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 120 },
    transition: { duration: 0.9, ease: 'easeInOut' },
  },
  'Zoom In / Zoom Out': {
    initial: { opacity: 0, scale: 0.85 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 1.15 },
    transition: { duration: 0.9, ease: 'easeInOut' },
  },
  'Zoom Out / Zoom In': {
    initial: { opacity: 0, scale: 0.7 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.85 },
    transition: { duration: 0.9, ease: 'easeInOut' },
  },
  'Flip': {
    initial: { opacity: 0, rotateY: 90 },
    animate: { opacity: 1, rotateY: 0 },
    exit: { opacity: 0, rotateY: -90 },
    transition: { duration: 0.9, ease: 'easeInOut' },
  },
  'Rotate In / Rotate Out': {
    initial: { opacity: 0, rotate: -180 },
    animate: { opacity: 1, rotate: 0 },
    exit: { opacity: 0, rotate: 180 },
    transition: { duration: 0.9, ease: 'easeInOut' },
  },
};

/* ===========================================
   COMPONENT
=========================================== */
export default function SlideShowPlayer() {
  const supabase = createClientComponentClient();
  const { slideshowId } = useParams();

  const [slideshow, setSlideshow] = useState<any>(null);
  const [slides, setSlides] = useState<any[]>([]);
  const [current, setCurrent] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Refs to track previous values
  const lastSlideIdsRef = useRef<string[]>([]);
  const lastDurationRef = useRef<number>(0);
  const lastTransitionRef = useRef<string>("");
  const lastPlayingRef = useRef<boolean>(true);

  const duration = slideshow?.duration_seconds ?? 8;
  const transitionType = slideshow?.transition ?? "Fade In / Fade Out";

  /* ===========================================
     LOAD SLIDESHOW DATA
  ============================================ */
  const loadSlideshow = useCallback(async () => {
    const { data: show } = await supabase
      .from("slide_shows")
      .select("*")
      .eq("id", slideshowId)
      .single();

    if (!show) return;

    setSlideshow(show);

    const newIds = show.slide_ids || [];
    const slideChanged = JSON.stringify(newIds) !== JSON.stringify(lastSlideIdsRef.current);
    const durationChanged = show.duration_seconds !== lastDurationRef.current;
    const transitionChanged = show.transition !== lastTransitionRef.current;
    const playingChanged = show.is_playing !== lastPlayingRef.current;

    // Update refs
    lastSlideIdsRef.current = newIds;
    lastDurationRef.current = show.duration_seconds;
    lastTransitionRef.current = show.transition;
    lastPlayingRef.current = show.is_playing;

    // Reload slides ONLY if needed
    if (slideChanged) {
      if (!newIds.length) {
        setSlides([]);
        return;
      }

      const { data: allSlides } = await supabase
        .from("ad_slides")
        .select("*")
        .in("id", newIds);

      if (!allSlides) return;

      const ordered = newIds
        .map((id: string) => allSlides.find((s: any) => s.id === id))
        .filter(Boolean);

      setSlides(ordered);

      // Fix out-of-range current index
      setCurrent((c) => (ordered.length ? c % ordered.length : 0));
    }

  }, [slideshowId, supabase]);

  /* ===========================================
     INITIAL LOAD
  ============================================ */
  useEffect(() => {
    loadSlideshow();
  }, [loadSlideshow]);

  /* ===========================================
     POLLING — every 10 seconds
  ============================================ */
  useEffect(() => {
    const interval = setInterval(loadSlideshow, 10000);
    return () => clearInterval(interval);
  }, [loadSlideshow]);

  /* ===========================================
     AUTO ROTATION (only when playing)
  ============================================ */
  useEffect(() => {
    if (!slides.length) return;
    if (!slideshow?.is_playing) return; // STOP → no rotation

    const timer = setInterval(() => {
      setCurrent((c) => (c + 1) % slides.length);
    }, duration * 1000);

    return () => clearInterval(timer);
  }, [slides, duration, slideshow?.is_playing]);

  /* ===========================================
     FULLSCREEN TOGGLE
  ============================================ */
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  const currentSlide = slides[current];
  const transition =
    transitions[transitionType] || transitions["Fade In / Fade Out"];

  return (
    <div
      className={cn(
        "w-screen h-screen bg-black overflow-hidden relative",
        "flex items-center justify-center"
      )}
      style={{ touchAction: "none" }}
    >
      <AnimatePresence mode="wait">
        {currentSlide && (
          <motion.div
            key={currentSlide.id}
            className={cn(
              "absolute inset-0 flex items-center justify-center"
            )}
            initial={transition.initial}
            animate={transition.animate}
            exit={transition.exit}
            transition={transition.transition}
            style={{ perspective: "1200px" }}
          >
            <img
              src={currentSlide.rendered_url || currentSlide.flyer_url}
              alt=""
              className={cn("max-w-full max-h-full object-contain")}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* FULLSCREEN BUTTON */}
      <div
        style={{
          position: 'fixed',
          bottom: '30px',
          right: '30px',
          width: 40,
          height: 40,
          borderRadius: 12,
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          opacity: 0.10,
          transition: 'opacity 0.2s ease',
          zIndex: 999999999,
        }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '0.35')}
        onClick={toggleFullscreen}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          stroke="white"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          style={{ width: 28, height: 28 }}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 9V4h5M21 9V4h-5M3 15v5h5M21 15v5h-5"
          />
        </svg>
      </div>
    </div>
  );
}
