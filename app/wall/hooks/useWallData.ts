'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';

/* ---------------------------------------------- */
/* CANONICAL LAYOUT                               */
/* ---------------------------------------------- */
function canonicalLayout(input?: string) {
  if (!input) return 'singleHighlight';
  const raw = input.toLowerCase();
  if (raw.includes('4x2')) return 'grid4x2';
  if (raw.includes('2x2')) return 'grid2x2';
  return 'singleHighlight';
}

/* ---------------------------------------------- */
/* MAIN POLLING HOOK                              */
/* ---------------------------------------------- */
export function useWallData(wallId: string | undefined) {

  const [wall, setWall] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLive, setShowLive] = useState(false);

  const lastWallJSON = useRef<string>('');
  const lastPostCount = useRef<number>(0);

  // 🚨 Prevent overlapping requests
  const isFetching = useRef(false);

  /* ---------------------------------------------- */
  /* REFRESH FUNCTION                               */
  /* ---------------------------------------------- */
  const refresh = useCallback(async () => {

    // 🔐 Skip if already fetching
    if (isFetching.current) return;
    isFetching.current = true;

    try {
      if (!wallId) {
        setLoading(true);
        return;
      }

      const wallUUID = wallId.trim();

      /* 1️⃣ FETCH WALL SETTINGS */
      const { data: wallRow } = await supabase
        .from('fan_walls')
        .select(`*, host:host_id (id, email, branding_logo_url)`)
        .eq('id', wallUUID)
        .maybeSingle();

      if (!wallRow) {
        setWall(null);
        setLoading(false);
        return;
      }

      const normalized = {
        ...wallRow,
        layout_type: canonicalLayout(wallRow.layout_type),
      };

      const nextJSON = JSON.stringify(normalized);

      if (nextJSON !== lastWallJSON.current) {
        lastWallJSON.current = nextJSON;
        setWall(normalized);
        setShowLive(wallRow.status === 'live');
      }

      /* 2️⃣ FETCH POSTS */
      const { data: postRows } = await supabase
        .from('guest_posts')
        .select('*')
        .eq('fan_wall_id', wallUUID)
        .eq('status', 'approved')
        .order('created_at', { ascending: false });

      const newCount = postRows?.length || 0;

      if (newCount !== lastPostCount.current) {
        lastPostCount.current = newCount;
        setPosts(postRows || []);
      }

      setLoading(false);

    } finally {
      isFetching.current = false;  // 🔓 Unlock
    }

  }, [wallId]);

  /* ---------------------------------------------- */
  /* INITIAL LOAD + POLLING                         */
  /* ---------------------------------------------- */
  useEffect(() => {
    refresh(); // immediate load

    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [refresh]);

  /* ---------------------------------------------- */
  /* RETURN DATA                                    */
  /* ---------------------------------------------- */
  return {
    wall,
    posts,
    loading,
    showLive,
    refresh,
  };
}
