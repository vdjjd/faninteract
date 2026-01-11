"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";

import PrizeWheelCard from "./PrizeWheelCard";
import PrizeWheelModerationModal from "@/components/PrizeWheelModerationModal";

interface PrizeWheelGridProps {
  wheels: any[] | undefined;
  host: any;
  refreshPrizeWheels: () => Promise<void>;
  onOpenOptions: (wheel: any) => void;
}

export default function PrizeWheelGrid({
  wheels,
  host,
  refreshPrizeWheels,
  onOpenOptions,
}: PrizeWheelGridProps) {
  const [localWheels, setLocalWheels] = useState<any[]>([]);
  const [moderationWheel, setModerationWheel] = useState<any | null>(null);

  const refreshTimeout = useRef<NodeJS.Timeout | null>(null);

  /* ------------------------------------------------------------
     ✅ Sync props → state safely
  ------------------------------------------------------------ */
  useEffect(() => {
    if (Array.isArray(wheels)) {
      const safe = wheels.filter((w) => w && w.id);
      setLocalWheels([...safe]); // ensure NEW array reference
    } else {
      setLocalWheels([]);
    }
  }, [wheels]);

  /* ------------------------------------------------------------
     ✅ REALTIME LISTENER FOR wheel_entries
  ------------------------------------------------------------ */
  useEffect(() => {
    if (!host?.id) return;

    const channel = supabase
      .channel("prizewheel-grid-sync")
      .on(
        "postgres_changes",
        {
          schema: "public",
          table: "wheel_entries",
          event: "*",
        },
        async () => {
          const { data } = await supabase
            .from("prize_wheels")
            .select("*")
            .eq("host_id", host.id)
            .order("created_at", { ascending: false });

          setLocalWheels(data || []);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [host?.id]);

  /* ------------------------------------------------------------
     ✅ Broadcast helper (kept for other events if needed)
  ------------------------------------------------------------ */
  async function broadcast(event: string, payload: any) {
    try {
      await supabase.channel("prizewheel-realtime").send({
        type: "broadcast",
        event,
        payload,
      });
    } catch (err) {
      console.error("❌ PrizeWheelGrid broadcast failed:", err);
    }
  }

  /* ------------------------------------------------------------
     ✅ SPIN (required by PrizeWheelCardProps)
     NOTE: This currently broadcasts on "prizewheel-realtime".
     If your wall listens on `prizewheel-${wheelId}`, we will change this next.
  ------------------------------------------------------------ */
  async function handleSpin(wheelId: string) {
    await broadcast("spin_trigger", { id: wheelId });
  }

  /* ------------------------------------------------------------
     ✅ PLAY
  ------------------------------------------------------------ */
  async function handlePlay(wheelId: string) {
    const { data: wheel } = await supabase
      .from("prize_wheels")
      .select("countdown")
      .eq("id", wheelId)
      .single();

    const hasCountdown = wheel?.countdown && wheel.countdown.trim() !== "";

    if (!hasCountdown) {
      await supabase
        .from("prize_wheels")
        .update({
          status: "live",
          countdown_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", wheelId);

      await broadcast("prizewheel_status_changed", {
        id: wheelId,
        status: "live",
        countdown_active: false,
      });
    } else {
      await supabase
        .from("prize_wheels")
        .update({
          status: "inactive",
          countdown_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", wheelId);

      await broadcast("prizewheel_status_changed", {
        id: wheelId,
        status: "inactive",
        countdown_active: true,
      });
    }

    delayedRefresh();
  }

  /* ------------------------------------------------------------
     ✅ STOP
  ------------------------------------------------------------ */
  async function handleStop(wheelId: string) {
    await supabase
      .from("prize_wheels")
      .update({
        status: "inactive",
        countdown_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", wheelId);

    await broadcast("prizewheel_status_changed", {
      id: wheelId,
      status: "inactive",
      countdown_active: false,
    });

    delayedRefresh();
  }

  /* ------------------------------------------------------------
     ✅ DELETE
  ------------------------------------------------------------ */
  async function handleDelete(id: string) {
    setLocalWheels((prev) => prev.filter((w) => w.id !== id));

    await supabase.from("prize_wheels").delete().eq("id", id);
    await broadcast("prizewheel_deleted", { id });

    delayedRefresh();
  }

  /* ------------------------------------------------------------
     ✅ Moderation Modal (OPEN/CLOSE)
  ------------------------------------------------------------ */
  function handleOpenModeration(wheel: any) {
    if (!wheel || !wheel.id) return;
    setModerationWheel(wheel);
  }

  function handleCloseModeration() {
    setModerationWheel(null);
  }

  /* ------------------------------------------------------------
     ✅ Debounced refresh
  ------------------------------------------------------------ */
  function delayedRefresh() {
    if (refreshTimeout.current) clearTimeout(refreshTimeout.current);
    refreshTimeout.current = setTimeout(() => {
      refreshPrizeWheels().catch(console.error);
    }, 400);
  }

  /* ------------------------------------------------------------
     ✅ RENDER
  ------------------------------------------------------------ */
  return (
    <div className={cn("mt-10 w-full max-w-6xl")}>
      <h2 className={cn("text-xl font-semibold mb-3")}>🎡 Prize Wheels</h2>

      <div
        className={cn(
          "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5"
        )}
      >
        {localWheels.length === 0 && (
          <p className={cn("text-gray-400 italic")}>
            No Prize Wheels created yet.
          </p>
        )}

        {localWheels.map((wheel) => (
          <PrizeWheelCard
            key={wheel.id}
            wheel={wheel}
            onOpenOptions={onOpenOptions}
            onDelete={handleDelete}
            onSpin={handleSpin} // ✅ FIX: REQUIRED PROP
            onOpenModeration={handleOpenModeration}
            onPlay={handlePlay}
            onStop={handleStop}
          />
        ))}
      </div>

      {moderationWheel && (
        <PrizeWheelModerationModal
          wheelId={moderationWheel.id}
          onClose={handleCloseModeration}
        />
      )}
    </div>
  );
}
