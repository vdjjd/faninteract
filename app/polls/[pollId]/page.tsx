'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

import InactivePollWall from '../components/InactivePollWall';
import ActivePollWall from '../components/ActivePollWall';
import { cn } from '../../../lib/utils';

const POLL_REFRESH_MS = 2000; // JD requested

export default function PollRouterPage() {
  const { pollId } = useParams();
  const id = Array.isArray(pollId) ? pollId[0] : pollId;

  const [poll, setPoll] = useState<any>(null);
  const [host, setHost] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isFading, setIsFading] = useState(false);

  const pollInterval = useRef<NodeJS.Timeout | null>(null);

  /* ---------------------------------------------------------------------- */
  /* 🔥 POLLING: Load poll + host every 2000ms                              */
  /* ---------------------------------------------------------------------- */
  async function loadEverything() {
    if (!id) return;

    try {
      const { data: pollData } = await supabase
        .from('polls')
        .select('*, hosts(*)')
        .eq('id', id)
        .maybeSingle();

      if (!pollData) {
        setLoading(false);
        return;
      }

      setPoll(pollData);
      setHost(pollData.hosts || null);
    } catch (err) {
      console.error('❌ Poll load error:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    loadEverything();

    // Start polling
    if (pollInterval.current) clearInterval(pollInterval.current);
    pollInterval.current = setInterval(loadEverything, POLL_REFRESH_MS);

    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current);
    };
  }, [id]);

  /* ---------------------------------------------------------------------- */
  /* ⭐ REALTIME: Update immediately when poll status changes                */
  /* ---------------------------------------------------------------------- */
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`router-poll-${id}`)
      .on(
        'postgres_changes',
        {
          schema: 'public',
          table: 'polls',
          event: '*',
          filter: `id=eq.${id}`,
        },
        (payload) => {
          setPoll((prev) => ({ ...prev, ...payload.new }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  /* ---------------------------------------------------------------------- */
  /* Fade Logic                                                             */
  /* ---------------------------------------------------------------------- */
  useEffect(() => {
    if (!poll) return;

    // Fade in to Active Wall
    if (poll.status === 'active') {
      setIsFading(true);
      const t = setTimeout(() => setIsFading(false), 1500);
      return () => clearTimeout(t);
    }

    // Fade back to Inactive Wall
    if (poll.status === 'inactive' || poll.status === 'closed') {
      setIsFading(true);
      const t = setTimeout(() => setIsFading(false), 1500);
      return () => clearTimeout(t);
    }
  }, [poll?.status]);

  /* ---------------------------------------------------------------------- */
  /* Render                                                                 */
  /* ---------------------------------------------------------------------- */
  if (loading)
    return (
      <div
        className={cn(
          'flex',
          'items-center',
          'justify-center',
          'h-screen',
          'text-white',
          'text-2xl',
          'bg-black'
        )}
      >
        Loading Poll…
      </div>
    );

  if (!poll)
    return (
      <div
        className={cn(
          'flex',
          'items-center',
          'justify-center',
          'h-screen',
          'text-white',
          'text-2xl',
          'bg-black'
        )}
      >
        Poll not found.
      </div>
    );

  const showInactive = poll.status !== 'active' || (poll.status === 'active' && isFading);
  const showActive = poll.status === 'active' && !isFading;

  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Inactive Wall */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transition: 'opacity 1.5s ease',
          opacity: showInactive ? 1 : 0,
          pointerEvents: showInactive ? 'auto' : 'none',
        }}
      >
        <InactivePollWall poll={poll} host={host} />
      </div>

      {/* Active Wall */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transition: 'opacity 1.5s ease',
          opacity: showActive ? 1 : 0,
          pointerEvents: showActive ? 'auto' : 'none',
        }}
      >
        <ActivePollWall poll={poll} host={host} />
      </div>
    </div>
  );
}
