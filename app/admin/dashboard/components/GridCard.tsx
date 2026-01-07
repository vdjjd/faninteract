'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from "@/lib/supabaseClient";
import { cn } from "../../../../lib/utils";

interface GridCardProps {
  id: string;
  title: string;
  hostTitle?: string;
  status: string;
  backgroundType?: string;
  backgroundValue?: string;
  type: 'fanwall' | 'poll' | 'trivia';
  onStart?: (id: string) => void;
  onStop?: (id: string) => void;
  onClear?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export default function GridCard({
  id,
  title,
  hostTitle,
  status,
  backgroundType,
  backgroundValue,
  type,
  onStart,
  onStop,
  onClear,
  onDelete,
}: GridCardProps) {
  const icon =
    type === 'fanwall' ? '🎤' :
    type === 'poll' ? '📊' :
    '🧠';

  // 🔹 Track mobile vs desktop so Launch can be disabled on phones
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => {
      if (typeof window !== 'undefined') {
        setIsMobile(window.innerWidth < 768);
      }
    };

    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  /* -------------------------------------------------- */
  /* 🚀 OPEN WALL IN REAL BROWSER (OBS-SAFE)            */
  /*   - Desktop / laptop only                          */
  /* -------------------------------------------------- */
  function launchPopout() {
    const url = `${window.location.origin}/wall/${id}`;

    console.log("Launching EXTERNAL browser via protocol:", url);

    // Forces Windows to open Chrome/Edge instead of OBS Chromium
    window.location.href = `openbrowser:${url}`;
  }

  /* -------------------------------------------------- */
  /* 🔄 RELOAD WALL COMMAND                            */
  /* -------------------------------------------------- */
  async function sendReload() {
    await supabase.from("wall_commands").insert({
      wall_id: id,
      action: "reload_wall"
    });
  }

  return (
    <div
      key={id}
      className={cn(
        'rounded-xl',
        'p-4',
        'text-center',
        'shadow-lg',
        'bg-cover',
        'bg-center',
        'border',
        'border-white/10',
        'hover:scale-[1.02]',
        'transition-transform'
      )}
      style={{
        background:
          backgroundType === 'image'
            ? `url(${backgroundValue}) center/cover no-repeat`
            : backgroundValue || 'linear-gradient(135deg,#0d47a1,#1976d2)',
      }}
    >
      <h3 className={cn('font-bold', 'text-lg', 'drop-shadow-md')}>
        {icon} {hostTitle || title || 'Untitled'}
      </h3>

      <p className={cn('text-sm', 'mt-1')}>
        <strong>Status:</strong>{' '}
        <span
          className={
            status === 'live'
              ? 'text-lime-400'
              : status === 'inactive'
              ? 'text-orange-400'
              : 'text-gray-400'
          }
        >
          {status}
        </span>
      </p>

      <div className={cn('flex', 'flex-wrap', 'justify-center', 'gap-2', 'mt-3')}>

        {/* 🚀 LAUNCH WALL (External Browser) */}
        <button
          type="button"
          onClick={isMobile ? undefined : launchPopout}
          disabled={isMobile}
          className={cn(
            'px-2 py-1 rounded text-sm font-semibold',
            'bg-blue-600 hover:bg-blue-700',
            isMobile && 'opacity-40 cursor-not-allowed hover:bg-blue-600'
          )}
        >
          🚀 Launch
        </button>

        {/* ▶️ START */}
        {onStart && (
          <button
            onClick={() => onStart(id)}
            className={cn('bg-green-600 hover:bg-green-700 px-2 py-1 rounded text-sm font-semibold')}
          >
          ▶️ Start
          </button>
        )}

        {/* ⏹ STOP */}
        {onStop && (
          <button
            onClick={() => onStop(id)}
            className={cn('bg-red-600 hover:bg-red-700 px-2 py-1 rounded text-sm font-semibold')}
          >
            ⏹ Stop
          </button>
        )}

        {/* 🧹 CLEAR */}
        {onClear && (
          <button
            onClick={() => onClear(id)}
            className={cn('bg-cyan-500 hover:bg-cyan-600 px-2 py-1 rounded text-sm font-semibold')}
          >
            🧹 Clear
          </button>
        )}

        {/* ❌ DELETE */}
        {onDelete && (
          <button
            onClick={() => onDelete(id)}
            className={cn('bg-red-700 hover:bg-red-800 px-2 py-1 rounded text-sm font-semibold')}
          >
            ❌ Delete
          </button>
        )}

        {/* 🔄 RELOAD WALL */}
        <button
          onClick={sendReload}
          className={cn('bg-yellow-500 hover:bg-yellow-600 px-2 py-1 rounded text-sm font-semibold')}
        >
          🔄 Reload
        </button>

      </div>
    </div>
  );
}
