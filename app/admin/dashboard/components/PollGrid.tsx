'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { cn } from '@/lib/utils';

interface PollGridProps {
  host: any;
  polls: any[];
  refreshPolls: () => Promise<void>;
  onOpenOptions: (poll: any) => void;
}

export default function PollGrid({
  host,
  polls,
  refreshPolls,
  onOpenOptions,
}: PollGridProps) {
  const [localPolls, setLocalPolls] = useState<any[]>(polls || []);
  const [countdowns, setCountdowns] = useState<{ [key: string]: number }>({});
  const [voteCounts, setVoteCounts] = useState<{ [key: string]: number }>({});

  // track which polls currently have highlight ON
  const [highlightedPolls, setHighlightedPolls] = useState<{
    [pollId: string]: boolean;
  }>({});

  // 🔹 track if we're on mobile to disable Launch Wall button
  const [isMobile, setIsMobile] = useState(false);

  const timers = useRef<{ [key: string]: NodeJS.Timeout }>({});
  const refreshInterval = useRef<NodeJS.Timeout | null>(null);

  /* ------------------------------------------------------------
     Detect mobile vs desktop
  ------------------------------------------------------------ */
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
      optionRows?.forEach((o: any) => {
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
     Countdown Helpers (pre-open countdown)
  ------------------------------------------------------------ */
  function getCountdownSeconds(poll: any): number {
    if (!poll?.countdown || poll.countdown === 'none') return 0;

    const t = poll.countdown.toLowerCase();
    if (t.includes('sec')) return parseInt(t) || 30;
    if (t.includes('min')) return (parseInt(t) || 1) * 60;
    return 0;
  }

  /* ------------------------------------------------------------
     Start / Stop Countdown + DURATION
  ------------------------------------------------------------ */
  async function startCountdown(poll: any) {
    const secs = getCountdownSeconds(poll);
    const durationSeconds = (poll.duration_minutes || 0) * 60;

    // ⏩ No pre-countdown: instantly ACTIVE + start duration (if set)
    if (secs === 0) {
      await supabase
        .from('polls')
        .update({
          status: 'active',
          countdown_active: false,
          countdown: 'none',
        })
        .eq('id', poll.id);

      await supabase.channel(`poll-${poll.id}`).send({
        type: 'broadcast',
        event: 'poll_status',
        payload: { id: poll.id, status: 'active', countdown_active: false },
      });

      // ⭐ Start duration timer only when poll is ACTIVE
      if (durationSeconds > 0) {
        await supabase.channel(`poll-${poll.id}`).send({
          type: 'broadcast',
          event: 'duration_start',
          payload: { seconds: durationSeconds },
        });
      }

      await refreshPolls();
      return;
    }

    // ⏱ Pre-countdown path (open after N seconds)
    await supabase
      .from('polls')
      .update({
        status: 'inactive',
        countdown_active: true,
      })
      .eq('id', poll.id);

    await supabase.channel(`poll-${poll.id}`).send({
      type: 'broadcast',
      event: 'poll_status',
      payload: { id: poll.id, status: 'inactive', countdown_active: true },
    });

    setCountdowns((prev) => ({ ...prev, [poll.id]: secs }));

    timers.current[poll.id] = setInterval(async () => {
      setCountdowns((prev) => {
        const current = prev[poll.id];

        if (current <= 1) {
          clearInterval(timers.current[poll.id]);

          // flip to ACTIVE
          supabase
            .from('polls')
            .update({
              status: 'active',
              countdown_active: false,
              countdown: 'none',
            })
            .eq('id', poll.id);

          supabase.channel(`poll-${poll.id}`).send({
            type: 'broadcast',
            event: 'poll_status',
            payload: {
              id: poll.id,
              status: 'active',
              countdown_active: false,
            },
          });

          // ⭐ Start duration when pre-countdown completes
          if (durationSeconds > 0) {
            supabase.channel(`poll-${poll.id}`).send({
              type: 'broadcast',
              event: 'duration_start',
              payload: { seconds: durationSeconds },
            });
          }

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

    // ⭐ STOP / RESET duration back to original setting
    const durationSeconds = (poll.duration_minutes || 0) * 60;
    await supabase.channel(`poll-${poll.id}`).send({
      type: 'broadcast',
      event: 'duration_reset',
      payload: { seconds: durationSeconds },
    });
  }

  async function handleStatus(id: string, status: string) {
    await supabase
      .from('polls')
      .update({
        status,
        ...(status !== 'active' && { countdown_active: false }),
      })
      .eq('id', id);

    await supabase.channel(`poll-${id}`).send({
      type: 'broadcast',
      event: 'poll_status',
      payload: { id, status },
    });

    await refreshPolls();
  }

  /* ------------------------------------------------------------
     Delete Poll
  ------------------------------------------------------------ */
  async function handleDelete(id: string) {
    setLocalPolls((prev) => prev.filter((p) => p.id !== id));
    await supabase.from('poll_options').delete().eq('poll_id', id);
    await supabase.from('polls').delete().eq('id', id);
    await refreshPolls();
  }

  /* ------------------------------------------------------------
     🚀 Launch Active Wall (desktop / laptop only)
  ------------------------------------------------------------ */
  function handleLaunch(pollId: string) {
    const url = `${window.location.origin}/polls/${pollId}`;
    const popup = window.open(
      url,
      '_blank',
      'width=1280,height=800,resizable=yes'
    );
    popup?.focus();
  }

  /* ------------------------------------------------------------
     🥇 HIGHLIGHT WINNER (TOGGLE BUTTON)
  ------------------------------------------------------------ */
  async function handleHighlightWinner(pollId: string) {
    try {
      const currentlyOn = !!highlightedPolls[pollId];

      // If it's already highlighted, clicking again turns it OFF
      if (currentlyOn) {
        await supabase.channel(`poll-${pollId}`).send({
          type: 'broadcast',
          event: 'highlight_winner',
          payload: { option_id: null },
        });

        setHighlightedPolls((prev) => ({ ...prev, [pollId]: false }));
        return;
      }

      // Otherwise, find winner and turn highlight ON
      const { data: options, error } = await supabase
        .from('poll_options')
        .select('id,vote_count')
        .eq('poll_id', pollId);

      if (error) {
        console.error('❌ highlightWinner load error:', error);
        return;
      }

      if (!options || options.length === 0) {
        alert('No options found for this poll.');
        return;
      }

      let winner = options[0];
      for (const opt of options) {
        if ((opt.vote_count || 0) > (winner.vote_count || 0)) {
          winner = opt;
        }
      }

      if (!winner?.id) {
        alert('Could not determine a winning option.');
        return;
      }

      await supabase.channel(`poll-${pollId}`).send({
        type: 'broadcast',
        event: 'highlight_winner',
        payload: {
          option_id: winner.id,
        },
      });

      setHighlightedPolls((prev) => ({ ...prev, [pollId]: true }));
    } catch (err) {
      console.error('❌ handleHighlightWinner error:', err);
    }
  }

  /* ------------------------------------------------------------
     🔄 RESET POLL (votes + duration)
  ------------------------------------------------------------ */
  async function handleResetPoll(pollId: string) {
    try {
      // Zero out votes
      const { error: resetErr } = await supabase
        .from('poll_options')
        .update({ vote_count: 0 })
        .eq('poll_id', pollId);

      if (resetErr) {
        console.error('❌ reset poll_options error:', resetErr);
        return;
      }

      // Set poll back to inactive, kill countdown
      await supabase
        .from('polls')
        .update({
          status: 'inactive',
          countdown_active: false,
        })
        .eq('id', pollId);

      // Clear highlight on the wall
      await supabase.channel(`poll-${pollId}`).send({
        type: 'broadcast',
        event: 'poll_reset',
        payload: { id: pollId },
      });

      setHighlightedPolls((prev) => ({ ...prev, [pollId]: false }));

      // ⭐ Also reset duration timer to original value
      const { data: pollRow } = await supabase
        .from('polls')
        .select('duration_minutes')
        .eq('id', pollId)
        .maybeSingle();

      const durationSeconds = ((pollRow?.duration_minutes as number) || 0) * 60;

      await supabase.channel(`poll-${pollId}`).send({
        type: 'broadcast',
        event: 'duration_reset',
        payload: { seconds: durationSeconds },
      });

      await refreshPolls();
    } catch (err) {
      console.error('❌ handleResetPoll error:', err);
    }
  }

  /* ------------------------------------------------------------
     Render
  ------------------------------------------------------------ */
  return (
    <div className={cn('mt-10 w-full max-w-6xl')}>
      <h2 className={cn('text-xl font-semibold mb-3')}>📊 Live Polls</h2>

      <div
        className={cn(
          'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5'
        )}
      >
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
                    poll.background_value ||
                    'linear-gradient(135deg,#0d47a1,#1976d2)',
                  filter: `brightness(${brightness}%)`,
                };

          const totalVotes = voteCounts[poll.id] ?? 0;
          const countdownSeconds = countdowns[poll.id];
          const hasCountdown =
            poll.countdown_active || (countdownSeconds && countdownSeconds > 0);

          const highlightOn = !!highlightedPolls[poll.id];

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
              {/* HEADER */}
              <div className="mb-3">
                <h3
                  className={cn(
                    'font-bold text-lg mb-1',
                    'drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]'
                  )}
                >
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
                        : 'text-orange-300'
                    }
                  >
                    {poll.status?.toUpperCase?.() || 'UNKNOWN'}
                  </span>
                </p>

                <p className={cn('text-sm opacity-80')}>
                  <strong>Votes:</strong> {totalVotes}
                </p>

                {hasCountdown && (
                  <p className={cn('text-xs mt-1 opacity-80')}>
                    ⏱ Countdown:{' '}
                    {poll.countdown_active
                      ? `${countdownSeconds ?? getCountdownSeconds(poll)}s`
                      : poll.countdown}
                  </p>
                )}
              </div>

              {/* MAIN CONTROLS */}
              <div
                className={cn(
                  'flex flex-wrap justify-center gap-2 mb-2 pt-2 border-t border-white/20'
                )}
              >
                <button
                  onClick={() => startCountdown(poll)}
                  className={cn(
                    'bg-green-600 hover:bg-green-700 px-2 py-1 rounded text-sm font-semibold'
                  )}
                >
                  ▶️ Start
                </button>

                <button
                  onClick={() => stopCountdown(poll)}
                  className={cn(
                    'bg-yellow-600 hover:bg-yellow-700 px-2 py-1 rounded text-sm font-semibold'
                  )}
                >
                  ⏹ Stop
                </button>

                <button
                  onClick={() => handleStatus(poll.id, 'closed')}
                  className={cn(
                    'bg-gray-700 hover:bg-gray-800 px-2 py-1 rounded text-sm font-semibold'
                  )}
                >
                  🔒 Close
                </button>
              </div>

              {/* WALL / OPTIONS ROW */}
              <div className={cn('flex flex-wrap justify-center gap-2 mb-2')}>
                <button
                  type="button"
                  onClick={isMobile ? undefined : () => handleLaunch(poll.id)}
                  disabled={isMobile}
                  className={cn(
                    'px-2 py-1 rounded text-sm font-semibold',
                    'bg-blue-600 hover:bg-blue-700',
                    isMobile && 'opacity-40 cursor-not-allowed hover:bg-blue-600'
                  )}
                >
                  🚀 Launch Wall
                </button>

                <button
                  onClick={() => onOpenOptions(poll)}
                  className={cn(
                    'bg-indigo-500 hover:bg-indigo-600 px-2 py-1 rounded text-sm font-semibold'
                  )}
                >
                  ⚙ Options
                </button>
              </div>

              {/* WINNER / RESET ROW */}
              <div
                className={cn(
                  'flex flex-wrap justify-center gap-2 mb-2 border-t border-white/15 pt-2'
                )}
              >
                <button
                  onClick={() => handleHighlightWinner(poll.id)}
                  className={cn(
                    'px-2 py-1 rounded text-sm font-semibold',
                    highlightOn
                      ? 'bg-amber-700 hover:bg-amber-800'
                      : 'bg-amber-500 hover:bg-amber-600'
                  )}
                >
                  {highlightOn ? '🛑 Stop Highlight' : '🥇 Highlight Winner'}
                </button>

                <button
                  onClick={() => handleResetPoll(poll.id)}
                  className={cn(
                    'bg-slate-800 hover:bg-slate-900 px-2 py-1 rounded text-sm font-semibold'
                  )}
                >
                  🔄 Reset Poll
                </button>
              </div>

              {/* DELETE */}
              <div className={cn('flex justify-center mt-1')}>
                <button
                  onClick={() => handleDelete(poll.id)}
                  className={cn(
                    'bg-red-700 hover:bg-red-800 px-3 py-1 rounded text-sm font-semibold'
                  )}
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
