'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface UseAdInjectorOptions {
  hostId: string;
}

interface HostRow {
  injector_enabled?: boolean;
  trigger_interval?: number;
  injector_mode?: 'rotation' | 'slideshow' | 'takeover';
  master_id?: string | null;
}

interface SlideAd {
  id?: string;
  master_id?: string | null;
  host_profile_id?: string | null;
  order_index?: number | null;
  [key: string]: any;
}

export function useAdInjector({ hostId }: UseAdInjectorOptions) {
  const [ads, setAds] = useState<SlideAd[]>([]);
  const [showAd, setShowAd] = useState(false);
  const [current, setCurrent] = useState(0);

  const [injectorEnabled, setInjectorEnabled] = useState(false);
  const [triggerInterval, setTriggerInterval] = useState(8);
  const [injectorMode, setInjectorMode] =
    useState<'rotation' | 'slideshow' | 'takeover'>('rotation');

  const masterIdRef = useRef<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const rotationRef = useRef(0);

  /* --------------------------------------------------------------------
     LOAD HOST + ADS
  -------------------------------------------------------------------- */
  useEffect(() => {
    if (!hostId) return;

    async function loadAll() {
      /** HOST SETTINGS */
      const { data } = await supabase
        .from('hosts')
        .select('injector_enabled, trigger_interval, injector_mode, master_id')
        .eq('id', hostId)
        .single();

      const host = (data || {}) as HostRow;

      setInjectorEnabled(!!host.injector_enabled);
      setTriggerInterval(Number(host.trigger_interval) || 8);
      setInjectorMode(host.injector_mode ?? 'rotation');
      masterIdRef.current = host.master_id ?? null;

      /** LOCAL ADS */
      const { data: localAdsData } = await supabase
        .from('slide_ads')
        .select('*')
        .eq('host_profile_id', hostId)
        .eq('active', true)
        .order('order_index', { ascending: true });

      const localAds = (localAdsData || []) as SlideAd[];

      /** CORPORATE ADS */
      let corporateAds: SlideAd[] = [];

      if (masterIdRef.current) {
        const { data: corp } = await supabase
          .from('slide_ads')
          .select('*')
          .eq('master_id', masterIdRef.current)
          .eq('active', true)
          .order('order_index', { ascending: true });

        corporateAds = ((corp || []) as SlideAd[]).map(a => ({
          ...a,
          locked: true,
        }));
      }

      /** MERGE WITH SAFE CASTS */
      const merged = [...corporateAds, ...localAds].sort((a, b) => {
        const aa = a as SlideAd;
        const bb = b as SlideAd;

        // corporate first:
        if (aa.master_id && !bb.master_id) return -1;
        if (!aa.master_id && bb.master_id) return 1;

        // then order_index:
        return (aa.order_index ?? 9999) - (bb.order_index ?? 9999);
      });

      setAds(merged);
    }

    loadAll();

    /* REALTIME LISTENERS ---------------------------------- */

    // LOCAL ADS
    const localChan = supabase
      .channel(`slide_ads_local_${hostId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'slide_ads',
          filter: `host_profile_id=eq.${hostId}`,
        },
        () => loadAll()
      )
      .subscribe();

    // CORPORATE ADS
    const corpChan = supabase
      .channel(`slide_ads_corp_${hostId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'slide_ads' },
        payload => {
          const row = payload.new as SlideAd; // FIX HERE
          if (row.master_id === masterIdRef.current) loadAll();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(localChan);
      supabase.removeChannel(corpChan);
    };
  }, [hostId]);

  /* --------------------------------------------------------------------
     AD SWITCHER
  -------------------------------------------------------------------- */
  const showNextAd = () => {
    if (!injectorEnabled || ads.length === 0) return;

    setCurrent(prev => (prev + 1) % ads.length);
    setShowAd(true);
  };

  /* --------------------------------------------------------------------
     MODES
  -------------------------------------------------------------------- */
  useEffect(() => {
    if (injectorMode !== 'takeover') return hideAndClear();
    if (!injectorEnabled || ads.length === 0) return hideAndClear();

    setShowAd(true);
    restartInterval(showNextAd, triggerInterval * 1000);

    return clearIntervalOnly;
  }, [injectorMode, injectorEnabled, ads.length, triggerInterval]);

  useEffect(() => {
    if (injectorMode !== 'slideshow') return hideAndClear();
    if (!injectorEnabled || ads.length === 0) return hideAndClear();

    restartInterval(() => {
      showNextAd();
      setTimeout(() => setShowAd(false), 8000);
    }, triggerInterval * 1000);

    return clearIntervalOnly;
  }, [injectorMode, injectorEnabled, ads.length, triggerInterval]);

  const tick = () => {
    if (injectorMode !== 'rotation') return;
    if (!injectorEnabled || ads.length === 0) return;
    if (showAd) return;

    rotationRef.current++;

    if (rotationRef.current >= triggerInterval) {
      rotationRef.current = 0;
      showNextAd();
      setTimeout(() => setShowAd(false), 8000);
    }
  };

  /* UTIL */
  function restartInterval(fn: () => void, ms: number) {
    clearIntervalOnly();
    intervalRef.current = setInterval(fn, ms);
  }

  function clearIntervalOnly() {
    if (intervalRef.current) clearInterval(intervalRef.current);
  }

  function hideAndClear() {
    setShowAd(false);
    clearIntervalOnly();
  }

  return {
    ads,
    showAd,
    currentAd: ads[current] || null,
    injectorEnabled,
    injectorMode,
    tick,
  };
}
