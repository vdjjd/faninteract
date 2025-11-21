'use client';

import { useEffect, useState, useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { motion, AnimatePresence } from 'framer-motion';

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
/* FULL TRANSITION MAP                     */
/* -------------------------------------- */
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

const transitionKeys = Object.keys(transitions);

/* -------------------------------------- */
/* POST ROW (PATCHED — OUTLINED TEXT)     */
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

  const textOutline = `
    2px 2px 2px #000,
    -2px 2px 2px #000,
    2px -2px 2px #000,
    -2px -2px 2px #000
  `;

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
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
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
          textShadow: textOutline,
        }}
      >
        {post.nickname}
      </h3>

      <p
        style={{
          color: '#fff',
          textAlign: 'center',
          marginTop: '1vh',
          fontSize: '1.6rem',
          fontWeight: 600,
          textShadow: textOutline,
        }}
      >
        {post.message}
      </p>
    </div>
  );

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', gap: 12 }}>
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
/* GRID 2x2 WALL (FULL PAGE)              */
/* -------------------------------------- */
export default function Grid2x2Wall({
  event,
  posts,
  tickSubmissionDisplayed,
  pauseFlag,
}) {
  const transitionType = event?.post_transition || 'Fade In / Fade Out';
  const chosenTransition =
    transitionType === 'Random'
      ? transitions[
          transitionKeys[Math.floor(Math.random() * transitionKeys.length)]
        ]
      : transitions[transitionType] || transitions['Fade In / Fade Out'];

  const speedValue = event?.transition_speed || 'Medium';
  const displayDuration = speedMap[speedValue];

  const [bg, setBg] = useState('');
  const [brightness, setBrightness] = useState(100);
  const [title, setTitle] = useState('Fan Zone Wall');
  const [logo, setLogo] = useState('/faninteractlogo.png');

  useEffect(() => {
    setBg(
      event?.background_type === 'image'
        ? `url(${event.background_value}) center/cover no-repeat`
        : event?.background_value
    );

    setBrightness(event?.background_brightness ?? 100);
    setTitle(event?.title || 'Fan Zone Wall');
    setLogo(
      event?.host?.branding_logo_url?.trim()
        ? event.host.branding_logo_url
        : '/faninteractlogo.png'
    );
  }, [event]);

  /* -------------------------------------- */
  /* ROTATION ENGINE                         */
/* -------------------------------------- */
  const [gridPosts, setGridPosts] = useState<any[]>([]);

  useEffect(() => {
    if (!posts?.length) {
      setGridPosts([]);
      return;
    }

    const initial = [0, 1, 2, 3].map((i) => posts[i % posts.length]);
    setGridPosts(initial);
  }, [posts]);

  useEffect(() => {
    if (!posts?.length) return;

    let pointer = 4 % posts.length;
    let slotIndex = 0;
    const order = [0, 1, 2, 3];

    const interval = setInterval(() => {
      if (pauseFlag.current) return;

      const pos = order[slotIndex % 4];
      const nextPost = posts[pointer % posts.length];

      setGridPosts((prev) => {
        const base =
          prev && prev.length === 4
            ? [...prev]
            : [0, 1, 2, 3].map((i) => posts[i % posts.length]);

        base[pos] = nextPost;
        return base;
      });

      pointer = (pointer + 1) % posts.length;
      slotIndex = (slotIndex + 1) % 4;

      tickSubmissionDisplayed();
    }, displayDuration);

    return () => clearInterval(interval);
  }, [posts, displayDuration, pauseFlag, tickSubmissionDisplayed]);

  /* -------------------------------------- */
  /* RENDER                                 */
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
          top: '1.2vh',
          right: '1.5vw',
          width: 'clamp(180px,20vw,260px)',
          height: 'clamp(110px,12vw,180px)',
          borderRadius: 12,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          overflow: 'hidden',
          zIndex: 20,
        }}
      >
        <img
          src={logo}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            filter: 'drop-shadow(0 0 12px rgba(0,0,0,0.6))',
          }}
        />
      </div>

      {/* TITLE */}
      <h1
        style={{
          color: '#fff',
          marginTop: '3vh',
          marginBottom: '-1vh',
          fontWeight: 900,
          fontSize: 'clamp(2.5rem,4vw,5rem)',
          textShadow: `
            2px 2px 2px #000,
            -2px 2px 2px #000,
            2px -2px 2px #000,
            -2px -2px 2px #000
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
          gridTemplateColumns: '1fr 1fr',
          gridTemplateRows: '1fr 1fr',
          gap: '12px',
        }}
      >
        {[0, 1, 2, 3].map((i) => {
          const post = gridPosts[i];

          return (
            <div key={i} style={{ width: '100%', height: '100%' }}>
              <AnimatePresence mode="wait">
                {post && (
                  <motion.div
                    key={`${i}-${post.id}`}
                    {...chosenTransition}
                    style={{ width: '100%', height: '100%' }}
                  >
                    <PostRow post={post} reversed={i === 2 || i === 3} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
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
        <p style={{ color: '#fff', fontWeight: 800, marginBottom: '0.6vh' }}>
          Scan Me To Join
        </p>

        <div
          style={{
            padding: 5,
            borderRadius: 16,
            background: 'rgba(255,255,255,0.12)',
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
