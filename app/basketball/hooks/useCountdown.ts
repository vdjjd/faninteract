"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

/**
 * FINAL WORKING VERSION
 * ---------------------
 * Triggers countdown from ANY source:
 * - Dashboard (postMessage)
 * - Wall broadcast
 * - Phone broadcast
 * - Shooter forced event
 * - localStorage cross-sync
 */
export function useCountdown(gameId: string) {
  const [countdown, setCountdown] = useState<number | null>(null);

  /* ------------------------------------------------------------
     HELPER: Start countdown everywhere
  ------------------------------------------------------------ */
  function startCountdown() {
    setCountdown(10);

    // Cross-tab sync
    window.localStorage.setItem("bb_force_countdown", String(Date.now()));

    // Local tab sync
    window.postMessage({ type: "start_countdown" }, "*");
  }

  /* ------------------------------------------------------------
     LISTEN — Dashboard → postMessage
  ------------------------------------------------------------ */
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.data?.type === "start_countdown") {
        startCountdown();
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  /* ------------------------------------------------------------
     LISTEN — ShooterPage forced event
  ------------------------------------------------------------ */
  useEffect(() => {
    function onForced() {
      startCountdown();
    }
    window.addEventListener("force-start-countdown", onForced);
    return () =>
      window.removeEventListener("force-start-countdown", onForced);
  }, []);

  /* ------------------------------------------------------------
     LISTEN — Supabase broadcast
  ------------------------------------------------------------ */
  useEffect(() => {
    const channel = supabase
      .channel(`basketball-${gameId}`)
      .on("broadcast", { event: "start_countdown" }, () => {
        startCountdown();
      })
      .subscribe();

    return () => {
      try { supabase.removeChannel(channel); } catch {}
    };
  }, [gameId]);

  /* ------------------------------------------------------------
     LISTEN — localStorage cross-tab sync
  ------------------------------------------------------------ */
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === "bb_force_countdown") {
        startCountdown();
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  /* ------------------------------------------------------------
     COUNTDOWN TICK LOGIC
  ------------------------------------------------------------ */
  useEffect(() => {
    if (countdown === null) return;

    if (countdown <= 0) {
      setCountdown(null);

      const startTime = new Date().toISOString();

      // Mark game started
      supabase
        .from("bb_games")
        .update({
          game_running: true,
          game_timer_start: startTime,
        })
        .eq("id", gameId);

      // Broadcast start_game
      supabase.channel(`basketball-${gameId}`).send({
        type: "broadcast",
        event: "start_game",
        payload: { startTime },
      });

      return;
    }

    const t = setTimeout(() => {
      setCountdown((v) => (v !== null ? v - 1 : null));
    }, 1000);

    return () => clearTimeout(t);
  }, [countdown, gameId]);

  return countdown;
}
