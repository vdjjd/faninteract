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
  const LOGO_LEFT_VW = 6;
  const LOGO_WIDTH_VW = 12;

  /* ------------------------------------------------------------- */
  /* 🔧 DURATION TIMER CONTROLS                                   */
  /* ------------------------------------------------------------- */
  const TIMER_TOP_VH = 30;     // between logo & "Scan To Vote"
  const TIMER_LEFT_VW = .5;
  const TIMER_WIDTH_VW = 22.5;
  const TIMER_SIZE_VW = 3.5;

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
      .select('*') // id, bar_color, gradient_start, gradient_end, use_gradient, image_url
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

  /* ------------------------------------------------------------- */
  /* 🥇 WINNER HIGHLIGHT STATE & REALTIME LISTENER                */
  /* ------------------------------------------------------------- */
  const [highlightOptionId, setHighlightOptionId] = useState<string | null>(null);
  const [highlightPhase, setHighlightPhase] = useState(0);

  // Flash loop while winner is highlighted
  useEffect(() => {
    if (!highlightOptionId) return;
    const id = setInterval(() => {
      setHighlightPhase((prev) => (prev + 1) % 2);
    }, 550);
    return () => clearInterval(id);
  }, [highlightOptionId]);

  /* ------------------------------------------------------------- */
  /* ⏱ DURATION TIMER STATE                                       */
  /* ------------------------------------------------------------- */
  const [durationSecondsLeft, setDurationSecondsLeft] = useState<number | null>(
    poll?.duration_minutes ? poll.duration_minutes * 60 : null
  );
  const [autoHighlightDone, setAutoHighlightDone] = useState(false);

  // reset duration when poll/duration changes
  useEffect(() => {
    if (!poll?.duration_minutes) {
      setDurationSecondsLeft(null);
      setAutoHighlightDone(false);
      return;
    }
    setDurationSecondsLeft(poll.duration_minutes * 60);
    setAutoHighlightDone(false);
  }, [poll?.id, poll?.duration_minutes]);

  function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  // 🔥 auto-choose winner when timer hits 0
  async function autoHighlightWinner() {
    if (!poll?.id) return;
    try {
      const { data: opts, error } = await supabase
        .from('poll_options')
        .select('id,vote_count')
        .eq('poll_id', poll.id);

      if (error) {
        console.error('❌ autoHighlightWinner load error:', error);
        return;
      }
      if (!opts || opts.length === 0) return;

      let winner = opts[0];
      for (const o of opts) {
        if ((o.vote_count || 0) > (winner.vote_count || 0)) {
          winner = o;
        }
      }
      if (!winner?.id) return;

      // 👉 Make sure THIS wall shows the winner even if broadcast doesn't loop back
      setHighlightOptionId(winner.id);

      // And still broadcast so other walls/devices hear it
      await supabase.channel(`poll-${poll.id}`).send({
        type: 'broadcast',
        event: 'highlight_winner',
        payload: { option_id: winner.id },
      });

      setAutoHighlightDone(true);
    } catch (err) {
      console.error('❌ autoHighlightWinner error:', err);
    }
  }

  // duration countdown
  useEffect(() => {
    if (!poll?.duration_minutes) return;
    if (poll.status !== 'active') return;
    if (durationSecondsLeft === null) return;

    if (durationSecondsLeft <= 0) {
      if (!autoHighlightDone) autoHighlightWinner();
      return;
    }

    const intervalId = setInterval(() => {
      setDurationSecondsLeft((prev) => {
        if (prev === null) return prev;
        if (prev <= 1) {
          clearInterval(intervalId);
          if (!autoHighlightDone) autoHighlightWinner();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [poll?.status, poll?.duration_minutes, durationSecondsLeft, autoHighlightDone]);

  // Listen for highlight_winner + reset events
  useEffect(() => {
    if (!poll?.id) return;

    const channel = supabase
      .channel(`poll-${poll.id}`)
      .on(
        'broadcast',
        { event: 'highlight_winner' },
        (payload: any) => {
          const optionId = payload?.payload?.option_id ?? null;
          setHighlightOptionId(optionId || null);
        }
      )
      .on(
        'broadcast',
        { event: 'poll_reset' },
        () => {
          setHighlightOptionId(null);
          setHighlightPhase(0);
          setAutoHighlightDone(false);
          if (poll?.duration_minutes) {
            setDurationSecondsLeft(poll.duration_minutes * 60);
          } else {
            setDurationSecondsLeft(null);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [poll?.id, poll?.duration_minutes]);

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

      {/* ------------------- DURATION TIMER ---------------------- */}
      {poll?.duration_minutes && durationSecondsLeft !== null && (
        <div
          style={{
            position: 'absolute',
            top: `${TIMER_TOP_VH}vh`,
            left: `${TIMER_LEFT_VW}vw`,
            width: `${TIMER_WIDTH_VW}vw`,
            textAlign: 'center',
            color: '#fff',
            fontWeight: 900,
            fontSize: `${TIMER_SIZE_VW}vw`,
            textShadow: `
              0 0 10px rgba(0,0,0,0.9),
              0 0 22px rgba(0,0,0,0.85),
              0 0 30px rgba(0,0,0,0.8)
            `,
            zIndex: 35,
          }}
        >
          {formatDuration(durationSecondsLeft)}
        </div>
      )}

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

              const isWinner = !!highlightOptionId && opt.id === highlightOptionId;
              const isDimmed =
                !!highlightOptionId && opt.id !== highlightOptionId;
              const phaseUp = isWinner && highlightPhase === 1;

              // 🎨 Use per-option gradient for both modes
              const topColor =
                opt.gradient_start ||
                opt.bar_color ||
                '#1e88e5';
              const bottomColor =
                opt.gradient_end ||
                opt.bar_color ||
                '#1e88e5';

              /* ====================== PICTURE MODE ====================== */
              if (isPictureMode) {
                const imageUrl = opt.image_url as string | null;

                const cardTransform = isWinner
                  ? phaseUp
                    ? 'translateY(-1.8vh) scale(1.06)'
                    : 'translateY(-1.2vh) scale(1.03)'
                  : 'translateY(0) scale(1)';

                // 🔥 Base glow for every card, using gradient
                const baseCardShadow = `0 0 18px ${topColor}66, 0 0 32px ${bottomColor}44`;

                // Stronger glow on winner
                const cardShadow = isWinner
                  ? phaseUp
                    ? `0 0 40px ${topColor}, 0 0 80px ${bottomColor}`
                    : `0 0 26px ${topColor}, 0 0 54px ${bottomColor}`
                  : baseCardShadow;

                // Translucent overlay rising from bottom, tinted
                const overlayHeight = isWinner ? '0%' : `${barPct}%`;
                const overlayBg = isWinner
                  ? 'transparent'
                  : isDimmed
                  ? `linear-gradient(to top, ${bottomColor}EE, ${topColor}AA)`
                  : `linear-gradient(to top, ${bottomColor}BB, ${topColor}88)`;

                const cardFilter = isDimmed ? 'brightness(0.35)' : 'none';

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
                      boxShadow: cardShadow,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'flex-end',
                      transform: cardTransform,
                      transition:
                        'transform 0.45s ease, box-shadow 0.45s ease, filter 0.4s ease',
                      border: isWinner
                        ? `3px solid ${topColor}`
                        : '1px solid rgba(255,255,255,0.08)',
                      filter: cardFilter,
                    }}
                  >
                    {/* Dim overlay for losers */}
                    {isDimmed && (
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          background: 'rgba(0,0,0,0.45)',
                          pointerEvents: 'none',
                          zIndex: 1,
                        }}
                      />
                    )}

                    {/* Translucent gradient fill from bottom */}
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        bottom: 0,
                        width: '100%',
                        height: overlayHeight,
                        background: overlayBg,
                        backdropFilter: isWinner ? 'none' : 'blur(2px)',
                        transition:
                          'height 0.6s ease, background 0.4s ease, backdrop-filter 0.4s ease',
                        zIndex: 2,
                      }}
                    />

                    {/* Header row */}
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
                        textShadow: isWinner
                          ? `0 0 14px ${topColor}`
                          : '0 0 8px rgba(0,0,0,0.9)',
                        zIndex: 3,
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
                      <span
                        style={{
                          padding: isWinner ? '0.1em 0.6em' : '0.1em 0.4em',
                          borderRadius: '999px',
                          background: isWinner ? topColor : 'rgba(0,0,0,0.65)',
                          color: isWinner ? '#000' : '#fff',
                          boxShadow: isWinner
                            ? phaseUp
                              ? `0 0 24px ${bottomColor}`
                              : `0 0 14px ${topColor}`
                            : 'none',
                          transition:
                            'background 0.3s ease, box-shadow 0.3s ease, color 0.3s ease',
                        }}
                      >
                        {votes}
                      </span>
                    </div>
                  </div>
                );
              }

              /* ====================== STANDARD MODE ====================== */
              const baseBarBackground = opt.use_gradient
                ? `linear-gradient(to bottom, ${topColor}, ${bottomColor})`
                : topColor;

              const barBackground = isDimmed
                ? 'linear-gradient(to bottom, rgba(10,10,10,0.95), rgba(0,0,0,1))'
                : baseBarBackground;

              // 🔥 Base glow for EVERY bar, using its own gradient
              const baseBarShadow = `0 0 16px ${topColor}66, 0 0 28px ${bottomColor}44`;
              const dimBarShadow = '0 0 8px rgba(0,0,0,0.9)';

              // Stronger pulsing glow for the winner
              const winnerBarShadow = phaseUp
                ? `0 0 28px ${topColor}, 0 0 60px ${bottomColor}`
                : `0 0 20px ${topColor}, 0 0 40px ${bottomColor}`;

              const barShadow = isWinner
                ? winnerBarShadow
                : isDimmed
                ? dimBarShadow
                : baseBarShadow;

              const barTransform = isWinner
                ? phaseUp
                  ? 'translateY(-1.6vh) scale(1.06)'
                  : 'translateY(-1.0vh) scale(1.03)'
                : 'translateY(0) scale(1)';

              const labelGlow = isWinner
                ? `0 0 18px ${bottomColor}`
                : '0 0 8px black';

              const labelColor = isDimmed ? 'rgba(200,200,200,0.4)' : 'white';
              const voteColor = isDimmed ? 'rgba(200,200,200,0.4)' : 'white';

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
                      color: voteColor,
                      fontWeight: '900',
                      fontSize: '1.4vw',
                      marginBottom: '0.4vh',
                      textShadow: isWinner
                        ? `0 0 16px ${topColor}`
                        : '0 0 10px black',
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
                      boxShadow: barShadow,
                      transform: barTransform,
                      border: isWinner
                        ? `3px solid ${topColor}`
                        : '1px solid rgba(255,255,255,0.12)',
                      transition:
                        'height 0.6s ease, background 0.3s ease, transform 0.45s ease, box-shadow 0.45s ease, border 0.3s ease',
                    }}
                  />

                  {/* label */}
                  <div
                    style={{
                      marginTop: '0.5vh',
                      color: labelColor,
                      fontWeight: isWinner ? 900 : 700,
                      fontSize: '1.2vw',
                      textAlign: 'center',
                      textShadow: labelGlow,
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
