'use client';

import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeCanvas } from 'qrcode.react';
import React from 'react';

/* ---------------------------------------------------- */
/*  STYLE CONTROL BLOCK                                  */
/* ---------------------------------------------------- */

const STYLE: Record<string, React.CSSProperties> = {
  title: {
    color: '#fff',
    marginTop: '-9vh',
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
  },

  greyBar: {
    width: '90%',
    height: '14px',
    marginTop: '2vh',
    marginBottom: '2vh',
    marginLeft: '3.5%',
    background: 'linear-gradient(to right, #000, #4444)',
    borderRadius: '6px',
  },

  nickname: {
    fontSize: 'clamp(3rem,4vw,5rem)',
    fontWeight: 900,
    color: '#fff',
    textTransform: 'uppercase',
    margin: 0,
    textShadow: `
      2px 2px 2px #000,
      -2px 2px 2px #000,
      2px -2px 2px #000,
      -2px -2px 2px #000
    `,
  },

  /* Independent overlay wrappers (positioned inside Right Panel) */
  badgeWrapper: {
    position: 'absolute',
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none',
  },

  visitWrapper: {
    position: 'absolute',
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none',
  },

  /* Badge that scales like the logo using clamp() */
  /* ✅ CHANGED: fixed 210x210 to match QR size */
  badgeImage: {
    width: '210px',
    height: '210px',
    borderRadius: '999px',
    objectFit: 'cover',
    filter: 'drop-shadow(0 0 14px rgba(0,0,0,0.8))',
  },

  /* Visit count text that scales like the logo */
  visitText: {
    color: '#fff',
    fontWeight: 900,
    fontSize: 'clamp(1rem, 0vw, 2.2rem)',
    textShadow: `
      2px 2px 2px #000,
      -2px 2px 2px #000,
      2px -2px 2px #000,
      -2px -2px 2px #000
    `,
    whiteSpace: 'nowrap',
  },

  message: {
    fontSize: 'clamp(4rem,1vw,2.4rem)',
    color: '#fff',
    textAlign: 'center',
    maxWidth: '90%',
    marginTop: '2.0vh',
    fontWeight: 600,
    textShadow: `
      2px 2px 2px #000,
      -2px 2px 2px #000,
      2px -2px 2px #000,
      -2px -2px 2px #000
    `,
  },

  /* ✅ ADDED: optional spacer you already use to control message row */
  messageSpacer: {
    height: '10vh',
  },

  scanText: {
    color: '#fff',
    fontWeight: 700,
    marginBottom: '0.6vh',
    fontSize: 'clamp(1rem,1.4vw,1.4rem)',
  },

  qrWrapper: {
    padding: '4px',
    borderRadius: '20px',
    background: 'rgba(255,255,255,0.10)',
    boxShadow: '0 0 25px rgba(255,255,255,0.6), 0 0 40px rgba(255,255,255,0.3)',
  },

  qrContainer: {
    position: 'absolute',
    bottom: '4vh',
    left: '2vw',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
};

/* ---------------------------------------------------- */
/* TRANSITIONS                                           */
/* ---------------------------------------------------- */

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

  Flip: {
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

const speedMap: Record<string, number> = {
  Slow: 12000,
  Medium: 8000,
  Fast: 4000,
};

/* ---------------------------------------------------- */
/*      SingleHighlightWall                              */
/* ---------------------------------------------------- */

export default function SingleHighlightWall({
  event,
  posts,
  tickSubmissionDisplayed,
  pauseFlag,
}: any) {
  const [livePosts, setLivePosts] = useState(posts || []);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [randomTransition, setRandomTransition] = useState<string | null>(null);

  const title = event?.title || 'Fan Zone Wall';

  const logo =
    event?.host?.branding_logo_url?.trim()
      ? event.host.branding_logo_url
      : '/faninteractlogo.png';

  const bg =
    event?.background_type === 'image'
      ? `url(${event.background_value}) center/cover no-repeat`
      : event?.background_value || 'linear-gradient(135deg,#1b2735,#090a0f)';

  const brightness = event?.background_brightness ?? 100;
  const transitionType = event?.post_transition || 'Fade In / Fade Out';
  const displayDuration = speedMap[event?.transition_speed || 'Medium'];

  /* ✅ ADDED: MANUAL NUDGES */
  const BADGE_OFFSET = { x: 0, y: 0 };     // px: +x pushes left, +y pushes UP (because we use bottom/right)
  const MESSAGE_OFFSET = { y: 0 };         // px: negative moves UP, positive moves DOWN

  /* 🧭 MANUAL POSITION CONTROLS (edit these to move them) */
  // percentages are relative to the Right Panel (which is position: relative)
  const BADGE_POSITION = {
    top: '55.5%',  // roughly aligned with name row
    left: '20%', // right side of the name
  };

  const VISIT_POSITION = {
    top: '64.5%',  // slightly below name row
    left: '20%', // left side of the name
  };

  /* Reset posts when list changes */
  useEffect(() => {
    setLivePosts(posts || []);
    setCurrentIndex(0);
  }, [posts]);

  /* Automatic rotation engine */
  useEffect(() => {
    if (!livePosts.length) return;

    const cycle = () => {
      if (pauseFlag.current) return;

      tickSubmissionDisplayed();
      setCurrentIndex(prev => (prev + 1) % livePosts.length);

      if (transitionType === 'Random') {
        const idx = Math.floor(Math.random() * transitionKeys.length);
        setRandomTransition(transitionKeys[idx]);
      }
    };

    const interval = setInterval(cycle, displayDuration);
    return () => clearInterval(interval);
  }, [livePosts.length, displayDuration, transitionType, pauseFlag, tickSubmissionDisplayed]);

  const effectiveTransition = useMemo(() => {
    if (transitionType === 'Random')
      return transitions[randomTransition || 'Fade In / Fade Out'];

    return transitions[transitionType] || transitions['Fade In / Fade Out'];
  }, [transitionType, randomTransition]);

  const current = livePosts[currentIndex] || null;

  const origin =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://faninteract.vercel.app';

  /* ---------------------------------------------------- */
  /* RENDER                                               */
  /* ---------------------------------------------------- */
  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: bg,
        filter: `brightness(${brightness}%)`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <h1 style={STYLE.title}>{title}</h1>

      <div
        style={{
          width: 'min(92vw,1800px)',
          height: 'min(83vh,950px)',
          background: 'rgba(255,255,255,0.08)',
          backdropFilter: 'blur(20px)',
          borderRadius: 24,
          border: '1px solid rgba(255,255,255,0.15)',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
        }}
      >
        {/* Left Photo */}
        <div
          style={{
            position: 'absolute',
            top: '4%',
            left: '2%',
            width: '46%',
            height: '92%',
            borderRadius: 18,
            overflow: 'hidden',
          }}
        >
          {/* ✅ ADDED: relative wrapper so badge can anchor inside photo */}
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <AnimatePresence mode="wait">
              <motion.img
                key={`${current?.id || 'blank'}-${currentIndex}`}
                src={current?.photo_url || '/fallback.png'}
                {...effectiveTransition}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  borderRadius: 18,
                }}
              />
            </AnimatePresence>

            {/* ✅ MOVED: Badge is now LOWER-RIGHT of the PHOTO box, with manual offsets */}
            {current?.badge_icon_url && (
              <div
                style={{
                  position: 'absolute',
                  bottom: `calc(18px + ${BADGE_OFFSET.y}px)`,
                  right: `calc(18px + ${BADGE_OFFSET.x}px)`,
                  pointerEvents: 'none',
                }}
              >
                <img
                  src={current.badge_icon_url}
                  alt="Loyalty Badge"
                  style={STYLE.badgeImage}
                />
              </div>
            )}
          </div>
        </div>

        {/* Right Panel */}
        <div
          style={{
            flexGrow: 1,
            marginLeft: '46%',
            paddingTop: '4vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            position: 'relative', // needed for absolute badge/visit positioning
          }}
        >
          {/* Logo */}
          <div
            style={{
              width: 'clamp(400px,28vw,380px)',
              height: 'clamp(180px,18vw,260px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 12,
              background: 'transparent',
              overflow: 'hidden',
              padding: '6px',
            }}
          >
            <img
              src={logo}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                filter: 'drop-shadow(0 0 14px rgba(0,0,0,0.85))',
              }}
            />
          </div>

          <div style={STYLE.greyBar} />

          {/* Name stays in normal flow */}
          <p style={STYLE.nickname}>{current?.nickname || 'Guest'}</p>

          {/* ✅ Keep your spacer (you can tune height in STYLE.messageSpacer) */}
          <div style={STYLE.messageSpacer} />

          {/* Independent Visit Count (left of name area) */}
          {current?.visit_count != null && (
            <div
              style={{
                ...STYLE.visitWrapper,
                top: VISIT_POSITION.top,
                left: VISIT_POSITION.left,
              }}
            >
              <span style={STYLE.visitText}>
                Visit #{current.visit_count}
              </span>
            </div>
          )}

          {/* ❌ REMOVED FROM HERE: old badge block so it does NOT duplicate */}

          {/* Message */}
          <p
            style={{
              ...STYLE.message,
              transform: `translateY(${MESSAGE_OFFSET.y}px)`,
            }}
          >
            {current?.message || 'Be the first to post!'}
          </p>
        </div>
      </div>

      {/* QR Code */}
      <div style={STYLE.qrContainer}>
        <p style={STYLE.scanText}>Scan Me To Join</p>

        <div style={STYLE.qrWrapper}>
          <QRCodeCanvas
            value={`${origin}/guest/signup?wall=${event?.id}`}
            size={210}
            level="H"
            bgColor="#fff"
            fgColor="#000"
            style={{ borderRadius: 12 }}
          />
        </div>
      </div>
    </div>
  );
}
