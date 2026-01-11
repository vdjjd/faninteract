'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

import InactivePrizeWall from '@/app/prizewheel/components/wall/InactiveWall';
import ActivePrizeWall from '@/app/prizewheel/components/wall/ActiveWall';

const PAGE_SIZE = 1000;

export default function PrizeWheelRouterPage() {
  const { wheelId } = useParams();
  const id = Array.isArray(wheelId) ? wheelId[0] : wheelId;

  const [wheel, setWheel] = useState<any>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showLive, setShowLive] = useState(false);

  // used to avoid async setState after unmount
  const mountedRef = useRef(true);

  /* ------------------------------------------------------ */
  /* ✅ Helpers                                              */
  /* ------------------------------------------------------ */

  async function fetchWheel() {
    const { data, error } = await supabase
      .from('prize_wheels')
      .select(
        `
        *,
        host:hosts (
          id,
          branding_logo_url,
          venue_name
        )
      `
      )
      .eq('id', id)
      .maybeSingle();

    if (error) console.error('❌ fetchWheel error:', error);
    return data ?? null;
  }

  // Pull all approved entries in pages of 1000 (no 1000-row cap issues)
  async function fetchAllApprovedEntries() {
    const all: any[] = [];
    let from = 0;

    while (true) {
      const to = from + PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from('wheel_entries')
        .select(
          `
          id,
          wheel_id,
          guest_profile_id,
          created_at,
          status,
          photo_url,
          first_name,
          last_name,
          guest_profiles (
            first_name,
            last_name
          )
        `
        )
        .eq('wheel_id', id)
        .eq('status', 'approved')
        .order('created_at', { ascending: true })
        .range(from, to);

      if (error) {
        console.error('❌ fetchAllApprovedEntries error:', error);
        break;
      }

      if (data?.length) all.push(...data);

      // stop when last page is smaller than PAGE_SIZE
      if (!data || data.length < PAGE_SIZE) break;

      from += PAGE_SIZE;
    }

    return all;
  }

  // For realtime INSERT/UPDATE where payload doesn’t include joined guest_profiles
  async function fetchEntryById(entryId: string) {
    const { data, error } = await supabase
      .from('wheel_entries')
      .select(
        `
        id,
        wheel_id,
        guest_profile_id,
        created_at,
        status,
        photo_url,
        first_name,
        last_name,
        guest_profiles (
          first_name,
          last_name
        )
      `
      )
      .eq('id', entryId)
      .single();

    if (error) {
      console.error('❌ fetchEntryById error:', error);
      return null;
    }
    return data;
  }

  function sortByCreatedAtAsc(list: any[]) {
    return [...list].sort((a, b) => {
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      return ta - tb;
    });
  }

  /* ------------------------------------------------------ */
  /* ✅ Initial load: wheel + ALL entries (paged)            */
  /* ------------------------------------------------------ */
  useEffect(() => {
    mountedRef.current = true;

    async function loadEverything() {
      setLoading(true);

      const [wheelData, entryData] = await Promise.all([
        fetchWheel(),
        fetchAllApprovedEntries(),
      ]);

      if (!mountedRef.current) return;

      if (!wheelData) {
        setWheel(null);
        setEntries([]);
        setShowLive(false);
        setLoading(false);
        return;
      }

      setWheel(wheelData);
      setEntries(entryData || []);
      setShowLive(wheelData.status === 'live');
      setLoading(false);
    }

    loadEverything();

    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /* ------------------------------------------------------ */
  /* ✅ Realtime: wheel status updates (no polling)          */
  /* ------------------------------------------------------ */
  useEffect(() => {
    if (!id) return;

    const wheelCh = supabase
      .channel(`pw_wheel_${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'prize_wheels',
          filter: `id=eq.${id}`,
        },
        (payload) => {
          const next = payload.new as any;
          setWheel(next);
          setShowLive(next?.status === 'live');
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(wheelCh);
    };
  }, [id]);

  /* ------------------------------------------------------ */
  /* ✅ Realtime: entries changes (no full refetch)          */
  /* ------------------------------------------------------ */
  useEffect(() => {
    if (!id) return;

    const entriesCh = supabase
      .channel(`pw_entries_${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'wheel_entries',
          filter: `wheel_id=eq.${id}`,
        },
        async (payload) => {
          const type = payload.eventType;

          // DELETE
          if (type === 'DELETE') {
            const oldId = (payload.old as any)?.id;
            if (!oldId) return;
            setEntries((prev) => prev.filter((x) => x.id !== oldId));
            return;
          }

          // INSERT/UPDATE — we may need the joined guest_profiles data
          const newRow = payload.new as any;
          if (!newRow?.id) return;

          // if it’s not approved, ensure it is not in our approved list
          if (`${newRow.status}`.toLowerCase().trim() !== 'approved') {
            setEntries((prev) => prev.filter((x) => x.id !== newRow.id));
            return;
          }

          // approved: upsert into our list
          const full = await fetchEntryById(newRow.id);
          if (!full) return;

          setEntries((prev) => {
            const exists = prev.some((x) => x.id === full.id);
            const next = exists
              ? prev.map((x) => (x.id === full.id ? full : x))
              : [...prev, full];

            return sortByCreatedAtAsc(next);
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(entriesCh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /* ------------------------------------------------------ */
  /* RENDER                                                  */
  /* ------------------------------------------------------ */
  if (loading)
    return <div style={{ color: 'white', padding: 40 }}>Loading…</div>;

  if (!wheel)
    return <div style={{ color: 'white', padding: 40 }}>Not found</div>;

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100vh',
        overflow: 'hidden',
        background: 'black',
      }}
    >
      {/* INACTIVE WALL LAYER */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: showLive ? 0 : 1,
          transition: 'opacity 0.6s ease',
          zIndex: 1,
        }}
      >
        <InactivePrizeWall wheel={wheel} />
      </div>

      {/* ACTIVE WALL LAYER */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: showLive ? 1 : 0,
          transition: 'opacity 0.6s ease',
          zIndex: 2,
        }}
      >
        <ActivePrizeWall wheel={wheel} entries={entries} />
      </div>
    </div>
  );
}
