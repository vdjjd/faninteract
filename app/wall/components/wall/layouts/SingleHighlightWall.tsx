'use client';

import { QRCodeCanvas } from 'qrcode.react';
import { useEffect, useState, useRef } from 'react';

/* ---------- COUNTDOWN COMPONENT ---------- */
function CountdownDisplay({ countdown, countdownActive }) {
  const [timeLeft, setTimeLeft] = useState(0);
  const [active, setActive] = useState(countdownActive);

  useEffect(() => {
    if (!countdown) return;
    const [numStr] = countdown.split(' ');
    const num = parseInt(numStr);
    const mins = countdown.toLowerCase().includes('minute');
    const secs = countdown.toLowerCase().includes('second');
    const total = mins ? num * 60 : secs ? num : 0;

    setTimeLeft(total);
    setActive(!!countdownActive);
  }, [countdown, countdownActive]);

  useEffect(() => {
    if (!active || timeLeft <= 0) return;
    const timer = setInterval(() => setTimeLeft(t => (t > 1 ? t - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [active, timeLeft]);

  if (!countdown || countdown === 'none') return null;

  const m = Math.floor(timeLeft / 60);
  const s = timeLeft % 60;

  return (
    <div
      style={{
        fontSize: 'clamp(6rem,8vw,9rem)',
        fontWeight: 900,
        color: '#fff',
        textShadow: '0 0 40px rgba(0,0,0,0.7)',
      }}
    >
      {m}:{s.toString().padStart(2, '0')}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 🚀 INACTIVE WALL                                                           */
/* -------------------------------------------------------------------------- */
export default function InactiveWall({ wall }) {
  const [bg, setBg] = useState(
    'linear-gradient(to bottom right,#1b2735,#090a0f)'
  );
  const [brightness, setBrightness] = useState(wall?.background_brightness || 100);

  const [wallState, setWallState] = useState({
    countdown: '',
    countdownActive: false,
    title: '',
  });

  const updateTimeout = useRef(null);

  /* 🌟 Pulse animation */
  const PulseStyle = (
    <style>{`
      @keyframes pulseSoonGlow {
        0%,100% { opacity:.7; text-shadow:0 0 14px rgba(255,255,255,0.3); }
        50% { opacity:1; text-shadow:0 0 22px rgba(180,220,255,0.8); }
      }
      .pulseSoon { animation:pulseSoonGlow 2.5s ease-in-out infinite; }
    `}</style>
  );

  useEffect(() => {
    if (!wall) return;

    setWallState({
      countdown: wall.countdown || '',
      countdownActive: !!wall.countdown_active,
      title: wall.title || '',
    });

    const value =
      wall.background_type === 'image'
        ? `url(${wall.background_value}) center/cover no-repeat`
        : wall.background_value ||
          'linear-gradient(to bottom right,#1b2735,#090a0f)';

    setBg(value);
    setBrightness(wall.background_brightness ?? 100);
  }, [wall]);

  const origin =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://faninteract.vercel.app';

  const qrValue = `${origin}/guest/signup?wall=${wall?.id}`;

  const displayLogo =
    wall?.host?.branding_logo_url?.trim()
      ? wall.host.branding_logo_url
      : '/faninteractlogo.png';

  if (!wall) return <div>Loading Wall…</div>;

  return (
    <div
      style={{
        background: bg,
        filter: `brightness(${brightness}%)`,
        width: '100%',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        overflow: 'hidden',
        position: 'relative',
        paddingTop: '3vh',
      }}
    >
      {PulseStyle}

      {/* Title */}
      <h1
        style={{
          color: '#fff',
          fontSize: 'clamp(2.5rem,4vw,5rem)',
          fontWeight: 900,
          marginBottom: '1vh',
          textShadow: `
            2px 2px 2px #000,
            -2px 2px 2px #000,
            2px -2px 2px #000,
            -2px -2px 2px #000
          `,
        }}
      >
        {wallState.title || 'Fan Zone Wall'}
      </h1>

      {/* Main Panel */}
      <div
        style={{
          width: '90vw',
          height: '78vh',
          maxWidth: '1800px',
          aspectRatio: '16 / 9',
          background: 'rgba(255,255,255,0.08)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 24,
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
        }}
      >
        {/* QR SECTION */}
        <div
          style={{
            position: 'absolute',
            top: '5%',
            left: '3%',
            width: '47%',
            height: '90%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <QRCodeCanvas
            value={qrValue}
            size={1000}
            bgColor="#ffffff"
            fgColor="#000000"
            level="H"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              borderRadius: 18,
            }}
          />
        </div>

        {/* TEXT + LOGO SIDE */}
        <div
          style={{
            position: 'relative',
            flexGrow: 1,
            marginLeft: '44%',
          }}
        >
          {/* LOGO */}
          <div
            style={{
              position: 'absolute',
              top: '2%',
              left: '53%',
              transform: 'translateX(-50%)',
              width: 'clamp(300px,27vw,400px)',
              height: 'clamp(300px,12vw,260px)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              overflow: 'hidden',
            }}
          >
            <img
              src={displayLogo}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                filter: 'drop-shadow(0 0 12px rgba(0,0,0,0.6))',
              }}
            />
          </div>

          {/* Divider */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '53%',
              transform: 'translateX(-50%)',
              width: '75%',
              height: '1.4vh',
              borderRadius: 6,
              background: 'linear-gradient(to right,#000,#444)',
            }}
          />

          {/* Fan Zone Wall — FIXED */}
          <p
            style={{
              position: 'absolute',
              top: '56%',
              left: '53%',
              transform: 'translateX(-50%)',
              color: '#fff',
              fontSize: 'clamp(2.2rem, 3vw, 5rem)',
              fontWeight: 900,
              textAlign: 'center',
              whiteSpace: 'nowrap',
              textShadow: '0 0 14px rgba(0,0,0,0.6)',
            }}
          >
            Fan Zone Wall
          </p>

          {/* Starting Soon */}
          <p
            className="pulseSoon"
            style={{
              position: 'absolute',
              top: '69%',
              left: '53%',
              transform: 'translateX(-50%)',
              color: '#bcd9ff',
              fontWeight: 700,
              margin: 0,
              whiteSpace: 'nowrap',
              fontSize: 'clamp(1.8rem, 3vw, 3.2rem)',
              textShadow: `
                2px 2px 2px #000,
                -2px 2px 2px #000,
                2px -2px 2px #000,
                -2px -2px 2px #000
              `,
            }}
          >
            Starting Soon!!
          </p>

          {/* Countdown */}
          <div
            style={{
              position: 'absolute',
              top: '73%',
              left: '53%',
              transform: 'translateX(-50%)',
            }}
          >
            <CountdownDisplay
              countdown={wallState.countdown}
              countdownActive={wallState.countdownActive}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

