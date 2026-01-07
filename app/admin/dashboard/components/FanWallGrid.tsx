'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { clearFanWallPosts, deleteFanWall } from '@/lib/actions/fan_walls';
import ModerationModal from '@/components/ModerationModal';
import { cn } from '@/lib/utils';
import { useRealtimeChannel } from '@/providers/SupabaseRealtimeProvider';

interface FanWallGridProps {
  walls: any[] | undefined;
  host: any;
  refreshFanWalls: () => Promise<void>;
  onOpenOptions: (wall: any) => void;
}

export default function FanWallGrid({
  walls,
  host,
  refreshFanWalls,
  onOpenOptions,
}: FanWallGridProps) {

  const rt = useRealtimeChannel();

  const [localWalls, setLocalWalls] = useState<any[]>(walls || []);
  const [pendingCounts, setPendingCounts] = useState<Record<string, number>>({});
  const [showModeration, setShowModeration] = useState(false);
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);

  const refreshTimeout = useRef<NodeJS.Timeout | null>(null);

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

  useEffect(() => {
    setLocalWalls(walls || []);
  }, [walls]);

  /* ------------------------------------------------------ */
  /*  BROADCAST                                             */
  /* ------------------------------------------------------ */
  async function broadcast(event: string, payload: any) {
    try {
      await rt?.broadcast(event, {
        ...payload,
        id: String(payload.id).trim(),
      });
    } catch (err) {
      console.error("Broadcast error:", err);
    }
  }

  function updateLocalWall(id: string, updates: any) {
    setLocalWalls(prev =>
      prev.map(w => (w.id === id ? { ...w, ...updates } : w))
    );
  }

  function parseCountdownDuration(label: string) {
    const num = parseInt(label);
    if (label.includes("Second")) return num * 1000;
    if (label.includes("Minute")) return num * 60 * 1000;
    return 0;
  }

  function delayedRefresh() {
    if (refreshTimeout.current) clearTimeout(refreshTimeout.current);
    refreshTimeout.current = setTimeout(() => {
      refreshFanWalls();
    }, 500);
  }

  /* ------------------------------------------------------ */
  /*  PLAY                                                  */
  /* ------------------------------------------------------ */
  async function handleStart(id: string) {
    updateLocalWall(id, { status: "live", countdown_active: false });

    const { data: current } = await supabase
      .from("fan_walls")
      .select("countdown")
      .eq("id", id)
      .single();

    const countdown = current?.countdown;

    if (countdown && countdown !== "none") {
      await supabase
        .from("fan_walls")
        .update({ countdown_active: true })
        .eq("id", id);

      await broadcast("wall_updated", {
        id,
        countdown_active: true,
      });

      const ms = parseCountdownDuration(countdown);

      setTimeout(async () => {
        await supabase
          .from("fan_walls")
          .update({ status: "live", countdown_active: false })
          .eq("id", id);

        await broadcast("countdown_finished", {
          id,
          status: "live",
        });

        delayedRefresh();
      }, ms);

      return;
    }

    await supabase
      .from("fan_walls")
      .update({ status: "live", countdown_active: false })
      .eq("id", id);

    await broadcast("wall_status_changed", {
      id,
      status: "live",
    });

    delayedRefresh();
  }

  /* ------------------------------------------------------ */
  /*  STOP                                                  */
  /* ------------------------------------------------------ */
  async function handleStop(id: string) {
    updateLocalWall(id, { status: "inactive", countdown_active: false });

    await supabase
      .from("fan_walls")
      .update({ status: "inactive", countdown_active: false })
      .eq("id", id);

    await broadcast("wall_status_changed", {
      id,
      status: "inactive",
    });

    delayedRefresh();
  }

  /* ------------------------------------------------------ */
  /*  CLEAR                                                 */
  /* ------------------------------------------------------ */
  async function handleClear(id: string) {
    await clearFanWallPosts(id);
    delayedRefresh();
  }

  /* ------------------------------------------------------ */
  /*  DELETE                                                */
  /* ------------------------------------------------------ */
  async function handleDelete(id: string) {
    setLocalWalls(prev => prev.filter(w => w.id !== id));
    await deleteFanWall(id);

    await broadcast("wall_status_changed", {
      id,
      status: "deleted",
    });

    delayedRefresh();
  }

  /* ------------------------------------------------------ */
  /*  LAUNCH (desktop / laptop only; disabled on mobile)    */
  /* ------------------------------------------------------ */
  function handleLaunch(id: string) {
    const url = `${window.location.origin}/wall/${id}`;
    const popup = window.open(
      url,
      "_blank",
      "width=1280,height=800,resizable=yes,scrollbars=yes"
    );
    popup?.focus();
  }

  /* ------------------------------------------------------ */
  /*  PENDING COUNTS                                        */
  /* ------------------------------------------------------ */
  useEffect(() => {
    async function fetchPending() {
      const { data } = await supabase
        .from("guest_posts")
        .select("fan_wall_id")
        .eq("status", "pending");

      const counts: Record<string, number> = {};
      data?.forEach(p => {
        counts[p.fan_wall_id] = (counts[p.fan_wall_id] || 0) + 1;
      });

      setPendingCounts(counts);
    }

    fetchPending();

    const sub = supabase
      .channel("pending-posts")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "guest_posts" },
        fetchPending
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sub);
    };
  }, []);

  function openModerationModal(wallId: string) {
    setSelectedWallId(wallId);
    setShowModeration(true);
  }

  /* ------------------------------------------------------ */
  /*  RENDER                                                */
  /* ------------------------------------------------------ */
  return (
    <div className={cn("mt-10 w-full max-w-6xl")}>
      <h2 className={cn('text-xl font-semibold mb-3')}>🎤 Fan Zone Walls</h2>

      {/* Empty state */}
      {(!localWalls || localWalls.length === 0) && (
        <p className={cn("text-sm text-white/60 italic mt-1")}>
          No Fan Walls created yet.
        </p>
      )}

      {/* GRID */}
      {localWalls && localWalls.length > 0 && (
        <div className={cn('grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5')}>
          {localWalls.map(wall => (
            <div
              key={wall.id}
              className={cn(
                "rounded-xl p-4 text-center shadow-lg bg-cover bg-center flex flex-col justify-between transition-all duration-300",
                wall.status === "live"
                  ? "ring-4 ring-lime-400 shadow-lime-500/50"
                  : wall.countdown_active
                  ? "ring-4 ring-yellow-400 shadow-yellow-500/50"
                  : "ring-0"
              )}
              style={{
                backgroundImage:
                  wall.background_type === "image"
                    ? `url(${wall.background_value})`
                    : wall.background_value,
              }}
            >
              <div>
                <h3 className={cn('font-bold text-lg mb-1')}>
                  {wall.host_title || wall.title || "Untitled Wall"}
                </h3>

                <p className={cn('text-sm mb-2')}>
                  <strong>Status:</strong>{" "}
                  <span
                    className={
                      wall.status === "live"
                        ? "text-lime-400"
                        : wall.countdown_active
                        ? "text-yellow-400"
                        : "text-orange-400"
                    }
                  >
                    {wall.status === "live"
                      ? "LIVE"
                      : wall.countdown_active
                      ? "COUNTDOWN ACTIVE"
                      : "INACTIVE"}
                  </span>
                </p>

                <div className={cn('flex justify-center mb-3')}>
                  <button
                    onClick={() => openModerationModal(wall.id)}
                    className={cn(
                      "px-3 py-1 rounded-md text-sm font-semibold flex items-center gap-1 shadow-md transition",
                      pendingCounts[wall.id] > 0
                        ? "bg-yellow-500 hover:bg-yellow-600 text-black"
                        : "bg-gray-600 hover:bg-gray-700 text-white/80"
                    )}
                  >
                    🕓 Pending
                    <span
                      className={cn(
                        "px-1.5 py-0.5 rounded-md text-xs font-bold",
                        pendingCounts[wall.id] > 0
                          ? "bg-black/70 text-white"
                          : "bg-white/20 text-gray-300"
                      )}
                    >
                      {pendingCounts[wall.id] || 0}
                    </span>
                  </button>
                </div>
              </div>

              <div className={cn('flex flex-wrap justify-center gap-2 mt-auto pt-2 border-t border-white/10')}>
                {/* 🚀 Launch (disabled on mobile) */}
                <button
                  type="button"
                  onClick={isMobile ? undefined : () => handleLaunch(wall.id)}
                  disabled={isMobile}
                  className={cn(
                    'px-2 py-1 rounded text-sm font-semibold',
                    'bg-blue-600 hover:bg-blue-700',
                    isMobile && 'opacity-40 cursor-not-allowed hover:bg-blue-600'
                  )}
                >
                  🚀 Launch
                </button>

                <button
                  onClick={() => handleStart(wall.id)}
                  className={cn('bg-green-600 hover:bg-green-700 px-2 py-1 rounded text-sm font-semibold')}
                >
                  ▶️ Play
                </button>

                <button
                  onClick={() => handleStop(wall.id)}
                  className={cn('bg-red-600 hover:bg-red-700 px-2 py-1 rounded text-sm font-semibold')}
                >
                  ⏹ Stop
                </button>

                <button
                  onClick={() => handleClear(wall.id)}
                  className={cn('bg-cyan-500 hover:bg-cyan-600 px-2 py-1 rounded text-sm font-semibold')}
                >
                  🧹 Clear
                </button>

                <button
                  onClick={() => onOpenOptions(wall)}
                  className={cn('bg-indigo-500 hover:bg-indigo-600 px-2 py-1 rounded text-sm font-semibold')}
                >
                  ⚙ Options
                </button>

                <button
                  onClick={() => handleDelete(wall.id)}
                  className={cn('bg-red-700 hover:bg-red-800 px-2 py-1 rounded text-sm font-semibold')}
                >
                  ❌ Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModeration && selectedWallId && (
        <ModerationModal wallId={selectedWallId} onClose={() => setShowModeration(false)} />
      )}
    </div>
  );
}
