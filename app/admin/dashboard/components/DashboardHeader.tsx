'use client';

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
    "px-4 py-2.5",
    "rounded-lg",
    "font-semibold",
    "text-white",
    "text-sm",
    "leading-none",
    "flex items-center justify-center",
    "transition-all"
  );

  return (
    <div className={cn('text-center', 'mb-0')}>
      
      {/* Ads Row */}
      <div className={cn('flex', 'justify-center', 'w-full', 'mb-4', 'gap-3', 'flex-wrap')}>
        <button
          onClick={onOpenAds}
          className={cn(btn, "bg-indigo-600 hover:bg-indigo-700")}
        >
          📺 Open Ad Manager
        </button>

        <button
          onClick={onCreateNewAd}
          className={cn(btn, "bg-cyan-600 hover:bg-cyan-700")}
        >
          ✏️ Create New Ad
        </button>
      </div>

      {/* Main Grid */}
      <div className={cn('grid', 'grid-cols-4', 'gap-4', 'justify-center', 'max-w-4xl', 'mx-auto')}>

        {/* Fan Wall */}
        <button
          onClick={onCreateFanWall}
          className={cn(btn, "bg-blue-500 hover:bg-blue-600")}
        >
          New Fan Zone Wall
        </button>

        {/* Poll */}
        <button
          onClick={onCreatePoll}
          className={cn(btn, "bg-green-500 hover:bg-green-600")}
        >
          📊 New Live Poll Wall
        </button>

        {/* Prize Wheel */}
        <button
          onClick={onCreatePrizeWheel}
          className={cn(btn, "bg-purple-600 hover:bg-purple-700")}
        >
          🎡 New Prize Wheel
        </button>

        {/* Basketball */}
        <button
          onClick={onCreateBasketballGame}
          className={cn(btn, "bg-orange-600 hover:bg-orange-700")}
        >
          🏀 New Basketball Game
        </button>

        {/* ✅ TRIVIA — ENABLED */}
        <button
          onClick={onCreateTriviaGame}
          className={cn(btn, "bg-emerald-600 hover:bg-emerald-700")}
        >
          🧠 New Trivia Game
        </button>

        {/* Slide Show */}
        <button
          onClick={onCreateSlideShow}
          className={cn(btn, "bg-pink-600 hover:bg-pink-700")}
        >
          🖼 New Slide Show Wall
        </button>

        {/* Grid fillers */}
        <div></div>
        <div></div>
      </div>
    </div>
  );
}
