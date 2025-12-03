'use client';

import React from 'react';
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

  /* ---------------------------------------------- */
  /* 🔥 POP-OUT LAUNCH WINDOW (OBS-SAFE VERSION)     */
  /* ---------------------------------------------- */
  function launchPopout() {
    const win = window.open(
      `/wall/${id}`,
      "_blank",
      "popup=yes,width=1920,height=1080,resizable=yes"
    );

    if (!win) {
      alert("Pop-up blocked — enable pop-ups to launch the wall.");
    }
  }

  /* ---------------------------------------------- */
  /* 🔄 RELOAD WALL COMMAND                         */
  /* ---------------------------------------------- */
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

        {/* 🚀 LAUNCH WALL */}
        <button
          onClick={launchPopout}
          className={cn(
            'bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded text-sm font-semibold'
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

        {/* 🔄 RELOAD */}
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
