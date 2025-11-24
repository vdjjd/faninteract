'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { AnimatePresence, motion } from 'framer-motion';
import { Fullscreen, Minimize } from 'lucide-react';
import { cn } from "../../../lib/utils";

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
    initial: { opacity: 0, scale: 0.8 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 1.15 },
    transition: { duration: 0.9, ease: 'easeInOut' },
  },
  'Zoom Out / Zoom In': {
    initial: { opacity: 0, scale: 0.7 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.7 },
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

export default function SlideShowPlayer() {
  const supabase = createClientComponentClient();
  const { slideshowId } = useParams();

  const [slideshow, setSlideshow] = useState<any>(null);
  const [slides, setSlides] = useState<any[]>([]);
  const [current, setCurrent] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const duration = slideshow?.duration_seconds ?? 8;
  const transitionType = slideshow?.transition ?? 'Fade In / Fade Out';

  // ---------------------------
  // Load slideshow
  // ---------------------------
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('slide_shows')
        .select('*')
        .eq('id', slideshowId)
        .single();

      setSlideshow(data);

      if (data?.slide_ids?.length) {
        // Fetch slides and keep order
        const { data: slideData } = await supabase
          .from('ad_slides')
          .select('*')
          .in('id', data.slide_ids);

        if (slideData) {
          const ordered = data.slide_ids
            .map((id: string) => slideData.find((s: any) => s.id === id))
            .filter(Boolean);

          setSlides(ordered);
        }
      }
    };

    load();
  }, [slideshowId, supabase]);

  // ---------------------------
  // Auto-rotation
  // ---------------------------
  useEffect(() => {
    if (!slides.length) return;

    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % slides.length);
    }, duration * 1000);

    return () => clearInterval(timer);
  }, [slides, duration]);

  // ---------------------------
  // Fullscreen
  // ---------------------------
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
  const transition = transitions[transitionType] || transitions['Fade In / Fade Out'];

  return (
    <div
      className={cn('w-screen', 'h-screen', 'bg-black', 'overflow-hidden', 'relative', 'flex', 'items-center', 'justify-center')}
      style={{ touchAction: 'none' }}
    >
      <AnimatePresence mode="wait">
        {currentSlide && (
          <motion.div
            key={currentSlide.id}
            className={cn('absolute', 'inset-0', 'flex', 'items-center', 'justify-center')}
            initial={transition.initial}
            animate={transition.animate}
            exit={transition.exit}
            transition={transition.transition}
            style={{
              perspective: '1200px',
            }}
          >
            <img
              src={currentSlide.flyer_url}
              alt=""
              className={cn('max-w-full', 'max-h-full', 'object-contain')}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fullscreen Button */}
      <button
        onClick={toggleFullscreen}
        className={cn('absolute', 'bottom-6', 'right-6', 'bg-white/20', 'hover:bg-white/30', 'text-white', 'p-3', 'rounded-xl', 'backdrop-blur-sm', 'transition')}
      >
        {isFullscreen ? (
          <Minimize className={cn('w-6', 'h-6')} />
        ) : (
          <Fullscreen className={cn('w-6', 'h-6')} />
        )}
      </button>
    </div>
  );
}
