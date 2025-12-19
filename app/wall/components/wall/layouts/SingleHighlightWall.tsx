'use client';

import { useEffect, useState } from 'react';
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

  message: {
    fontSize: 'clamp(4rem,1vw,2.4rem)',
    color: '#fff',
    textAlign: 'center',
    maxWidth: '90%',
    marginTop: '2vh',
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
/*      BADGE + VISIT CONTROL                            */
/* ---------------------------------------------------- */

const BADGE_CTRL = {
  badge: {
    bottom: '0vh',
    right: '48vw',
    size: 150, // 👈 container size (authoritative)
  },
  visits: {
    bottom: '10.5vh',
    right: '44vw',
  },
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

  const brightness = event?.background_brightness ?? 100;

  useEffect(() => {
    setLivePosts(posts || []);
    setCurrentIndex(0);
  }, [posts]);

  useEffect(() => {
    if (!livePosts.length) return;

    const interval = setInterval(() => {
      if (pauseFlag.current) return;
      tickSubmissionDisplayed();
      setCurrentIndex(i => (i + 1) % livePosts.length);
    }, 8000);

    return () => clearInterval(interval);
  }, [livePosts.length, pauseFlag, tickSubmissionDisplayed]);

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
          <AnimatePresence mode="wait">
            <motion.img
              key={`${current?.id || 'blank'}-${currentIndex}`}
              src={current?.photo_url || '/fallback.png'}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8 }}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                borderRadius: 18,
              }}
            />
          </AnimatePresence>
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
            position: 'relative',
          }}
        >
          <div
            style={{
              width: 'clamp(400px,28vw,380px)',
              height: 'clamp(180px,18vw,260px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
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

          <p style={STYLE.nickname}>{current?.nickname || 'Guest'}</p>
          <p style={STYLE.message}>{current?.message || ''}</p>
        </div>
      </div>

      {/* QR */}
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

      {/* BADGE (container authoritative) */}
      {current?.badge_icon_url && (
        <div
          style={{
            position: 'absolute',
            bottom: BADGE_CTRL.badge.bottom,
            right: BADGE_CTRL.badge.right,
            width: BADGE_CTRL.badge.size,
            height: BADGE_CTRL.badge.size,
            zIndex: 20,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <img
            src={current.badge_icon_url}
            alt="Badge"
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain', // 👈 image fits container
              filter: 'drop-shadow(0 0 10px rgba(0,0,0,0.8))',
            }}
          />
        </div>
      )}

      {/* VISIT COUNT */}
      {typeof current?.visit_count === 'number' && (
        <div
          style={{
            position: 'absolute',
            bottom: BADGE_CTRL.visits.bottom,
            right: BADGE_CTRL.visits.right,
            zIndex: 21,
            padding: '6px 14px',
            borderRadius: '999px',
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(6px)',
            color: '#fff',
            fontWeight: 800,
            fontSize: '1.1rem',
            textShadow: '1px 1px 2px #000',
            pointerEvents: 'none',
            boxShadow: '0 0 10px rgba(0,0,0,0.6)',
          }}
        >
          Visit #{current.visit_count}
        </div>
      )}
    </div>
  );
}
