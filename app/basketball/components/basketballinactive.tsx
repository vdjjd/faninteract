'use client';

import { QRCodeCanvas } from 'qrcode.react';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient'; // ✅ CORRECT PATH

/* -------------------------------------------------- */
/* TYPES                                              */
/* -------------------------------------------------- */

interface GameHost {
  branding_logo_url?: string | null;
  logo_url?: string | null;
}

interface GameType {
  id: number;
  title?: string;
  countdown: string | null;
  countdown_active: boolean | null;
  background_type?: string | null;
  background_value?: string | null;
  background_brightness?: number | null;
  host?: GameHost | null;
}

interface CountdownProps {
  countdown: string;
  countdownActive: boolean;
  gameId: number;
}

/* -------------------------------------------------- */
/* COUNTDOWN COMPONENT                                */
/* -------------------------------------------------- */
function CountdownDisplay({
  countdown,
  countdownActive,
  gameId,
}: CountdownProps) {
  const [timeLeft, setTimeLeft] = useState(0);
  const [active, setActive] = useState(countdownActive);

  /* Parse countdown string → seconds */
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

  /* Tick every second */
  useEffect(() => {
    if (!active || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((t) => (t > 1 ? t - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [active, timeLeft]);

  /* When time hits zero → start the game */
  useEffect(() => {
    if (timeLeft === 0 && active) {
      setActive(false);

      (async () => {
        await supabase
          .from('bb_games')
          .update({
            countdown_active: false,
            countdown: 'none',
            status: 'running',
            started_at: new Date().toISOString(),
          })
          .eq('id', gameId);
      })();
    }
  }, [timeLeft, active, gameId]);

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

/* -------------------------------------------------- */
/* INACTIVE BASKETBALL PAGE                           */
/* -------------------------------------------------- */
interface InactiveBasketballProps {
  game: GameType;
}

export default function InactiveBasketballPage({
  game,
}: InactiveBasketballProps) {
  const updateTimeout = useRef<NodeJS.Timeout | null>(null);

  /* Background */
  const [bg, setBg] = useState(
    'linear-gradient(to bottom right,#1b2735,#090a0f)'
  );
  const [brightness, setBrightness] = useState(
    game?.background_brightness ?? 100
  );

  const [wallState, setWallState] = useState({
    countdown: '',
    countdownActive: false,
  });

  /* Glow animation */
  const PulseStyle = (
    <style>{`
      @keyframes pulseSoonGlow {
        0%,100% { opacity:.7; text-shadow:0 0 14px rgba(255,255,255,0.3); }
        50% { opacity:1; text-shadow:0 0 22px rgba(180,220,255,0.8); }
      }
      .pulseSoon { animation:pulseSoonGlow 2.5s ease-in-out infinite; }
    `}</style>
  );

  /* INIT */
  useEffect(() => {
    if (!game) return;

    setWallState({
      countdown: game.countdown || '',
      countdownActive: !!game.countdown_active,
    });

    const val =
      game.background_type === 'image'
        ? `url(${game.background_value}) center/cover no-repeat`
        : game.background_value ||
          'linear-gradient(to bottom right,#1b2735,#090a0f)';

    setBg(val);
    setBrightness(game.background_brightness ?? 100);
  }, [game]);

  /* POLLING */
  useEffect(() => {
    if (!game?.id) return;

    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('bb_games')
        .select('*, host:hosts(*)')
        .eq('id', game.id)
        .single();

      if (!data) return;

      if (updateTimeout.current) clearTimeout(updateTimeout.current);

      updateTimeout.current = setTimeout(() => {
        setWallState({
          countdown: data.countdown,
          countdownActive: !!data.countdown_active,
        });

        const val =
          data.background_type === 'image'
            ? `url(${data.background_value}) center/cover no-repeat`
            : data.background_value;

        setBg(val);
        setBrightness(data.background_brightness ?? 100);
      }, 60);
    }, 2000);

    return () => clearInterval(interval);
  }, [game?.id]);

  /* QR CODE */
  const origin =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://faninteract.vercel.app';

  const qrValue = `${origin}/guest/signup?basketball=${game.id}`;

  /* LOGO */
  const displayLogo =
    game?.host?.branding_logo_url?.trim()
      ? game.host.branding_logo_url
      : game?.host?.logo_url?.trim()
      ? game.host.logo_url
      : '/faninteractlogo.png';

  /* FULLSCREEN */
  const toggleFullscreen = () =>
    !document.fullscreenElement
      ? document.documentElement.requestFullscreen().catch(() => {})
      : document.exitFullscreen();

  /* LOGO position */
  const logoContainerStyle: React.CSSProperties = {
    position: 'absolute',
    top: '2%',
    left: '53%',
    transform: 'translateX(-50%)',
    width: 'clamp(300px,27vw,400px)',
    height: 'clamp(300px,12vw,260px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    background: 'transparent',
  };

  if (!game) return <div>Loading Basketball Battle…</div>;

  /* -------------------------------------------------- */
  /* RENDER                                             */
  /* -------------------------------------------------- */
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
          textShadow: `
            2px 2px 2px #000,
            -2px 2px 2px #000,
            2px -2px 2px #000,
            -2px -2px 2px #000
          `,
          marginBottom: '1vh',
        }}
      >
        {game?.title || 'Basketball Battle'}
      </h1>

      {/* MAIN PANEL */}
      <div
        style={{
          width: '90vw',
          height: '78vh',
          maxWidth: '1800px',
          aspectRatio: '16/9',
          background: 'rgba(255,255,255,0.08)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 24,
          position: 'relative',
          display: 'flex',
          overflow: 'hidden',
        }}
      >
        {/* LEFT SIDE QR */}
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
            bgColor="#fff"
            fgColor="#000"
            level="H"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              borderRadius: 18,
            }}
          />
        </div>

        {/* RIGHT SIDE */}
        <div
          style={{ position: 'relative', flexGrow: 1, marginLeft: '44%' }}
        >
          {/* LOGO */}
          <div style={logoContainerStyle}>
            <img
              src={displayLogo || '/faninteractlogo.png'}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                filter: 'drop-shadow(0 0 12px rgba(0,0,0,0.6))',
              }}
            />
          </div>

          {/* DIVIDER */}
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

          {/* SUBTITLE */}
          <p
            style={{
              position: 'absolute',
              top: '56%',
              left: '53%',
              transform: 'translateX(-50%)',
              color: '#fff',
              fontSize: 'clamp(2em,3.5vw,6rem)',
              fontWeight: 900,
              margin: 0,
              whiteSpace: 'nowrap',
              textShadow: `
                2px 2px 2px #000,
                -2px 2px 2px #000,
                2px -2px 2px #000,
                -2px -2px 2px #000
              `,
            }}
          >
            Basketball Battle
          </p>

          {/* STATUS */}
          <p
            className="pulseSoon"
            style={{
              position: 'absolute',
              top: '67%',
              left: '53%',
              transform: 'translateX(-50%)',
              color: '#bcd9ff',
              fontWeight: 700,
              margin: 0,
              whiteSpace: 'nowrap',
              fontSize: 'clamp(1.6rem,2.5vw,3.2rem)',
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

          {/* COUNTDOWN CLOCK */}
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
              gameId={game.id}
            />
          </div>
        </div>
      </div>

      {/* FULLSCREEN BUTTON */}
      <div
        onClick={toggleFullscreen}
        style={{
          position: 'absolute',
          bottom: '2vh',
          right: '2vw',
          width: 40,
          height: 40,
          borderRadius: 12,
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          opacity: 0.2,
          transition: 'opacity 0.2s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.3')}
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
