'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface DashboardHeaderProps {
  onCreateFanWall: () => void;
  onCreatePoll: () => void;
  onCreatePrizeWheel: () => void;
  onOpenAds: () => void;
  onCreateTriviaGame: () => void;
  onCreateNewAd: () => void;
  onCreateSlideShow: () => void;
  onCreateBasketballGame: () => void;
}

export default function DashboardHeader({
  onCreateFanWall,
  onCreatePoll,
  onCreatePrizeWheel,
  onOpenAds,
  onCreateTriviaGame,
  onCreateNewAd,
  onCreateSlideShow,
  onCreateBasketballGame,
}: DashboardHeaderProps) {
  const btn = cn(
    'px-4 py-2.5',
    'rounded-lg',
    'font-semibold',
    'text-white',
    'text-sm',
    'leading-none',
    'flex items-center justify-center',
    'transition-all'
  );

  /* ------------------------------------------------------------
     DEVICE / SCREEN GUARD
     - Treat phones + tablets as "handheld"
     - On handheld: ONLY show Ad Manager + Create New Ad
  ------------------------------------------------------------ */
  const [isHandheld, setIsHandheld] = useState(false);

  useEffect(() => {
    const check = () => {
      if (typeof window === 'undefined') return;

      const ua = navigator.userAgent || '';
      const isTouchDevice =
        'ontouchstart' in window ||
        (navigator as any).maxTouchPoints > 0 ||
        /Mobi|Android|iPhone|iPad|Tablet/i.test(ua);

      const isSmallViewport = window.innerWidth < 1024; // most phones & many tablets

      // If it's touch or small, treat as handheld (no wall creation)
      setIsHandheld(isTouchDevice || isSmallViewport);
    };

    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const canCreateWallsAndGames = !isHandheld;

  return (
    <div className={cn('text-center', 'mb-0')}>
      {/* Ads Row (ALWAYS allowed) */}
      <div
        className={cn(
          'flex',
          'justify-center',
          'w-full',
          'mb-4',
          'gap-3',
          'flex-wrap'
        )}
      >
        <button
          onClick={onOpenAds}
          className={cn(btn, 'bg-indigo-600 hover:bg-indigo-700')}
        >
          📺 Open Ad Manager
        </button>

        <button
          onClick={onCreateNewAd}
          className={cn(btn, 'bg-cyan-600 hover:bg-cyan-700')}
        >
          ✏️ Create New Ad
        </button>
      </div>

      {/* If handheld: no wall/game creation buttons */}
      {!canCreateWallsAndGames ? (
        <div className={cn('mt-1', 'text-xs', 'text-white/70', 'max-w-md', 'mx-auto')}>
          To create or run Fan Walls, Trivia, Polls, Prize Wheels, Basketball,
          or Slide Show walls, use a laptop or desktop with a second screen.
          <br />
          You can still manage ads from this device.
        </div>
      ) : (
        // Desktop / laptop: full creation grid
        <div
          className={cn(
            'grid',
            'grid-cols-4',
            'gap-4',
            'justify-center',
            'max-w-4xl',
            'mx-auto'
          )}
        >
          {/* Fan Wall */}
          <button
            onClick={onCreateFanWall}
            className={cn(btn, 'bg-blue-500 hover:bg-blue-600')}
          >
            New Fan Zone Wall
          </button>

          {/* Poll */}
          <button
            onClick={onCreatePoll}
            className={cn(btn, 'bg-green-500 hover:bg-green-600')}
          >
            📊 New Live Poll Wall
          </button>

          {/* Prize Wheel */}
          <button
            onClick={onCreatePrizeWheel}
            className={cn(btn, 'bg-purple-600 hover:bg-purple-700')}
          >
            🎡 New Prize Wheel
          </button>

          {/* Basketball */}
          <button
            onClick={onCreateBasketballGame}
            className={cn(btn, 'bg-orange-600 hover:bg-orange-700')}
          >
            🏀 New Basketball Game
          </button>

          {/* Trivia */}
          <button
            onClick={onCreateTriviaGame}
            className={cn(btn, 'bg-emerald-600 hover:bg-emerald-700')}
          >
            🧠 New Trivia Game
          </button>

          {/* Slide Show */}
          <button
            onClick={onCreateSlideShow}
            className={cn(btn, 'bg-pink-600 hover:bg-pink-700')}
          >
            🖼 New Slide Show Wall
          </button>

          {/* Grid fillers */}
          <div></div>
          <div></div>
        </div>
      )}
    </div>
  );
}
