'use client';

import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeCanvas } from 'qrcode.react';
import { useAdInjector } from '@/hooks/useAdInjector';
import React from 'react';

/* ---------------------------------------------------- */
/*  STYLE CONTROL BLOCK — FULLY TYPED                   */
/* ---------------------------------------------------- */

const STYLE = {
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
  } as React.CSSProperties,

  logo: {
    width: 'clamp(260px,28vw,380px)',
    marginTop: '0vh',
    filter: 'drop-shadow(0 0 14px rgba(0,0,0,0.85))',
  } as React.CSSProperties,

  greyBar: {
    width: '90%',
    height: '14px',
    marginTop: '4vh',
    marginBottom: '2vh',
    marginLeft: '3.5%',
    background: 'linear-gradient(to right, #000, #4444)',
    borderRadius: '6px',
  } as React.CSSProperties,

  nickname: {
    fontSize: 'clamp(3rem,4vw,5rem)',
    fontWeight: 900,
    color: '#fff',
    textTransform: 'uppercase',
    margin: 0,
  } as React.CSSProperties,

  message: {
    fontSize: 'clamp(4rem,1vw,2.4rem)',
    color: '#fff',
    textAlign: 'center',
    maxWidth: '90%',
    marginTop: '1.2vh',
    fontWeight: 600,
  } as React.CSSProperties,

  scanText: {
    color: '#fff',
    fontWeight: 700,
    marginBottom: '0.6vh',
    fontSize: 'clamp(1rem,1.4vw,1.4rem)',
  } as React.CSSProperties,

  qrWrapper: {
    padding: '4px',
    borderRadius: '20px',
    background: 'rgba(255,255,255,0.10)',
    boxShadow:
      '0 0 25px rgba(255,255,255,0.6), 0 0 40px rgba(255,255,255,0.3)',
  } as React.CSSProperties,

  qrContainer: {
    position: 'absolute',
    bottom: '4.9vh',
    left: '4vw',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  } as React.CSSProperties,
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
    initial: { opacity: 0, rotateY: 180 },
    animate: { opacity: 1, rotateY: 0 },
    exit: { opacity: 0, rotateY: -180 },
    transition: { duration: 1, ease: 'easeInOut' },
  },
  'Rotate In / Rotate Out': {
    initial: { opacity: 0, rotate: -90 },
    animate: { opacity: 1, rotate: 0 },
    exit: { opacity: 0, rotate: 90 },
    transition: { duration: 1, ease: 'easeInOut' },
  },
};

const transitionKeys = Object.keys(transitions);
const speedMap: Record<string, number> = {
  Slow: 12000,
  Medium: 8000,
  Fast: 4000,
};

/* ---------------------------------------------------- */
/* COMPONENT — FULL FILE                                */
/* ---------------------------------------------------- */

export default function SingleHighlightWall({ event, posts }) {
  const hostId =
    event?.host_profile_id ||
    event?.host_id ||
    '';

  const { tick } = useAdInjector({ hostId });

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

  useEffect(() => {
    setLivePosts(posts || []);
    setCurrentIndex(0);
  }, [posts]);

  useEffect(() => {
    if (!livePosts.length) return;

    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % livePosts.length);
      tick();

      if (transitionType === 'Random') {
        const nextKey =
          transitionKeys[Math.floor(Math.random() * transitionKeys.length)];
        setRandomTransition(nextKey);
      }
    }, displayDuration);

    return () => clearInterval(interval);
  }, [livePosts.length, displayDuration, transitionType, tick]);

  const effectiveTransition = useMemo(() => {
    if (transitionType === 'Random') {
      return transitions[randomTransition || 'Fade In / Fade Out'];
    }
    return transitions[transitionType] || transitions['Fade In / Fade Out'];
  }, [transitionType, randomTransition]);

  const current = livePosts[currentIndex] || null;

  const origin =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://faninteract.vercel.app';

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
      {/* TITLE */}
      <h1 style={STYLE.title}>{title}</h1>

      {/* MAIN PANEL */}
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
        {/* LEFT IMAGE */}
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
          <AnimatePresence mode="wait">
            {current?.photo_url ? (
              <motion.img
                key={`${current.id}-${currentIndex}`}
                src={current.photo_url}
                {...effectiveTransition}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  borderRadius: 18,
                }}
              />
            ) : (
              <motion.div
                key={`no-photo-${currentIndex}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{
                  color: 'rgba(255,255,255,0.6)',
                  fontSize: '2rem',
                  textAlign: 'center',
                  marginTop: '20%',
                }}
              >
                No Photo
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* RIGHT SIDE */}
        <div
          style={{
            flexGrow: 1,
            marginLeft: '46%',
            paddingTop: '4vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <img src={logo} style={STYLE.logo} />

          <div style={STYLE.greyBar} />

          <p style={STYLE.nickname}>{current?.nickname || 'Guest'}</p>

          <p style={STYLE.message}>
            {current?.message || 'Be the first to post!'}
          </p>
        </div>
      </div>

      {/* QR CODE */}
      <div style={STYLE.qrContainer}>
        <p style={STYLE.scanText}>Scan Me To Join</p>

        <div style={STYLE.qrWrapper}>
          <QRCodeCanvas
            value={`${origin}/guest/signup?wall=${event?.id}`}
            size={160}
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
