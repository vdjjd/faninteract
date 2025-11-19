'use client';

import { useEffect, useState, useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAdInjector } from '@/hooks/useAdInjector';
import AdOverlay from '@/app/wall/components/AdOverlay';

/* -------------------------------------- */
/* SPEED MAP                               */
/* -------------------------------------- */
const speedMap: Record<string, number> = {
  Slow: 12000,
  Medium: 8000,
  Fast: 4000,
};

/* -------------------------------------- */
/* ANIMATION SPEED                         */
/* -------------------------------------- */
const animSpeedMap: Record<string, number> = {
  Slow: 2.0,
  Medium: 1.5,
  Fast: 1.0,
};

/* -------------------------------------- */
/* SLIDE TRANSITION                        */
/* -------------------------------------- */
function buildSlideUpTransition(speed: string) {
  const duration = animSpeedMap[speed] || 1.5;

  return {
    initial: { opacity: 0, y: 100 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -100 },
    transition: { duration, ease: 'easeInOut' },
  };
}

interface Grid2x2WallProps {
  event: any;
  posts: any[];
}

/* -------------------------------------- */
/* POST ROW                                */
/* -------------------------------------- */
function PostRow({ post, reversed = false }) {
  if (!post)
    return (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: '2rem',
          opacity: 0.6,
        }}
      >
        Waiting for posts…
      </div>
    );

  const PhotoBlock = (
    <div
      style={{
        display: 'flex',
        flexGrow: 1,
        flexBasis: 0,
        minHeight: 0,
        height: '100%',
        overflow: 'hidden',
        borderRadius: 12,
      }}
    >
      <img
        src={post.photo_url || '/fallback.png'}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />
    </div>
  );

  const TextBlock = (
    <div
      style={{
        display: 'flex',
        flexGrow: 1,
        flexBasis: 0,
        flexDirection: 'column',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.35)',
        borderRadius: 12,
        padding: 20,
        height: '100%',
      }}
    >
      <h3
        style={{
          color: '#fff',
          textAlign: 'center',
          margin: 0,
          fontWeight: 800,
          fontSize: '2.2rem',
        }}
      >
        {post.nickname}
      </h3>

      <p
        style={{
          color: '#ddd',
          textAlign: 'center',
          marginTop: '1vh',
          fontSize: '1.6rem',
        }}
      >
        {post.message}
      </p>
    </div>
  );

  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        gap: 12,
      }}
    >
      {reversed ? (
        <>
          {TextBlock}
          {PhotoBlock}
        </>
      ) : (
        <>
          {PhotoBlock}
          {TextBlock}
        </>
      )}
    </div>
  );
}

/* -------------------------------------- */
/* MAIN WALL                               */
/* -------------------------------------- */
export default function Grid2x2Wall({ event, posts }: Grid2x2WallProps) {
  /*  
     ⭐ Your hook does NOT return setShowAd  
     ⭐ It ONLY returns: { showAd, currentAd, injectorEnabled, injectorMode, tick }
  */

  const { showAd, currentAd, injectorEnabled, tick } = useAdInjector({
    hostId: event?.host_profile_id ?? event?.host_id,
  });

  const transitionSpeed = event?.transition_speed || 'Medium';
  const slideUp = buildSlideUpTransition(transitionSpeed);

  /* BACKGROUND, TITLE, LOGO */
  const [bg, setBg] = useState('');
  const [brightness, setBrightness] = useState(100);
  const [title, setTitle] = useState('Fan Zone Wall');

  const [logo, setLogo] = useState('/faninteractlogo.png');
  const [displayDuration, setDisplayDuration] = useState(
    speedMap[transitionSpeed]
  );

  useEffect(() => {
    setBg(
      event?.background_type === 'image'
        ? `url(${event.background_value}) center/cover no-repeat`
        : event?.background_value
    );

    setBrightness(event?.background_brightness ?? 100);
    setTitle(event?.title || 'Fan Zone Wall');

    setLogo(
      event?.logo_url && event.logo_url.trim() !== ''
        ? event.logo_url
        : '/faninteractlogo.png'
    );

    setDisplayDuration(speedMap[event?.transition_speed] || speedMap.Medium);
  }, [event]);

  /* -------------------------------------- */
  /* QUAD ROTATION ENGINE                   */
  /* -------------------------------------- */
  const [gridPosts, setGridPosts] = useState<(any | null)[]>(
    Array(4).fill(null)
  );

  const pointer = useRef(0);
  const slot = useRef(0);
  const running = useRef(true);

  const rotationOrder = [0, 1, 2, 3];

  // INITIAL FILL
  useEffect(() => {
    if (!posts?.length) return;

    if (gridPosts.every((p) => p === null)) {
      const initial = rotationOrder.map((i) => posts[i % posts.length]);
      setGridPosts(initial);
      pointer.current = 4 % posts.length;
      slot.current = 0;
    }
  }, [posts]);

  // ROTATION LOOP
  useEffect(() => {
    if (!posts?.length) return;
    running.current = true;

    const loop = async () => {
      while (running.current) {
        const pos = rotationOrder[slot.current % 4];
        const nextPost = posts[pointer.current % posts.length];

        // exit
        setGridPosts((prev) => {
          const updated = [...prev];
          updated[pos] = null;
          return updated;
        });

        await new Promise((res) =>
          setTimeout(res, animSpeedMap[transitionSpeed] * 1000 * 0.6)
        );

        // enter
        setGridPosts((prev) => {
          const updated = [...prev];
          updated[pos] = nextPost;
          return updated;
        });

        pointer.current = (pointer.current + 1) % posts.length;
        slot.current = (slot.current + 1) % 4;

        tick();

        await new Promise((res) => setTimeout(res, displayDuration));
      }
    };

    loop();
    return () => {
      running.current = false;
    };
  }, [posts, displayDuration, transitionSpeed]);

  /* -------------------------------------- */
  /* RENDER                                  */
  /* -------------------------------------- */
  return (
    <div
      style={{
        background: bg,
        filter: `brightness(${brightness}%)`,
        width: '100%',
        height: '100vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        position: 'relative',
      }}
    >
      {/* LOGO */}
      <div
        style={{
          position: 'absolute',
          top: '0vh',
          right: '1.5vw',
          width: 'clamp(160px,18vw,220px)',
        }}
      >
        <img src={logo} style={{ width: '100%' }} />
      </div>

      {/* TITLE */}
      <h1
        style={{
          color: '#fff',
          marginTop: '-0.80vh',
          marginBottom: '-1vh',
          fontWeight: 900,
          fontSize: 'clamp(2.5rem,4vw,5rem)',
          textShadow: `
            2px 2px 2px #000,
            -2px 2px 2px #000,
            2px -2px 2px #000,
            -2px -2px 2px #000
          `,
          filter: `
            drop-shadow(0 0 25px rgba(255,255,255,0.6))
            drop-shadow(0 0 40px rgba(255,255,255,0.3))
          `,
        }}
      >
        {title}
      </h1>

      {/* GRID */}
      <div
        style={{
          display: 'grid',
          width: '80vw',
          height: '55vh',
          gridTemplateColumns: `1fr 1fr`,
          gridTemplateRows: `1fr 1fr`,
          gap: '12px',
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <AnimatePresence key={i} mode="wait">
            {gridPosts[i] && (
              <motion.div
                key={`${i}-${gridPosts[i]?.id}`}
                {...slideUp}
                style={{ width: '100%', height: '100%' }}
              >
                <PostRow post={gridPosts[i]} reversed={i === 2 || i === 3} />
              </motion.div>
            )}
          </AnimatePresence>
        ))}
      </div>

      {/* QR CODE */}
      <div
        style={{
          position: 'absolute',
          bottom: '4vh',
          left: '2.5vw',
          textAlign: 'center',
        }}
      >
        <p
          style={{
            color: '#fff',
            fontWeight: 800,
            marginBottom: '0.6vh',
          }}
        >
          Scan Me To Join
        </p>

        <div
          style={{
            padding: '5px',
            borderRadius: '16px',
            background: 'rgba(255,255,255,0.12)',
            boxShadow: `
              0 0 25px rgba(255,255,255,0.6),
              0 0 40px rgba(255,255,255,0.3)
            `,
          }}
        >
          <QRCodeCanvas
            value={`https://faninteract.vercel.app/guest/signup?wall=${event?.id}`}
            size={210}
            level="H"
            style={{ borderRadius: 8 }}
          />
        </div>
      </div>
    </div>
  );
}
