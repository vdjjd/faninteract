'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------
   PATCHED PROPS: now includes `polls`
------------------------------------------------------------ */
interface PollGridProps {
  host: any;
  polls: any[];                // ✅ Added
  refreshPolls: () => Promise<void>;
  onOpenOptions: (poll: any) => void;
}

export default function PollGrid({
  host,
  polls,
  refreshPolls,
  onOpenOptions
}: PollGridProps) {

  const [localPolls, setLocalPolls] = useState<any[]>(polls || []);
  const [countdowns, setCountdowns] = useState<{ [key: string]: number }>({});
  const [voteCounts, setVoteCounts] = useState<{ [key: string]: number }>({});
  const timers = useRef<{ [key: string]: NodeJS.Timeout }>({});
  const refreshInterval = useRef<NodeJS.Timeout | null>(null);

  /* ------------------------------------------------------------
     SYNC incoming polls → local state
  ------------------------------------------------------------ */
  useEffect(() => {
    setLocalPolls(Array.isArray(polls) ? polls : []);
  }, [polls]);

  /* ------------------------------------------------------------
     Load Polls + Vote Counts
  ------------------------------------------------------------ */
  async function loadPollsInternal() {
    if (!host?.id) return;

    const { data: pollRows, error } = await supabase
      .from('polls')
      .select('*')
      .eq('host_id', host.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ loadPolls error:', error);
      return;
    }

    setLocalPolls(pollRows || []);

    if (pollRows?.length) {
      const { data: optionRows, error: optsErr } = await supabase
        .from('poll_options')
        .select('poll_id,vote_count');

      if (optsErr) console.error('❌ vote_count error:', optsErr);

      const counts: { [key: string]: number } = {};
      optionRows?.forEach((o) => {
        counts[o.poll_id] = (counts[o.poll_id] || 0) + (o.vote_count || 0);
      });

      setVoteCounts(counts);
    }
  }

  /* ------------------------------------------------------------
     Initial + Interval refresh
  ------------------------------------------------------------ */
  useEffect(() => {
    if (!host?.id) return;

    loadPollsInternal();

    if (refreshInterval.current) clearInterval(refreshInterval.current);
    refreshInterval.current = setInterval(loadPollsInternal, 5000);

    return () => {
      if (refreshInterval.current) clearInterval(refreshInterval.current);
      Object.values(timers.current).forEach(clearInterval);
    };
  }, [host?.id]);

  /* ------------------------------------------------------------
     Countdown Helpers
  ------------------------------------------------------------ */
  function getCountdownSeconds(poll: any): number {
    if (!poll?.countdown || poll.countdown === 'none') return 0;

    const t = poll.countdown.toLowerCase();
    if (t.includes('sec')) return parseInt(t) || 30;
    if (t.includes('min')) return (parseInt(t) || 1) * 60;
    return 0;
  }

  /* ------------------------------------------------------------
     Start Countdown
  ------------------------------------------------------------ */
  async function startCountdown(poll: any) {
    const secs = getCountdownSeconds(poll);

    if (secs === 0) {
      await supabase.from('polls').update({
        status: 'active',
        countdown_active: false,
        countdown: 'none'
      }).eq('id', poll.id);

      await supabase.channel(`poll-${poll.id}`).send({
        type: 'broadcast',
        event: 'poll_status',
        payload: { id: poll.id, status: 'active', countdown_active: false }
      });

      await refreshPolls();
      return;
    }

    await supabase.from('polls').update({
      status: 'inactive',
      countdown_active: true
    }).eq('id', poll.id);

    await supabase.channel(`poll-${poll.id}`).send({
      type: 'broadcast',
      event: 'poll_status',
      payload: { id: poll.id, status: 'inactive', countdown_active: true }
    });

    setCountdowns((prev) => ({ ...prev, [poll.id]: secs }));

    timers.current[poll.id] = setInterval(async () => {
      setCountdowns((prev) => {
        const current = prev[poll.id];

        if (current <= 1) {
          clearInterval(timers.current[poll.id]);

          supabase.from('polls').update({
            status: 'active',
            countdown_active: false,
            countdown: 'none'
          }).eq('id', poll.id);

          supabase.channel(`poll-${poll.id}`).send({
            type: 'broadcast',
            event: 'poll_status',
            payload: { id: poll.id, status: 'active', countdown_active: false }
          });

          return { ...prev, [poll.id]: 0 };
        }

        return { ...prev, [poll.id]: current - 1 };
      });

      await refreshPolls();
    }, 1000);
  }

  async function stopCountdown(poll: any) {
    const secs = getCountdownSeconds(poll);
    clearInterval(timers.current[poll.id]);
    setCountdowns((prev) => ({ ...prev, [poll.id]: secs }));
    await handleStatus(poll.id, 'inactive');
  }

  async function handleStatus(id: string, status: string) {
    await supabase.from('polls')
      .update({
        status,
        ...(status !== 'active' && { countdown_active: false }),
      })
      .eq('id', id);

    await supabase.channel(`poll-${id}`).send({
      type: 'broadcast',
      event: 'poll_status',
      payload: { id, status }
    });

    await refreshPolls();
  }

  async function handleDelete(id: string) {
    setLocalPolls((prev) => prev.filter((p) => p.id !== id));
    await supabase.from('poll_options').delete().eq('poll_id', id);
    await supabase.from('polls').delete().eq('id', id);
    await refreshPolls();
  }

  function handleLaunch(pollId: string) {
    const url = `${window.location.origin}/polls/${pollId}`;
    const popup = window.open(url, '_blank', 'width=1280,height=800,resizable=yes');
    popup?.focus();
  }

  /* ------------------------------------------------------------
     Render
  ------------------------------------------------------------ */
  return (
    <div className={cn('mt-10 w-full max-w-6xl')}>
      <h2 className={cn('text-xl font-semibold mb-3')}>📊 Live Polls</h2>

      <div className={cn('grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5')}>
        {localPolls.length === 0 && (
          <p className={cn('text-gray-400 italic col-span-full')}>
            No polls created yet.
          </p>
        )}

        {localPolls.map((poll) => {
          const brightness = poll.background_brightness || 100;

          const bgStyle =
            poll.background_type === 'image'
              ? {
                  backgroundImage: `url(${poll.background_value})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  filter: `brightness(${brightness}%)`,
                }
              : {
                  background:
                    poll.background_value || 'linear-gradient(135deg,#0d47a1,#1976d2)',
                  filter: `brightness(${brightness}%)`,
                };

          return (
            <div
              key={poll.id}
              className={cn(
                'rounded-xl p-4 text-center shadow-lg flex flex-col justify-between transition-all duration-200',
                poll.status === 'active'
                  ? 'ring-4 ring-lime-400 shadow-lime-500/50'
                  : poll.status === 'closed'
                  ? 'ring-4 ring-rose-500 shadow-rose-500/50'
                  : 'ring-0'
              )}
              style={bgStyle}
            >
              <div className="mb-3">
                <h3 className={cn('font-bold text-lg mb-1 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]')}>
                  {poll.host_title || poll.question || 'Untitled Poll'}
                </h3>

                <p className={cn('text-sm mb-1 opacity-80')}>
                  <strong>Status:</strong>{' '}
                  <span
                    className={
                      poll.status === 'active'
                        ? 'text-lime-400'
                        : poll.status === 'closed'
                        ? 'text-rose-400'
                        : 'text-orange-400'
                    }
                  >
                    {poll.status?.toUpperCase?.() || 'UNKNOWN'}
                  </span>
                </p>

                <p className={cn('text-sm opacity-80')}>
                  <strong>Votes:</strong> {voteCounts[poll.id] ?? 0}
                </p>
              </div>

              <div className={cn('flex justify-center gap-2 mb-2')}>
                <button
                  onClick={() => startCountdown(poll)}
                  className={cn('bg-green-600 hover:bg-green-700 px-2 py-1 rounded text-sm font-semibold')}
                >
                  ▶️ Start
                </button>

                <button
                  onClick={() => stopCountdown(poll)}
                  className={cn('bg-yellow-600 hover:bg-yellow-700 px-2 py-1 rounded text-sm font-semibold')}
                >
                  ⏹ Stop
                </button>

                <button
                  onClick={() => handleStatus(poll.id, 'closed')}
                  className={cn('bg-gray-600 hover:bg-gray-700 px-2 py-1 rounded text-sm font-semibold')}
                >
                  🔒 Close
                </button>
              </div>

              <div className={cn('flex justify-center gap-2')}>
                <button
                  onClick={() => handleLaunch(poll.id)}
                  className={cn('bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded text-sm font-semibold')}
                >
                  🚀 Launch
                </button>

                <button
                  onClick={() => onOpenOptions(poll)}
                  className={cn('bg-indigo-500 hover:bg-indigo-600 px-2 py-1 rounded text-sm font-semibold')}
                >
                  ⚙ Options
                </button>
              </div>

              <div className={cn('flex justify-center mt-2')}>
                <button
                  onClick={() => handleDelete(poll.id)}
                  className={cn('bg-red-700 hover:bg-red-800 px-3 py-1 rounded text-sm font-semibold')}
                >
                  ❌ Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
