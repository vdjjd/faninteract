'use client';

import { useState, useEffect, useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { supabase } from '@/lib/supabaseClient';

/* ---------- COUNTDOWN DISPLAY ---------- */
function CountdownDisplay({ countdown, countdownActive, onEnd }) {
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    if (!countdown || countdown === 'none') return;

    const lower = countdown.toLowerCase();
    const num = parseInt(countdown.split(' ')[0]) || 0;
    const seconds = lower.includes('sec') ? num : lower.includes('min') ? num * 60 : 0;

    setTimeLeft(seconds);
  }, [countdown]);

  useEffect(() => {
    if (!countdownActive) return;
    if (timeLeft <= 0) return;

    const t = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(t);
          onEnd?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(t);
  }, [countdownActive, timeLeft]);

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
/* 🎨 INACTIVE POLL WALL — MATCHES FAN WALL EXACTLY                           */
/* -------------------------------------------------------------------------- */
export default function InactivePollWall({ poll, host }) {
  const [bg, setBg] = useState('linear-gradient(to bottom right,#1b2735,#090a0f)');
  const [brightness, setBrightness] = useState(100);

  const PulseStyle = (
    <style>{`
      @keyframes pulseSoonGlow {
        0%,100% { opacity:.7; text-shadow:0 0 14px rgba(255,255,255,0.3); }
        50% { opacity:1; text-shadow:0 0 22px rgba(180,220,255,0.8); }
      }
      .pulseSoon { animation:pulseSoonGlow 2.5s ease-in-out infinite; }
    `}</style>
  );

  async function handleCountdownEnd() {
    if (!poll?.id) return;

    await supabase
      .from('polls')
      .update({ status: 'active', countdown_active: false, countdown: 'none' })
      .eq('id', poll.id);

    await supabase.channel(`poll-${poll.id}`).send({
      type: 'broadcast',
      event: 'poll_status',
      payload: { id: poll.id, status: 'active', countdown_active: false },
    });
  }

  useEffect(() => {
    if (!poll) return;

    const value =
      poll.background_type === 'image'
        ? `url(${poll.background_value}) center/cover no-repeat`
        : poll.background_value || 'linear-gradient(to bottom right,#1b2735,#090a0f)';

    setBg(value);
    setBrightness(poll.background_brightness ?? 100);
  }, [poll]);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const qrValue = `${origin}/guest/signup?poll=${poll.id}`;



  const displayLogo =
    host?.branding_logo_url?.trim()
      ? host.branding_logo_url
      : '/faninteractlogo.png';

  if (!poll) return null;

  /* ---------------------------------------------------------------------- */
  /* RENDER                                                                  */
  /* ---------------------------------------------------------------------- */
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

      {/* TITLE */}
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
        {poll.question || 'Upcoming Poll'}
      </h1>

      {/* MAIN PANEL (Copied exactly from Wall) */}
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

        {/* LEFT QR SIDE */}
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

        {/* RIGHT SIDE CONTENT */}
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

          {/* DIVIDER BAR */}
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

          {/* TEXT “Fan Polling” */}
          <p
            style={{
              position: 'absolute',
              top: '56%',
              left: '53%',
              transform: 'translateX(-50%)',
              color: '#fff',
              fontSize: 'clamp(2em,3.5vw,6rem)',
              fontWeight: 900,
              textAlign: 'center',
              textShadow: '0 0 14px rgba(0,0,0,0.6)',
            }}
          >
            Fan Polling
          </p>

          {/* “Starting Soon!!” */}
          <p
            className="pulseSoon"
            style={{
              position: 'absolute',
              top: '67%',
              left: '53%',
              transform: 'translateX(-50%)',
              color: '#bcd9ff',
              fontWeight: 700,
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

          {/* COUNTDOWN */}
          <div
            style={{
              position: 'absolute',
              top: '73%',
              left: '53%',
              transform: 'translateX(-50%)',
            }}
          >
            <CountdownDisplay
              countdown={poll.countdown}
              countdownActive={poll.countdown_active}
              onEnd={handleCountdownEnd}
            />
          </div>
        </div>
      </div>

      {/* FULLSCREEN BUTTON */}
      <button
        onClick={() => {
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
          } else {
            document.exitFullscreen().catch(() => {});
          }
        }}
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

