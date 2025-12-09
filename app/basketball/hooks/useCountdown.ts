"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

export function useCountdown(gameId: string) {
  const [countdown, setCountdown] = useState<number | null>(null);

  // We keep the channel persistent for the life of the component
  const channelRef = useRef<any>(null);

  useEffect(() => {
    // Create ONE unified channel for both Wall + Shooter
    const channel = supabase.channel(`basketball-${gameId}`);

    // Save ref
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "start_countdown" }, () => {
        setCountdown(10);
      })
      .on("broadcast", { event: "start_game" }, (payload) => {
        // If countdown somehow misses end logic, ensure we sync
        const startTime = payload.payload?.startTime;
        if (startTime) {
          supabase
            .from("bb_games")
            .update({
              game_running: true,
              game_timer_start: startTime,
            })
            .eq("id", gameId);
        }
      })
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, [gameId]);

  // Pure countdown engine
  useEffect(() => {
    if (countdown === null) return;

    if (countdown <= 0) {
      setCountdown(null);

      const startTime = new Date().toISOString();

      // Set DB game_running = true
      supabase
        .from("bb_games")
        .update({
          game_running: true,
          game_timer_start: startTime,
        })
        .eq("id", gameId);

      // Tell shooters & wall that game has begun
      channelRef.current?.send({
        type: "broadcast",
        event: "start_game",
        payload: { startTime },
      });

      return;
    }

    const t = setTimeout(() => {
      setCountdown((c) => (c === null ? null : c - 1));
    }, 1000);

    return () => clearTimeout(t);
  }, [countdown, gameId]);

  return countdown;
}
