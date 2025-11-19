'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface UseAdInjectorOptions {
  hostId: string;
  active: boolean; // NEW
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
  type?: 'image' | 'video';
  url?: string;
  active?: boolean;
}

/* -------------------------------------------------------------------------- */
/* AD INJECTOR                                                                */
/* -------------------------------------------------------------------------- */
export function useAdInjector({ hostId, active }: UseAdInjectorOptions) {
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

  /* -------------------------------------------------------------------------- */
  /* LOAD HOST + ADS                                                            */
  /* -------------------------------------------------------------------------- */
  useEffect(() => {
    if (!hostId) return;

    async function loadAll() {
      /* HOST SETTINGS */
      const { data: hostData } = await supabase
        .from('hosts')
        .select('injector_enabled, trigger_interval, injector_mode, master_id')
        .eq('id', hostId)
        .single();

      const host = (hostData || {}) as HostRow;

      setInjectorEnabled(!!host.injector_enabled);
      setTriggerInterval(Number(host.trigger_interval) || 8);
      setInjectorMode(host.injector_mode || 'rotation');
      masterIdRef.current = host.master_id ?? null;

      /* LOCAL ADS */
      const { data: localAds } = await supabase
        .from('slide_ads')
        .select('*')
        .eq('host_profile_id', hostId)
        .eq('active', true)
        .order('order_index', { ascending: true });

      const listLocal = (localAds || []) as SlideAd[];

      /* CORPORATE ADS */
      let corporateAds: SlideAd[] = [];

      if (masterIdRef.current) {
        const { data: corp } = await supabase
          .from('slide_ads')
          .select('*')
          .eq('master_id', masterIdRef.current)
          .eq('active', true)
          .order('order_index', { ascending: true });

        corporateAds = (corp || []).map((a: SlideAd) => ({
          ...a,
          locked: true,
        }));
      }

      /* MERGE FINAL LIST */
      setAds([...corporateAds, ...listLocal]);
    }

    loadAll();
  }, [hostId]);

  /* -------------------------------------------------------------------------- */
  /* AD SWITCHER                                                                */
  /* -------------------------------------------------------------------------- */
  const showNextAd = () => {
    if (!injectorEnabled || !active || ads.length === 0) return;
    setCurrent(c => (c + 1) % ads.length);
    setShowAd(true);
  };

  /* -------------------------------------------------------------------------- */
  /* MODE HANDLERS (takeover | slideshow | rotation)                            */
  /* -------------------------------------------------------------------------- */

  // TAKEOVER — always visible
  useEffect(() => {
    if (!active || !injectorEnabled || ads.length === 0) {
      setShowAd(false);
      clearInterval(intervalRef.current!);
      return;
    }

    if (injectorMode !== 'takeover') return;

    setShowAd(true);
    intervalRef.current = setInterval(showNextAd, triggerInterval * 1000);

    return () => clearInterval(intervalRef.current!);
  }, [injectorMode, active, injectorEnabled, ads.length, triggerInterval]);

  // SLIDESHOW — show then hide
  useEffect(() => {
    if (!active || !injectorEnabled || ads.length === 0) {
      setShowAd(false);
      clearInterval(intervalRef.current!);
      return;
    }

    if (injectorMode !== 'slideshow') return;

    intervalRef.current = setInterval(() => {
      showNextAd();
      setTimeout(() => setShowAd(false), 8000);
    }, triggerInterval * 1000);

    return () => clearInterval(intervalRef.current!);
  }, [injectorMode, active, injectorEnabled, ads.length, triggerInterval]);

  // ROTATION — silent countdown
  useEffect(() => {
    if (!active || !injectorEnabled || ads.length === 0) {
      rotationRef.current = 0;
      return;
    }

    if (injectorMode !== 'rotation') return;

    const timer = setInterval(() => {
      if (!active) return;

      rotationRef.current++;
      if (rotationRef.current >= triggerInterval) {
        rotationRef.current = 0;
        showNextAd();
        setTimeout(() => setShowAd(false), 8000);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [injectorMode, active, injectorEnabled, ads.length, triggerInterval]);

  return {
    ads,
    showAd,
    currentAd: ads[current] || null,
    injectorEnabled,
  };
}
