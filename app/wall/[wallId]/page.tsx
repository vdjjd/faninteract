'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';

import { useWallData } from '@/app/wall/hooks/useWallData';
import { useAdOverlayer } from '@/app/wall/hooks/useAdOverlayer';

import AdOverlay from '@/app/wall/components/wall/AdOverlay';

import InactiveWall from '@/app/wall/components/wall/layouts/InactiveWall';
import SingleHighlightWall from '@/app/wall/components/wall/layouts/SingleHighlightWall';
import Grid2x2Wall from '@/app/wall/components/wall/layouts/Grid2x2Wall';

import { cn } from '../../../lib/utils';

export default function FanWallPage() {
  const { wallId } = useParams();
  const wallUUID = Array.isArray(wallId) ? wallId[0] : wallId;

  const wallRef = useRef<HTMLDivElement | null>(null); // 🔥 For fullscreen container

  const { wall, posts, loading, showLive } = useWallData(wallUUID);

  const {
    ads,
    showAd,
    currentAd,
    tickSubmissionDisplayed,
    pauseFlag,
    adTransition
  } = useAdOverlayer(wall?.host_id);

  const [bg, setBg] = useState('');
  const [layoutKey, setLayoutKey] = useState(0);
  const prevLayout = useRef<string | null>(null);

  useEffect(() => {
    if (!wall) return;

    const value =
      wall.background_type === 'image'
        ? `url(${wall.background_value}) center/cover no-repeat`
        : wall.background_value;

    setBg(value || 'linear-gradient(to bottom right,#1b2735,#090a0f)');
  }, [wall?.background_type, wall?.background_value]);

  useEffect(() => {
    if (!wall) return;

    if (wall.layout_type !== prevLayout.current) {
      prevLayout.current = wall.layout_type;
      setLayoutKey(k => k + 1);
    }
  }, [wall?.layout_type]);

  const renderActiveWall = () => {
    if (!wall) return null;

    const props = {
      event: wall,
      posts,
      tickSubmissionDisplayed,
      pauseFlag
    };

    switch (wall.layout_type) {
      case 'grid2x2':
        return <Grid2x2Wall key={layoutKey} {...props} />;
      default:
        return <SingleHighlightWall key={layoutKey} {...props} />;
    }
  };

  if (loading)
    return <p className={cn('text-white mt-10 text-center')}>Loading…</p>;

  if (!wall)
    return <p className={cn('text-white mt-10 text-center')}>Wall not found.</p>;

  /* -------------------------------------------------- */
  /* 🔥 FIXED FULLSCREEN HANDLER                        */
  /* -------------------------------------------------- */
  const toggleFullscreen = async () => {
    const el = wallRef.current;

    if (!el) return console.warn("Fullscreen element missing");

    try {
      if (!document.fullscreenElement) {
        console.log("🔵 Requesting fullscreen on element:", el);

        await el.requestFullscreen({ navigationUI: "hide" }).catch(err => {
          console.error("❌ Fullscreen failed:", err);
        });

      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error("🔥 Fullscreen error:", err);
    }
  };

  return (
    <div
      ref={wallRef}  // 🔥 fullscreen now targets THIS container
      style={{
        position: 'relative',
        width: '100%',
        height: '100vh',
        background: bg,
        transition: 'background 0.6s ease',
        overflow: 'hidden',
      }}
    >
      {/* INACTIVE WALL */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: showLive ? 0 : 1,
          transition: 'opacity 0.6s ease',
          zIndex: 1,
        }}
      >
        <InactiveWall wall={wall} />
      </div>

      {/* ACTIVE WALL */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: showLive ? 1 : 0,
          transition: 'opacity 0.6s ease',
          zIndex: 2,
        }}
      >
        {renderActiveWall()}
      </div>

      {/* AD OVERLAY */}
      <AdOverlay
        showAd={showAd}
        currentAd={currentAd}
        adTransition={adTransition}
      />

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
          opacity: 0.35,
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
