"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";
import * as Tabs from "@radix-ui/react-tabs";
import PrizeWheelSettingsModal from "@/components/PrizeWheelSettingsModal";

/* ------------------------------------------------------------
   GLOBAL WINDOW TYPES
------------------------------------------------------------ */
declare global {
  interface Window {
    _activePrizeWheel?: any;
    _prizewheel?: {
      _spin?: {
        start: () => void;
      };
    };
  }
}

/* ------------------------------------------------------------
   TYPES
------------------------------------------------------------ */

interface PrizeWheelCardProps {
  wheel: any;
  onOpenOptions: (wheel: any) => void;
  onDelete: (id: string) => void;
  onSpin: (id: string) => Promise<void>;
  onOpenModeration: (wheel: any) => void;
  onPlay: (id: string) => Promise<void>;
  onStop: (id: string) => Promise<void>;
}

/* ------------------------------------------------------------
   BROADCAST HELPERS
------------------------------------------------------------ */

async function broadcastSpin(id: string) {
  await supabase.channel(`prizewheel-${id}`).send({
    type: "broadcast",
    event: "spin_trigger",
    payload: { id },
  });
}

async function broadcastRemoteSelection(wheelId: string, guestId: string) {
  await supabase.channel(`prizewheel-${wheelId}`).send({
    type: "broadcast",
    event: "remote_spinner_selected",
    payload: { selected_guest_id: guestId },
  });
}

async function broadcastReload(id: string) {
  await supabase.channel(`prizewheel-${id}`).send({
    type: "broadcast",
    event: "reload_trigger",
    payload: { id },
  });
}

/* ------------------------------------------------------------
   COMPONENT
------------------------------------------------------------ */

export default function PrizeWheelCard({
  wheel,
  onOpenOptions,
  onDelete,
  onSpin,
  onOpenModeration,
  onPlay,
  onStop,
}: PrizeWheelCardProps) {
  if (!wheel?.id) {
    return (
      <div
        className={cn(
          "rounded-xl p-4 text-center bg-gray-700/20 text-gray-300 border border-white/10"
        )}
      >
        Loading wheel…
      </div>
    );
  }

  const [entryCount, setEntryCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingRemote, setPendingRemote] = useState(false);

  const [toggleRemote, setToggleRemote] = useState<boolean>(
    wheel.remote_spin_enabled ?? false
  );

  const [selectedSpinner, setSelectedSpinner] = useState<string | null>(
    wheel.selected_remote_spinner ?? null
  );

  // Tabs
  const [activeTab, setActiveTab] = useState<"menu" | "settings">("menu");

  // Thank You Popup state (db-backed)
  const [thankYouPopupEnabled, setThankYouPopupEnabled] = useState<boolean>(
    !!wheel.thank_you_popup_enabled
  );
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  /* ------------------------------------------------------------
     Sync thank-you popup state when wheel prop changes
  ------------------------------------------------------------ */
  useEffect(() => {
    setThankYouPopupEnabled(!!wheel.thank_you_popup_enabled);
  }, [wheel.id, wheel.thank_you_popup_enabled]);

  /* ------------------------------------------------------------
     Load Entry Counts
  ------------------------------------------------------------ */
  async function loadCounts() {
    const { data } = await supabase
      .from("wheel_entries")
      .select("status")
      .eq("wheel_id", wheel.id);

    if (!data) {
      setEntryCount(0);
      setPendingCount(0);
      return;
    }

    setEntryCount(data.filter((e) => e.status === "approved").length);
    setPendingCount(data.filter((e) => e.status === "pending").length);
  }

  /* ------------------------------------------------------------
     Realtime: wheel_entries watcher
  ------------------------------------------------------------ */
  useEffect(() => {
    if (!wheel.id) return;

    loadCounts();

    const channel = supabase
      .channel(`wheel_entries_watch_${wheel.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wheel_entries",
          filter: `wheel_id=eq.${wheel.id}`,
        },
        loadCounts
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [wheel.id]);

  /* ------------------------------------------------------------
     Realtime: HOST SPIN listening
------------------------------------------------------------ */
  useEffect(() => {
    if (!wheel.id) return;

    const ch = supabase
      .channel(`prizewheel-${wheel.id}`)
      .on("broadcast", { event: "spin_trigger" }, () => {
        setPendingRemote(true);
        setTimeout(() => setPendingRemote(false), 3000);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [wheel.id]);

  /* ------------------------------------------------------------
     Realtime: PHONE remote spin
------------------------------------------------------------ */
  useEffect(() => {
    if (!wheel.id) return;

    const ch = supabase
      .channel(`prizewheel-${wheel.id}`)
      .on("broadcast", { event: "remote_spin_pressed" }, async () => {
        await handleSpin();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [wheel.id]);

  /* ------------------------------------------------------------
     Remote Toggle
------------------------------------------------------------ */
  async function handleRemoteToggle() {
    const newEnabled = !toggleRemote;
    setToggleRemote(newEnabled);

    await supabase
      .from("prize_wheels")
      .update({
        remote_spin_enabled: newEnabled,
        selected_remote_spinner: null,
      })
      .eq("id", wheel.id);

    setSelectedSpinner(null);
  }

  /* ------------------------------------------------------------
     Thank You Popup Toggle
     - Updates DB
     - When turned ON, opens the settings modal
  ------------------------------------------------------------ */
  async function handleThankYouPopupToggle() {
    const newEnabled = !thankYouPopupEnabled;
    setThankYouPopupEnabled(newEnabled);

    await supabase
      .from("prize_wheels")
      .update({
        thank_you_popup_enabled: newEnabled,
      })
      .eq("id", wheel.id);

    if (newEnabled) {
      setSettingsModalOpen(true);
    }
  }

  /* ------------------------------------------------------------
     Pick Random Spinner
  ------------------------------------------------------------ */
  async function pickRandomSpinner() {
    const { data } = await supabase
      .from("wheel_entries")
      .select("guest_profile_id")
      .eq("wheel_id", wheel.id)
      .eq("status", "approved");

    if (!data?.length) {
      alert("No approved entrants yet.");
      return;
    }

    const random = data[Math.floor(Math.random() * data.length)];
    const guestId = random.guest_profile_id;

    setSelectedSpinner(guestId);

    await supabase
      .from("prize_wheels")
      .update({ selected_remote_spinner: guestId })
      .eq("id", wheel.id);

    await broadcastRemoteSelection(wheel.id, guestId);
  }

  /* ------------------------------------------------------------
     Launch Wheel Popup
  ------------------------------------------------------------ */
  function handleLaunch() {
    const url = `${window.location.origin}/prizewheel/${wheel.id}`;

    const popup = window.open(
      url,
      "_blank",
      "width=1280,height=800,resizable=yes,scrollbars=yes"
    );

    popup?.focus();
    window._activePrizeWheel = popup;
  }

  /* ------------------------------------------------------------
     PLAY
  ------------------------------------------------------------ */
  async function handlePlay() {
    await onPlay(wheel.id);

    if (wheel.countdown && wheel.countdown !== "none") {
      await supabase
        .from("prize_wheels")
        .update({ countdown_active: true })
        .eq("id", wheel.id);
      return;
    }

    await supabase
      .from("prize_wheels")
      .update({ status: "live", countdown_active: false })
      .eq("id", wheel.id);
  }

  /* ------------------------------------------------------------
     STOP
  ------------------------------------------------------------ */
  async function handleStop() {
    await onStop(wheel.id);

    await supabase
      .from("prize_wheels")
      .update({
        status: "inactive",
        countdown_active: false,
        countdown: "none",
        selected_remote_spinner: null,
        remote_spin_enabled: false,
      })
      .eq("id", wheel.id);

    setToggleRemote(false);
    setSelectedSpinner(null);
  }

  /* ------------------------------------------------------------
     SPIN NOW
  ------------------------------------------------------------ */
  async function handleSpin() {
    await onSpin(wheel.id);

    try {
      const popup = window._activePrizeWheel;
      popup?._prizewheel?._spin?.start();
    } catch {}

    await broadcastSpin(wheel.id);
  }

  /* ------------------------------------------------------------
     Status Badge
  ------------------------------------------------------------ */
  function StatusBadge() {
    let text = "INACTIVE";
    let color = "text-orange-400";

    if (wheel.status === "live") {
      text = "LIVE";
      color = "text-lime-400";
    } else if (wheel.countdown_active) {
      text = "COUNTDOWN";
      color = "text-yellow-400";
    }

    return <span className={cn("font-bold tracking-wide", color)}>{text}</span>;
  }

  /* ------------------------------------------------------------
     RENDER
  ------------------------------------------------------------ */

  const cardBg =
    wheel.background_type === "image"
      ? {
          backgroundImage: `url(${wheel.background_value})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }
      : { background: wheel.background_value };

  return (
    <>
      <div
        className={cn(
          "rounded-xl p-4 text-center shadow-lg bg-cover bg-center flex flex-col justify-between transition-all duration-300",
          wheel.status === "live"
            ? "ring-4 ring-lime-400 shadow-lime-500/40"
            : wheel.countdown_active
            ? "ring-4 ring-yellow-400 shadow-yellow-500/40"
            : "ring-0"
        )}
        style={cardBg}
      >
        <Tabs.Root
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "menu" | "settings")}
        >
          <Tabs.List
            className={cn(
              "flex gap-4 mb-3 border-b border-white/10 pb-1 text-sm"
            )}
          >
            <Tabs.Trigger
              value="menu"
              className={cn(
                "px-2 py-1 font-semibold data-[state=active]:text-blue-400"
              )}
            >
              Home
            </Tabs.Trigger>
            <Tabs.Trigger
              value="settings"
              className={cn(
                "px-2 py-1 font-semibold data-[state=active]:text-blue-400"
              )}
            >
              Settings
            </Tabs.Trigger>
          </Tabs.List>

          {/* --------------- HOME --------------- */}
          <Tabs.Content value="menu">
            {/* TITLE + STATUS */}
            <div>
              <h3 className={cn("font-bold text-lg mb-1")}>
                {wheel.host_title || wheel.title || "Untitled Wheel"}
              </h3>

              <p className={cn("text-sm mb-3")}>
                <strong>Status:</strong> <StatusBadge />
              </p>

              {/* Pending Button */}
              <div className={cn("flex justify-center mb-3")}>
                <button
                  onClick={() => onOpenModeration(wheel)}
                  className={cn(
                    "px-3 py-1 rounded-md text-sm font-semibold flex items-center gap-1 shadow-md transition",
                    pendingCount > 0
                      ? "bg-yellow-500 hover:bg-yellow-600 text-black"
                      : "bg-gray-600 hover:bg-gray-700 text-white/80"
                  )}
                >
                  🕓 Pending
                  <span
                    className={cn(
                      "px-1.5 py-0.5 rounded-md text-xs font-bold",
                      pendingCount > 0
                        ? "bg-black/70 text-white"
                        : "bg-white/20 text-gray-300"
                    )}
                  >
                    {pendingCount}
                  </span>
                </button>
              </div>

              <p className={cn("text-sm mb-3")}>
                🎟 <strong>{entryCount}</strong> Approved Entrants
              </p>
            </div>

            {/* CONTROLS */}
            <div
              className={cn(
                "flex flex-wrap justify-center gap-2 mt-auto pt-2 border-t border-white/10"
              )}
            >
              {/* REMOTE TOGGLE */}
              <div
                onClick={handleRemoteToggle}
                className={cn(
                  "relative w-14 h-7 rounded-full cursor-pointer transition-all",
                  toggleRemote
                    ? "bg-green-500 shadow-[0_0_12px_rgba(0,255,128,0.6)]"
                    : "bg-gray-600"
                )}
              >
                <span
                  className={cn(
                    "absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-all",
                    toggleRemote ? "translate-x-7" : ""
                  )}
                />
              </div>

              {/* RANDOM PICK */}
              <button
                disabled={!toggleRemote}
                onClick={pickRandomSpinner}
                className={cn(
                  "px-3 py-1 rounded text-sm font-semibold transition",
                  toggleRemote
                    ? "bg-red-600 hover:bg-red-700 text-white"
                    : "bg-gray-500 text-gray-300 cursor-not-allowed"
                )}
              >
                🎯 Pick Random Spinner
              </button>

              {/* PLAY */}
              <button
                onClick={handlePlay}
                className={cn(
                  "px-3 py-1 rounded text-sm font-semibold bg-yellow-600 hover:bg-yellow-700 text-black"
                )}
              >
                ▶ Play
              </button>

              {/* STOP */}
              <button
                onClick={handleStop}
                className={cn(
                  "px-3 py-1 rounded text-sm font-semibold bg-red-600 hover:bg-red-700"
                )}
              >
                ⏹ Stop
              </button>

              {/* LAUNCH */}
              <button
                onClick={handleLaunch}
                className={cn(
                  "px-3 py-1 rounded text-sm font-semibold bg-blue-600 hover:bg-blue-700"
                )}
              >
                🚀 Launch
              </button>

              {/* SPIN */}
              <button
                onClick={handleSpin}
                className={cn(
                  "px-3 py-1 rounded text-sm font-semibold transition",
                  pendingRemote
                    ? "bg-yellow-500 hover:bg-yellow-600 text-black animate-pulse"
                    : "bg-green-600 hover:bg-green-700 text-white"
                )}
              >
                🎰 Spin Now
              </button>

              {/* RELOAD WHEEL */}
              <button
                onClick={async () => {
                  await broadcastReload(wheel.id);

                  try {
                    const popup = window._activePrizeWheel;
                    popup?.location?.reload();
                  } catch {}

                  if (
                    !window._activePrizeWheel ||
                    window._activePrizeWheel.closed
                  ) {
                    const url = `${window.location.origin}/prizewheel/${wheel.id}`;
                    const popup = window.open(
                      url,
                      "_blank",
                      "width=1280,height=800,resizable=yes,scrollbars=yes"
                    );
                    popup?.focus();
                    window._activePrizeWheel = popup;
                  }
                }}
                className={cn(
                  "px-3 py-1 rounded text-sm font-semibold bg-purple-600 hover:bg-purple-700 text-white"
                )}
              >
                🔄 Reload Wheel
              </button>

              {/* OPTIONS */}
              <button
                onClick={() => onOpenOptions(wheel)}
                className={cn(
                  "px-3 py-1 rounded text-sm font-semibold bg-indigo-500 hover:bg-indigo-600"
                )}
              >
                ⚙ Options
              </button>

              {/* DELETE */}
              <button
                onClick={() => onDelete(wheel.id)}
                className={cn(
                  "px-3 py-1 rounded text-sm font-semibold bg-red-700 hover:bg-red-800"
                )}
              >
                ❌ Delete
              </button>
            </div>
          </Tabs.Content>

          {/* --------------- SETTINGS --------------- */}
          <Tabs.Content
            value="settings"
            className={cn("mt-2", "text-left", "text-sm")}
          >
            {/* Single-row: label + Edit MSG + toggle */}
            <div
              className={cn(
                "flex",
                "items-center",
                "justify-between",
                "gap-2"
              )}
            >
              <span
                className={cn(
                  "text-sm",
                  "font-semibold",
                  "whitespace-nowrap"
                )}
              >
                Thank You Popup
              </span>

              <div
                className={cn(
                  "flex",
                  "items-center",
                  "gap-2",
                  "ml-auto"
                )}
              >
                {thankYouPopupEnabled && (
                  <button
                    type="button"
                    onClick={() => setSettingsModalOpen(true)}
                    className={cn(
                      "px-2 py-1 rounded-full text-[0.7rem] font-semibold",
                      "bg-slate-700 hover:bg-slate-600",
                      "whitespace-nowrap"
                    )}
                  >
                    Edit MSG
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleThankYouPopupToggle}
                  className={cn(
                    "relative w-14 h-7 rounded-full cursor-pointer transition-all",
                    thankYouPopupEnabled
                      ? "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.7)]"
                      : "bg-gray-600"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-all",
                      thankYouPopupEnabled ? "translate-x-7" : ""
                    )}
                  />
                </button>
              </div>
            </div>
          </Tabs.Content>
        </Tabs.Root>
      </div>

      {/* Settings Modal for editing the popup message */}
      <PrizeWheelSettingsModal
        open={settingsModalOpen}
        wheel={wheel}
        onClose={() => setSettingsModalOpen(false)}
        onSaved={(patch) => {
          setThankYouPopupEnabled(!!patch.thank_you_popup_enabled);
        }}
      />
    </>
  );
}
