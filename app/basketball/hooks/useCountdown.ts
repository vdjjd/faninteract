"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export function useCountdown(gameId: string) {
  const [countdown, setCountdown] = useState<number | null>(null);
  const tickingRef = useRef(false);

  const wallChannelRef = useRef<any>(null);
  const broadcastChannelRef = useRef<any>(null);

  /* ------------------------------------------------------------
     LISTEN FOR start_countdown FROM BOTH CHANNELS
  ------------------------------------------------------------ */
  useEffect(() => {
    if (!gameId) return;

    /* Wall-specific channel */
    const wallChannel = supabase.channel(`basketball-${gameId}`);
    wallChannelRef.current = wallChannel;

    wallChannel
      .on("broadcast", { event: "start_countdown" }, (payload) => {
        const incoming = payload?.payload?.gameId;
        if (incoming !== gameId) return;

        if (!tickingRef.current) {
          tickingRef.current = true;
          setCountdown(10);
        }
      })
      .subscribe();

    /* Universal broadcast channel — NO SUBSCRIBE NEEDED */
    const broadcastChannel = supabase.channel("broadcast");
    broadcastChannelRef.current = broadcastChannel;

    broadcastChannel
      .on("broadcast", { event: "start_countdown" }, (payload) => {
        const incoming = payload?.payload?.gameId;
        if (incoming !== gameId) return;

        if (!tickingRef.current) {
          tickingRef.current = true;
          setCountdown(10);
        }
      })
      .subscribe();

    return () => {
      try { supabase.removeChannel(wallChannel); } catch {}
      try { supabase.removeChannel(broadcastChannel); } catch {}
    };
  }, [gameId]);

  /* ------------------------------------------------------------
     LOCAL COUNTDOWN ENGINE
  ------------------------------------------------------------ */
  useEffect(() => {
    if (countdown === null) return;

    // COUNTDOWN FINISHED → start game
    if (countdown <= 0) {
      setCountdown(null);
      tickingRef.current = false;

      const startTime = new Date().toISOString();

      (async () => {
        // Update DB
        await supabase
          .from("bb_games")
          .update({
            game_running: true,
            game_timer_start: startTime,
          })
          .eq("id", gameId)
          .select();

        // Notify all clients
        broadcastChannelRef.current?.send({
          type: "broadcast",
          event: "start_game",
          payload: { startTime },
        });
      })();

      return;
    }

    // Continue countdown
    const timer = setTimeout(() => {
      setCountdown((c) => (c !== null ? c - 1 : null));
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown, gameId]);

  return countdown;
}
