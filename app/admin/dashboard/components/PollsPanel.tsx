'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { cn } from '@/lib/utils';

interface PollGridProps {
  host: any;
  refreshPolls: () => Promise<void>;
  onOpenOptions: (poll: any) => void;
}

export default function PollGrid({ host, refreshPolls, onOpenOptions }: PollGridProps) {
  const [localPolls, setLocalPolls] = useState<any[]>([]);
  const refreshTimeout = useRef<NodeJS.Timeout | null>(null);

  /* ------------------------------------------------------------
     ✅ Load all polls for this host
  ------------------------------------------------------------ */
  async function loadPolls() {
    if (!host?.id) return;
    const { data, error } = await supabase
      .from('polls')
      .select('*')
      .eq('host_id', host.id)
      .order('created_at', { ascending: false });

    if (error) console.error('❌ loadPolls error:', error);
    setLocalPolls(data || []);
  }

  useEffect(() => {
    if (!host?.id) return;
    loadPolls();
  }, [host?.id]);

  /* ------------------------------------------------------------
     ✅ REALTIME LISTENER for INSERT, UPDATE, DELETE
  ------------------------------------------------------------ */
  useEffect(() => {
    if (!host?.id) return;

    const channel = supabase
      .channel('polls-grid-sync')
      .on(
        'postgres_changes',
        {
          schema: 'public',
          table: 'polls',
          event: '*',
          filter: `host_id=eq.${host.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setLocalPolls((prev) => [payload.new, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setLocalPolls((prev) =>
              prev.map((p) => (p.id === payload.new.id ? payload.new : p))
            );
          } else if (payload.eventType === 'DELETE') {
            setLocalPolls((prev) => prev.filter((p) => p.id !== payload.old.id));
          }
          delayedRefresh();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [host?.id]);

  /* ------------------------------------------------------------
     ✅ Debounced refresh (prevents DB spam)
  ------------------------------------------------------------ */
  function delayedRefresh() {
    if (refreshTimeout.current) clearTimeout(refreshTimeout.current);
    refreshTimeout.current = setTimeout(() => {
      refreshPolls().catch(console.error);
    }, 400);
  }

  /* ------------------------------------------------------------
     ✅ Actions
  ------------------------------------------------------------ */
  async function handleDelete(id: string) {
    setLocalPolls((prev) => prev.filter((p) => p.id !== id));
    await supabase.from('poll_options').delete().eq('poll_id', id);
    await supabase.from('polls').delete().eq('id', id);
    delayedRefresh();
  }

  function handleLaunch(pollId: string) {
    const url = `${window.location.origin}/polls/${pollId}`;
    const popup = window.open(url, '_blank', 'width=1280,height=800,resizable=yes');
    popup?.focus();
  }

  // 🏆 Highlight winner: find highest vote_count & broadcast to wall
  async function handleHighlightWinner(pollId: string) {
    try {
      const { data: opts, error } = await supabase
        .from('poll_options')
        .select('id, vote_count')
        .eq('poll_id', pollId);

      if (error) {
        console.error('❌ Error loading poll options for highlight:', error);
        alert('Error loading poll options.');
        return;
      }

      if (!opts || opts.length === 0) {
        alert('No options found for this poll.');
        return;
      }

      // Find the option with the highest vote_count
      let winner = opts[0];
      for (const o of opts) {
        const v = o.vote_count || 0;
        const w = winner.vote_count || 0;
        if (v > w) {
          winner = o;
        }
      }

      if (!winner?.id) {
        alert('Could not determine a winner.');
        return;
      }

      const channel = supabase.channel(`poll-${pollId}`);

      await channel.send({
        type: 'broadcast',
        event: 'highlight_winner',
        payload: {
          option_id: winner.id,
        },
      });

      // Optional: immediately remove channel after sending
      supabase.removeChannel(channel);
    } catch (err) {
      console.error('❌ Highlight winner exception:', err);
      alert('Error highlighting winner.');
    }
  }

  // 🔄 Reset votes: set vote_count = 0 for all options in this poll
  async function handleResetPoll(pollId: string) {
    try {
      const confirmReset = window.confirm(
        'Reset all votes for this poll? This keeps all options and images, but sets all vote counts back to 0.'
      );
      if (!confirmReset) return;

      const { error } = await supabase
        .from('poll_options')
        .update({ vote_count: 0 })
        .eq('poll_id', pollId);

      if (error) {
        console.error('❌ Error resetting poll votes:', error);
        alert('Error resetting poll votes.');
        return;
      }

      // Active wall polls every 1.5s, so it will naturally pick up the zeros.
      // Still nice to refresh dashboards.
      delayedRefresh();
    } catch (err) {
      console.error('❌ Reset poll exception:', err);
      alert('Error resetting poll votes.');
    }
  }

  /* ------------------------------------------------------------
     ✅ Render
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

        {localPolls.map((poll) => (
          <div
            key={poll.id}
            className={cn(
              'rounded-xl p-4 text-center shadow-lg bg-cover bg-center flex flex-col justify-between transition-all duration-300',
              poll.status === 'active'
                ? 'ring-4 ring-lime-400 shadow-lime-500/50'
                : poll.status === 'closed'
                ? 'ring-4 ring-rose-500 shadow-rose-500/50'
                : 'ring-0'
            )}
            style={{
              background: 'linear-gradient(135deg,#0d47a1,#1976d2)',
            }}
          >
            {/* Header */}
            <div>
              <h3 className={cn('font-bold', 'text-lg', 'mb-1')}>
                {poll.question || 'Untitled Poll'}
              </h3>
              <p className={cn('text-sm', 'mb-2')}>
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
            </div>

            {/* Controls */}
            <div
              className={cn(
                'flex',
                'flex-wrap',
                'justify-center',
                'gap-2',
                'mt-auto',
                'pt-2',
                'border-t',
                'border-white/10'
              )}
            >
              <button
                onClick={() => handleLaunch(poll.id)}
                className={cn(
                  'bg-blue-600',
                  'hover:bg-blue-700',
                  'px-2',
                  'py-1',
                  'rounded',
                  'text-sm',
                  'font-semibold'
                )}
              >
                🚀 Launch
              </button>

              <button
                onClick={() => onOpenOptions(poll)}
                className={cn(
                  'bg-indigo-500',
                  'hover:bg-indigo-600',
                  'px-2',
                  'py-1',
                  'rounded',
                  'text-sm',
                  'font-semibold'
                )}
              >
                ⚙ Options
              </button>

              <button
                onClick={() => handleHighlightWinner(poll.id)}
                className={cn(
                  'bg-yellow-400',
                  'hover:bg-yellow-300',
                  'text-black',
                  'px-2',
                  'py-1',
                  'rounded',
                  'text-sm',
                  'font-semibold',
                  'shadow'
                )}
              >
                🏆 Highlight Winner
              </button>

              <button
                onClick={() => handleResetPoll(poll.id)}
                className={cn(
                  'bg-slate-600',
                  'hover:bg-slate-500',
                  'px-2',
                  'py-1',
                  'rounded',
                  'text-sm',
                  'font-semibold'
                )}
              >
                🔄 Reset Votes
              </button>

              <button
                onClick={() => handleDelete(poll.id)}
                className={cn(
                  'bg-red-700',
                  'hover:bg-red-800',
                  'px-2',
                  'py-1',
                  'rounded',
                  'text-sm',
                  'font-semibold'
                )}
              >
                ❌ Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
