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

  /* 🔽 NEW: space reserved for badge + visit overlays */
  messageSpacer: {
    height: 'clamp(90px, 9vh, 150px)',
  },

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

  badgeImage: {
    width: 'clamp(135px, 7vw, 110px)',
    height: 'clamp(65px, 8vw, 115px)',
    borderRadius: '999px',
    objectFit: 'cover',
    filter: 'drop-shadow(0 0 12px rgba(0,0,0,0.65))',
  },

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
    fontSize: 'clamp(2.4rem, 3vw, 4rem)',
    color: '#fff',
    textAlign: 'center',
    maxWidth: '90%',
    marginTop: '0',
    fontWeight: 600,
    textShadow: `
      2px 2px 2px #000,
      -2px 2px 2px #000,
      2px -2px 2px #000,
      -2px -2px 2px #000
    `,
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
};

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

  const title = event?.title || 'Fan Zone Wall';

  const logo =
    event?.host?.branding_logo_url?.trim()
      ? event.host.branding_logo_url
      : '/faninteractlogo.png';

  const bg =
    event?.background_type === 'image'
      ? `url(${event.background_value}) center/cover no-repeat`
      : event?.background_value || 'linear-gradient(135deg,#1b2735,#090a0f)';

  const displayDuration = speedMap[event?.transition_speed || 'Medium'];

  const BADGE_POSITION = { top: '55.5%', left: '20%' };
  const VISIT_POSITION = { top: '64.5%', left: '20%' };

  useEffect(() => {
    setLivePosts(posts || []);
    setCurrentIndex(0);
  }, [posts]);

  useEffect(() => {
    if (!livePosts.length) return;

    const interval = setInterval(() => {
      if (!pauseFlag.current) {
        tickSubmissionDisplayed();
        setCurrentIndex(prev => (prev + 1) % livePosts.length);
      }
    }, displayDuration);

    return () => clearInterval(interval);
  }, [livePosts.length, displayDuration, pauseFlag, tickSubmissionDisplayed]);

  const current = livePosts[currentIndex] || null;

  const origin =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://faninteract.vercel.app';

  return (
    <div style={{ width: '100vw', height: '100vh', background: bg, position: 'relative' }}>
      <h1 style={STYLE.title}>{title}</h1>

      <div style={{ display: 'flex', height: '83vh' }}>
        <div style={{ width: '46%' }}>
          <AnimatePresence mode="wait">
            <motion.img
              key={current?.id}
              src={current?.photo_url}
              {...transitions['Fade In / Fade Out']}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </AnimatePresence>
        </div>

        <div style={{ flex: 1, position: 'relative', textAlign: 'center' }}>
          <img src={logo} style={{ width: '60%', margin: '0 auto' }} />
          <div style={STYLE.greyBar} />

          <p style={STYLE.nickname}>{current?.nickname}</p>

          {/* overlays */}
          {current?.visit_count && (
            <div style={{ ...STYLE.visitWrapper, ...VISIT_POSITION }}>
              <span style={STYLE.visitText}>Visit #{current.visit_count}</span>
            </div>
          )}

          {current?.badge_icon_url && (
            <div style={{ ...STYLE.badgeWrapper, ...BADGE_POSITION }}>
              <img src={current.badge_icon_url} style={STYLE.badgeImage} />
            </div>
          )}

          {/* 🔽 RESERVED SPACE */}
          <div style={STYLE.messageSpacer} />

          <p style={STYLE.message}>{current?.message}</p>
        </div>
      </div>

      <div style={STYLE.qrContainer}>
        <p style={STYLE.scanText}>Scan Me To Join</p>
        <div style={STYLE.qrWrapper}>
          <QRCodeCanvas value={`${origin}/guest/signup?wall=${event?.id}`} size={210} />
        </div>
      </div>
    </div>
  );
}
