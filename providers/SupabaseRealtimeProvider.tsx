"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState
} from "react";

/**
 * SAFE REALTIME PROVIDER
 *
 * - Does NOT modify or override Supabase Realtime
 * - Does NOT intercept websocket messages
 * - Only provides a simple BroadcastChannel for cross-tab UI sync
 * - NO fake "realtimeReady"
 * - NO message interception
 */

const RTContext = createContext<{
  broadcast: (event: string, payload: any) => void;
} | null>(null);

export function SupabaseRealtimeProvider({ children }) {
  const busRef = useRef<BroadcastChannel | null>(null);

  // Create cross-tab channel ONLY (no impact on Supabase)
  useEffect(() => {
    busRef.current = new BroadcastChannel("faninteract_realtime_bus");

    return () => {
      busRef.current?.close();
    };
  }, []);

  /** Broadcast ONLY to other tabs (never touches Supabase) */
  function broadcast(event: string, payload: any) {
    busRef.current?.postMessage({
      type: "broadcast",
      msg: { event, payload }
    });
  }

  return (
    <RTContext.Provider value={{ broadcast }}>
      {children}
    </RTContext.Provider>
  );
}

export function useRealtimeChannel() {
  return useContext(RTContext);
}
