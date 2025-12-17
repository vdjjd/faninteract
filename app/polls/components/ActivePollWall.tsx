'use client';

import { useEffect, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { supabase } from '@/lib/supabaseClient';

export default function ActivePollWall({ poll, host }) {
  /* ------------------------------------------------------------- */
  /* 🔧 POLL TITLE CONTROLS                                        */
  /* ------------------------------------------------------------- */
  const TITLE_TOP_VH = 0;
  const TITLE_LEFT_VW = 5;
  const TITLE_WIDTH_VW = 90;
  const TITLE_FONT_VW = 3.2;

  /* ------------------------------------------------------------- */
  /* 🔧 LOGO CONTROLS                                              */
  /* ------------------------------------------------------------- */
  const LOGO_TOP_VH = 10;
  const LOGO_LEFT_VW = 5;
  const LOGO_WIDTH_VW = 12;

  /* ------------------------------------------------------------- */
  /* 🔧 "SCAN TO VOTE" TEXT CONTROLS                              */
  /* ------------------------------------------------------------- */
  const TEXT_TOP_VH = 64;
  const TEXT_LEFT_VW = 1.2;
  const TEXT_WIDTH_VW = 20;
  const TEXT_SIZE_VW = 1.5;
  const TEXT_GLOW = `
    0 0 8px rgba(255,255,255,0.7),
    0 0 16px rgba(255,255,255,0.6)
  `;

  /* ------------------------------------------------------------- */
  /* 🔧 QR CODE CONTROLS                                          */
  /* ------------------------------------------------------------- */
  const QR_TOP_VH = 69;
  const QR_LEFT_VW = 5;
  const QR_SIZE_VW = 12;
  const QR_RADIUS_PX = 25;
  const QR_BG_OPACITY = 0.18;
  const QR_GLOW = `
    0 0 20px rgba(255,255,255,0.8),
    0 0 40px rgba(255,255,255,0.6),
    0 0 60px rgba(255,255,255,0.4)
  `;

  /* ------------------------------------------------------------- */
  /* ❄️ FROSTED GLASS PANEL — FIXED                               */
  /* ------------------------------------------------------------- */
  const GLASS_TOP_VH = 10;
  const GLASS_LEFT_VW = 5;
  const GLASS_WIDTH_VW = 90;
  const GLASS_HEIGHT_VH = 80;

  /* ------------------------------------------------------------- */
  /* 🔧 BAR CONTAINER POSITION                                    */
  /* ------------------------------------------------------------- */
  const BARS_TOP_VH = 10;
  const BARS_LEFT_VW = 17.5;
  const BARS_WIDTH_VW = 77.6;
  const BARS_HEIGHT_VH = 80;

  /* ------------------------------------------------------------- */
  /* ⭐ EXTREME BAR SCALING CONFIG                                */
  /* ------------------------------------------------------------- */
  const CURVE_POWER = 0.35;
  const MAX_BAR_HEIGHT_PCT = 90;
  const MIN_NONZERO_HEIGHT_PCT = 18;

  /* BACKGROUND */
  const [bg, setBg] = useState(
    poll?.background_value ||
      'linear-gradient(to bottom right,#1b2735,#090a0f)'
  );
  const [brightness, setBrightness] = useState(
    poll?.background_brightness ?? 100
  );

  useEffect(() => {
    if (!poll) return;
    const bgValue =
      poll.background_type === 'image'
        ? `url(${poll.background_value}) center/cover no-repeat`
        : poll.background_value ||
          'linear-gradient(to bottom right,#1b2735,#090a0f)';
    setBg(bgValue);
    setBrightness(poll.background_brightness ?? 100);
  }, [poll]);

  /* ------------------------------------------------------------- */
  /* LOAD OPTIONS + VOTES                                         */
  /* ------------------------------------------------------------- */
  const [options, setOptions] = useState<any[]>([]);

  async function loadOptions() {
    if (!poll?.id) return;

    const { data } = await supabase
      .from('poll_options')
      .select('*') // includes bar_color, gradient_start, gradient_end, use_gradient, image_url
      .eq('poll_id', poll.id)
      .order('id', { ascending: true });

    if (data) setOptions(data);
  }

  useEffect(() => {
    loadOptions();
    const interval = setInterval(loadOptions, 1500);
    return () => clearInterval(interval);
  }, [poll?.id]);

  const maxVotesRaw = Math.max(...options.map(o => o.vote_count || 0), 1);
  const maxVotesCurve = Math.pow(maxVotesRaw, CURVE_POWER);

  // MODE: 'standard' vs 'picture'
  const displayMode: 'standard' | 'picture' =
    (poll?.display_mode as 'standard' | 'picture') || 'standard';
  const isPictureMode = displayMode === 'picture';

  /* LOGO URL */
  const displayLogo =
    host?.branding_logo_url ||
    poll?.host?.branding_logo_url ||
    '/faninteractlogo.png';

  /* QR CODE URL */
  const origin =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://faninteract.vercel.app';

  const qrValue = `${origin}/guest/signup?poll=${poll.id}`;

  /* FULLSCREEN HANDLER */
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  /* ------------------------------------------------------------- */
  /* RENDER PAGE                                                   */
  /* ------------------------------------------------------------- */
  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        background: bg,
        filter: `brightness(${brightness}%)`,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Title */}
      <h1
        style={{
          position: 'absolute',
          top: `${TITLE_TOP_VH}vh`,
          left: '50%',
          transform: 'translateX(-50%)',
          width: `${TITLE_WIDTH_VW}vw`,
          color: '#fff',
          fontSize: 'clamp(2.5rem,4vw,5rem)',
          fontWeight: 900,
          margin: 0,
          textAlign: 'center',
          textShadow: `
            2px 2px 2px #000,
            -2px 2px 2px #000,
            2px -2px 2px #000,
            -2px -2px 2px #000
          `,
          zIndex: 50,
        }}
      >
        {poll?.question || 'Poll'}
      </h1>

      {/* ------------------------ LOGO --------------------------- */}
      <div
        style={{
          position: 'absolute',
          top: `${LOGO_TOP_VH}vh`,
          left: `${LOGO_LEFT_VW}vw`,
          width: `${LOGO_WIDTH_VW}vw`,
          opacity: 1,
          filter: 'drop-shadow(0 0 15px rgba(0,0,0,0.8))',
          textAlign: 'center',
          zIndex: 40,
        }}
      >
        <img
          src={displayLogo}
          style={{
            width: '100%',
            height: 'auto',
            objectFit: 'contain',
          }}
        />
      </div>

      {/* ------------------ FROSTED GLASS ------------------------ */}
      <div
        style={{
          position: 'absolute',
          top: `${GLASS_TOP_VH}vh`,
          left: `${GLASS_LEFT_VW}vw`,
          width: `${GLASS_WIDTH_VW}vw`,
          height: `${GLASS_HEIGHT_VH}vh`,
          background: `rgba(255,255,255,0.08)`,
          backdropFilter: 'blur(20px)',
          borderRadius: '24px',
          zIndex: 1,
        }}
      />

      {/* ------------------- BAR / CARD CONTAINER ---------------- */}
      <div
        style={{
          position: 'absolute',
          top: `${BARS_TOP_VH}vh`,
          left: `${BARS_LEFT_VW}vw`,
          width: `${BARS_WIDTH_VW}vw`,
          height: `${BARS_HEIGHT_VH}vh`,
          background: 'rgba(255,255,255,0.00)',
          borderRadius: '20px',
          zIndex: 25,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          padding: '1vh 1vw',
        }}
      >
        {options.length > 0 && (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'grid',
              gridTemplateColumns: `repeat(${options.length}, 1fr)`,
              alignItems: 'end',
              gap: '10px',
            }}
          >
            {options.map((opt, i) => {
              const votes = opt.vote_count || 0;

              let barPct = 0;
              if (votes > 0) {
                const curved = Math.pow(votes, CURVE_POWER);
                barPct = (curved / maxVotesCurve) * MAX_BAR_HEIGHT_PCT;
                if (barPct < MIN_NONZERO_HEIGHT_PCT) {
                  barPct = MIN_NONZERO_HEIGHT_PCT;
                }
              }

              // 🎨 per-option colors used in BOTH modes
              const topColor =
                opt.gradient_start ||
                opt.bar_color ||
                '#1e88e5';
              const bottomColor =
                opt.gradient_end ||
                opt.bar_color ||
                '#1e88e5';

              if (isPictureMode) {
                // ---------------- PICTURE MODE CARD -----------------
                const imageUrl = opt.image_url as string | null;

                return (
                  <div
                    key={i}
                    style={{
                      position: 'relative',
                      width: '100%',
                      height: '100%',
                      borderRadius: '18px',
                      overflow: 'hidden',
                      backgroundImage: imageUrl
                        ? `url(${imageUrl})`
                        : 'linear-gradient(to bottom, #444, #111)',
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      boxShadow: `
                        0 0 18px rgba(0,0,0,0.8),
                        0 0 26px ${bottomColor}66
                      `,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'flex-end',
                    }}
                  >
                    {/* Translucent fill from bottom, tinted by gradient colors (lighter) */}
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        bottom: 0,
                        width: '100%',
                        height: `${barPct}%`,
                        background: `
                          linear-gradient(
                            to top,
                            ${bottomColor}b3,
                            ${topColor}33
                          )
                        `,
                        backdropFilter: 'blur(2px)',
                        WebkitBackdropFilter: 'blur(2px)',
                        transition: 'height 0.6s ease',
                      }}
                    />

                    {/* Header row ~10px from top */}
                    <div
                      style={{
                        position: 'absolute',
                        top: '10px',
                        left: '12px',
                        right: '12px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: '1.1vw',
                        textShadow: '0 0 8px rgba(0,0,0,0.9)',
                        zIndex: 2,
                      }}
                    >
                      <span
                        style={{
                          maxWidth: '70%',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {opt.option_text}
                      </span>
                      <span>{votes}</span>
                    </div>
                  </div>
                );
              }

              // ---------------- STANDARD MODE BAR -------------------
              const barBackground = opt.use_gradient
                ? `linear-gradient(to bottom, ${topColor}, ${bottomColor})`
                : topColor;

              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    height: '100%',
                  }}
                >
                  {/* vote count */}
                  <div
                    style={{
                      color: 'white',
                      fontWeight: '900',
                      fontSize: '1.4vw',
                      marginBottom: '0.4vh',
                      textShadow: '0 0 10px black',
                    }}
                  >
                    {votes}
                  </div>

                  {/* bar */}
                  <div
                    style={{
                      width: '100%',
                      height: `${barPct}%`,
                      background: barBackground,
                      borderRadius: '10px',
                      boxShadow: '0 0 12px rgba(255,255,255,0.9)',
                      transition:
                        'height 0.6s ease, background 0.3s ease',
                    }}
                  />

                  {/* label */}
                  <div
                    style={{
                      marginTop: '0.5vh',
                      color: 'white',
                      fontWeight: '700',
                      fontSize: '1.2vw',
                      textAlign: 'center',
                      textShadow: '0 0 8px black',
                    }}
                  >
                    {opt.option_text}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ------------------- SCAN TO VOTE ------------------------- */}
      <div
        style={{
          position: 'absolute',
          top: `${TEXT_TOP_VH}vh`,
          left: `${TEXT_LEFT_VW}vw`,
          width: `${TEXT_WIDTH_VW}vw`,
          textAlign: 'center',
          color: '#fff',
          fontWeight: 900,
          fontSize: `${TEXT_SIZE_VW}vw`,
          textShadow: TEXT_GLOW,
          zIndex: 30,
        }}
      >
        Scan To Vote
      </div>

      {/* --------------------- QR CODE ---------------------------- */}
      <div
        style={{
          position: 'absolute',
          top: `${QR_TOP_VH}vh`,
          left: `${QR_LEFT_VW}vw`,
          width: `${QR_SIZE_VW}vw`,
          height: `${QR_SIZE_VW}vw`,
          background: `rgba(255,255,255,${QR_BG_OPACITY})`,
          backdropFilter: 'blur(15px)',
          borderRadius: `${QR_RADIUS_PX}px`,
          boxShadow: QR_GLOW,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 20,
        }}
      >
        <QRCodeCanvas
          value={qrValue}
          bgColor="#ffffff"
          fgColor="#000000"
          level="H"
          size={512}
          style={{
            width: '100%',
            height: '100%',
            borderRadius: `${QR_RADIUS_PX}px`,
          }}
        />
      </div>

      {/* --------------------- FULLSCREEN BUTTON ------------------ */}
      <button
        onClick={toggleFullscreen}
        style={{
          position: 'absolute',
          bottom: '2vh',
          right: '2vw',
          width: 48,
          height: 48,
          borderRadius: 10,
          background: 'rgba(255,255,255,0.1)',
          backdropFilter: 'blur(6px)',
          border: '1px solid rgba(255,255,255,0.25)',
          color: '#fff',
          opacity: 0.25,
          cursor: 'pointer',
          transition: '0.25s',
          fontSize: '1.4rem',
          zIndex: 99,
        }}
      >
        ⛶
      </button>
    </div>
  );
}
