"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";
import * as Tabs from "@radix-ui/react-tabs";
import PrizeWheelSettingsModal from "@/components/PrizeWheelSettingsModal";

declare global {
  interface Window {
    _activePrizeWheel?: any;
    _pw?: {
      spinAuto?: (winnerIndex: number, winner: any) => void;
      spinGo?: () => void;
      spinStop?: (winnerIndex: number, winner: any) => void;
    };
  }
}

interface PrizeWheelCardProps {
  wheel: any;
  onOpenOptions: (wheel: any) => void;
  onDelete: (id: string) => void;
  onSpin: (id: string) => Promise<void>; // legacy, not used here
  onOpenModeration: (wheel: any) => void;
  onPlay: (id: string) => Promise<void>;
  onStop: (id: string) => Promise<void>;
}

async function broadcastToWheel(wheelId: string, event: string, payload: any) {
  await supabase.channel(`prizewheel-${wheelId}`).send({
    type: "broadcast",
    event,
    payload,
  });
}

async function broadcastRemoteSelection(wheelId: string, guestId: string) {
  await broadcastToWheel(wheelId, "remote_spinner_selected", {
    selected_guest_id: guestId,
  });
}

async function broadcastReload(wheelId: string) {
  await broadcastToWheel(wheelId, "reload_trigger", { id: wheelId });
}

type Action = "go" | "stop" | "auto";

const DEFAULT_SMS_TEMPLATE =
  "Congrats {first_name}! You won {wheel_title}. Please come to claim your prize.";

export default function PrizeWheelCard({
  wheel,
  onOpenOptions,
  onDelete,
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

  const [activeTab, setActiveTab] = useState<"menu" | "settings">("menu");

  const [thankYouPopupEnabled, setThankYouPopupEnabled] = useState<boolean>(
    !!wheel.thank_you_popup_enabled
  );
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  // ✅ SMS Winner Settings (NEW)
  const [smsWinnerEnabled, setSmsWinnerEnabled] = useState<boolean>(
    !!wheel.sms_winner_enabled
  );
  const [smsWinnerMessage, setSmsWinnerMessage] = useState<string>(
    (wheel.sms_winner_message ?? "").trim() || DEFAULT_SMS_TEMPLATE
  );
  const [smsDirty, setSmsDirty] = useState(false);
  const [smsSaving, setSmsSaving] = useState(false);

  const [isMobile, setIsMobile] = useState(false);

  // ✅ local session holder (per card)
  const [spinSessionId, setSpinSessionId] = useState<string | null>(null);

  // ✅ simple toast so errors don't crash the page
  const [toast, setToast] = useState<{ text: string; color?: string } | null>(
    null
  );
  function showToast(text: string, color = "rgba(239,68,68,0.95)") {
    setToast({ text, color });
    setTimeout(() => setToast(null), 2800);
  }

  useEffect(() => {
    const check = () => {
      if (typeof window !== "undefined") setIsMobile(window.innerWidth < 768);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    setThankYouPopupEnabled(!!wheel.thank_you_popup_enabled);
  }, [wheel.id, wheel.thank_you_popup_enabled]);

  // ✅ keep SMS state synced if wheel updates from realtime/dashboard refresh
  useEffect(() => {
    setSmsWinnerEnabled(!!wheel.sms_winner_enabled);

    const nextMsg =
      (wheel.sms_winner_message ?? "").trim() || DEFAULT_SMS_TEMPLATE;
    setSmsWinnerMessage(nextMsg);
    setSmsDirty(false);
  }, [wheel.id, wheel.sms_winner_enabled, wheel.sms_winner_message]);

  /* ---------------------------------------------------------
     ✅ FIXED: counts using head:true + count:exact (no 1000 cap)
  --------------------------------------------------------- */
  async function loadCounts() {
    try {
      const [
        { count: approvedCount, error: aErr },
        { count: pendCount, error: pErr },
      ] = await Promise.all([
        supabase
          .from("wheel_entries")
          .select("id", { count: "exact", head: true })
          .eq("wheel_id", wheel.id)
          .eq("status", "approved"),
        supabase
          .from("wheel_entries")
          .select("id", { count: "exact", head: true })
          .eq("wheel_id", wheel.id)
          .eq("status", "pending"),
      ]);

      if (aErr) console.error("loadCounts approved error:", aErr);
      if (pErr) console.error("loadCounts pending error:", pErr);

      setEntryCount(approvedCount ?? 0);
      setPendingCount(pendCount ?? 0);
    } catch (e) {
      console.error("loadCounts exception:", e);
      setEntryCount(0);
      setPendingCount(0);
    }
  }

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
        () => {
          void loadCounts();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [wheel.id]);

  // pulse when spin auto comes in
  useEffect(() => {
    if (!wheel.id) return;

    const ch = supabase
      .channel(`prizewheel-${wheel.id}`)
      .on("broadcast", { event: "spin_auto" }, () => {
        setPendingRemote(true);
        setTimeout(() => setPendingRemote(false), 3000);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(ch);
    };
  }, [wheel.id]);

  async function handleRemoteToggle() {
    try {
      const newEnabled = !toggleRemote;
      setToggleRemote(newEnabled);

      const { error } = await supabase
        .from("prize_wheels")
        .update({
          remote_spin_enabled: newEnabled,
          selected_remote_spinner: null,
        })
        .eq("id", wheel.id);

      if (error) {
        showToast(error.message || "Remote toggle failed");
        // revert
        setToggleRemote(!newEnabled);
        return;
      }

      setSelectedSpinner(null);
    } catch (e: any) {
      showToast(e?.message || "Remote toggle failed");
    }
  }

  async function handleThankYouPopupToggle() {
    try {
      const newEnabled = !thankYouPopupEnabled;
      setThankYouPopupEnabled(newEnabled);

      const { error } = await supabase
        .from("prize_wheels")
        .update({ thank_you_popup_enabled: newEnabled })
        .eq("id", wheel.id);

      if (error) {
        showToast(error.message || "Toggle failed");
        setThankYouPopupEnabled(!newEnabled);
        return;
      }

      if (newEnabled) setSettingsModalOpen(true);
    } catch (e: any) {
      showToast(e?.message || "Toggle failed");
    }
  }

  // ✅ NEW: SMS toggle
  async function handleSmsWinnerToggle() {
    try {
      const newEnabled = !smsWinnerEnabled;
      setSmsWinnerEnabled(newEnabled);

      const patch: any = { sms_winner_enabled: newEnabled };

      // If enabling and message is blank, seed a default so the API can send immediately
      if (newEnabled) {
        const trimmed = (smsWinnerMessage ?? "").trim();
        patch.sms_winner_message = trimmed || DEFAULT_SMS_TEMPLATE;
        if (!trimmed) {
          setSmsWinnerMessage(DEFAULT_SMS_TEMPLATE);
          setSmsDirty(true);
        }
      }

      const { error } = await supabase
        .from("prize_wheels")
        .update(patch)
        .eq("id", wheel.id);

      if (error) {
        showToast(error.message || "Text Winner toggle failed");
        setSmsWinnerEnabled(!newEnabled);
        return;
      }
    } catch (e: any) {
      showToast(e?.message || "Text Winner toggle failed");
    }
  }

  // ✅ NEW: Save SMS template
  async function handleSaveSmsMessage() {
    try {
      setSmsSaving(true);
      const msg = (smsWinnerMessage ?? "").trim();

      if (!msg) {
        showToast("Message cannot be empty");
        setSmsSaving(false);
        return;
      }

      const { error } = await supabase
        .from("prize_wheels")
        .update({ sms_winner_message: msg })
        .eq("id", wheel.id);

      if (error) {
        showToast(error.message || "Failed to save message");
        setSmsSaving(false);
        return;
      }

      setSmsDirty(false);
      showToast("Winner text message saved", "rgba(16,185,129,0.95)");
    } catch (e: any) {
      showToast(e?.message || "Failed to save message");
    } finally {
      setSmsSaving(false);
    }
  }

  /* ---------------------------------------------------------
     ✅ FIXED: random spinner without downloading all approved
     (count -> random offset -> range(offset, offset))
  --------------------------------------------------------- */
  async function pickRandomSpinner() {
    try {
      const { count: approvedCount, error: cErr } = await supabase
        .from("wheel_entries")
        .select("id", { count: "exact", head: true })
        .eq("wheel_id", wheel.id)
        .eq("status", "approved");

      if (cErr) {
        showToast(cErr.message || "Could not count approved");
        return;
      }

      const total = approvedCount ?? 0;
      if (total === 0) {
        alert("No approved entrants yet.");
        return;
      }

      const offset = Math.floor(Math.random() * total);

      const { data, error } = await supabase
        .from("wheel_entries")
        .select("guest_profile_id")
        .eq("wheel_id", wheel.id)
        .eq("status", "approved")
        .order("created_at", { ascending: true })
        .range(offset, offset)
        .maybeSingle();

      if (error) {
        showToast(error.message || "Could not pick spinner");
        return;
      }

      const guestId = (data as any)?.guest_profile_id;
      if (!guestId) {
        showToast("Could not pick spinner (no guest id)");
        return;
      }

      setSelectedSpinner(guestId);

      const { error: updErr } = await supabase
        .from("prize_wheels")
        .update({ selected_remote_spinner: guestId })
        .eq("id", wheel.id);

      if (updErr) {
        showToast(updErr.message || "Could not save spinner");
        return;
      }

      await broadcastRemoteSelection(wheel.id, guestId);
    } catch (e: any) {
      showToast(e?.message || "Could not pick spinner");
    }
  }

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

  async function handleStopWall() {
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

  /* ---------------------------------------------------------
     ✅ FIXED: spin api call no longer crashes UI
     - we catch errors in handlers and show toast
  --------------------------------------------------------- */
  async function callSpinApi(action: Action, extra?: any) {
    const res = await fetch("/api/prizewheel/spin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wheelId: wheel.id, action, ...extra }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      const msg = txt || "Spin API failed";
      const err: any = new Error(msg);
      err.status = res.status;
      throw err;
    }

    return res.json();
  }

  async function handleSpinAuto() {
    try {
      const data = await callSpinApi("auto");
      const winnerIndex = Number(data?.winner_index ?? 0);
      const winner = data?.winner ?? null;

      setSpinSessionId(data?.spinSessionId ?? null);

      try {
        const popup = window._activePrizeWheel;
        popup?._pw?.spinAuto?.(winnerIndex, winner);
      } catch {}

      await broadcastToWheel(wheel.id, "spin_auto", {
        wheelId: wheel.id,
        spinSessionId: data?.spinSessionId ?? null,
        winner_index: winnerIndex,
        winner,
      });
    } catch (e: any) {
      showToast(e?.message || "Spin Auto failed");
    }
  }

  async function handleSpinGo() {
    try {
      const data = await callSpinApi("go");
      setSpinSessionId(data?.spinSessionId ?? null);

      try {
        const popup = window._activePrizeWheel;
        popup?._pw?.spinGo?.();
      } catch {}

      await broadcastToWheel(wheel.id, "spin_go", {
        wheelId: wheel.id,
        spinSessionId: data?.spinSessionId ?? null,
      });
    } catch (e: any) {
      showToast(e?.message || "Spin GO failed");
    }
  }

  async function handleSpinStop() {
    try {
      let session = spinSessionId;

      // fallback: if state lost, pull from DB
      if (!session) {
        const { data: w, error } = await supabase
          .from("prize_wheels")
          .select("spin_session_id")
          .eq("id", wheel.id)
          .maybeSingle();

        if (error) {
          showToast(error.message || "Could not load spin session");
          return;
        }

        session = (w as any)?.spin_session_id ?? null;
      }

      if (!session) {
        alert("No active Spin GO session yet. Press Spin GO first.");
        return;
      }

      const data = await callSpinApi("stop", { spinSessionId: session });
      const winnerIndex = Number(data?.winner_index ?? 0);
      const winner = data?.winner ?? null;

      try {
        const popup = window._activePrizeWheel;
        popup?._pw?.spinStop?.(winnerIndex, winner);
      } catch {}

      await broadcastToWheel(wheel.id, "spin_stop", {
        wheelId: wheel.id,
        spinSessionId: session,
        winner_index: winnerIndex,
        winner,
      });
    } catch (e: any) {
      showToast(e?.message || "Spin STOP failed");
    }
  }

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
            className={cn("flex gap-4 mb-3 border-b border-white/10 pb-1 text-sm")}
          >
            <Tabs.Trigger
              value="menu"
              className={cn("px-2 py-1 font-semibold data-[state=active]:text-blue-400")}
            >
              Home
            </Tabs.Trigger>
            <Tabs.Trigger
              value="settings"
              className={cn("px-2 py-1 font-semibold data-[state=active]:text-blue-400")}
            >
              Settings
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="menu">
            <div>
              <h3 className={cn("font-bold text-lg mb-1")}>
                {wheel.host_title || wheel.title || "Untitled Wheel"}
              </h3>

              <p className={cn("text-sm mb-3")}>
                <strong>Status:</strong> <StatusBadge />
              </p>

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

            <div
              className={cn(
                "flex flex-wrap justify-center gap-2 mt-auto pt-2 border-t border-white/10"
              )}
            >
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

              <button
                onClick={handlePlay}
                className={cn(
                  "px-3 py-1 rounded text-sm font-semibold bg-yellow-600 hover:bg-yellow-700 text-black"
                )}
              >
                ▶ Play
              </button>

              <button
                onClick={handleStopWall}
                className={cn(
                  "px-3 py-1 rounded text-sm font-semibold bg-red-600 hover:bg-red-700"
                )}
              >
                ⏹ Stop
              </button>

              <button
                type="button"
                onClick={isMobile ? undefined : handleLaunch}
                disabled={isMobile}
                className={cn(
                  "px-3 py-1 rounded text-sm font-semibold",
                  "bg-blue-600 hover:bg-blue-700",
                  isMobile && "opacity-40 cursor-not-allowed hover:bg-blue-600"
                )}
              >
                🚀 Launch
              </button>

              {/* ✅ Spin Auto */}
              <button
                onClick={handleSpinAuto}
                className={cn(
                  "px-3 py-1 rounded text-sm font-semibold transition",
                  pendingRemote
                    ? "bg-yellow-500 hover:bg-yellow-600 text-black animate-pulse"
                    : "bg-green-600 hover:bg-green-700 text-white"
                )}
              >
                🎰 Spin Auto
              </button>

              {/* ✅ Spin GO */}
              <button
                onClick={handleSpinGo}
                className={cn(
                  "px-3 py-1 rounded text-sm font-semibold bg-sky-600 hover:bg-sky-700 text-white"
                )}
              >
                🌀 Spin GO
              </button>

              {/* ✅ Spin Stop */}
              <button
                onClick={handleSpinStop}
                className={cn(
                  "px-3 py-1 rounded text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-black"
                )}
              >
                🛑 Spin Stop
              </button>

              <button
                onClick={async () => {
                  await broadcastReload(wheel.id);

                  try {
                    const popup = window._activePrizeWheel;
                    popup?.location?.reload();
                  } catch {}

                  if (!window._activePrizeWheel || window._activePrizeWheel.closed) {
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

              <button
                onClick={() => onOpenOptions(wheel)}
                className={cn(
                  "px-3 py-1 rounded text-sm font-semibold bg-indigo-500 hover:bg-indigo-600"
                )}
              >
                ⚙ Options
              </button>

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

          <Tabs.Content
            value="settings"
            className={cn("mt-2", "text-left", "text-sm")}
          >
            {/* =========================
                Thank You Popup (existing)
            ========================== */}
            <div className={cn("flex", "items-center", "justify-between", "gap-2")}>
              <span className={cn("text-sm", "font-semibold", "whitespace-nowrap")}>
                Thank You Popup
              </span>

              <div className={cn("flex", "items-center", "gap-2", "ml-auto")}>
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

            {/* =========================
                Text Winner (NEW)
            ========================== */}
            <div className={cn("mt-4 pt-3 border-t border-white/10")}>
              <div className={cn("flex items-center justify-between gap-2")}>
                <span className={cn("text-sm font-semibold whitespace-nowrap")}>
                  Text Winner
                </span>

                <div className={cn("flex items-center gap-2 ml-auto")}>
                  <button
                    type="button"
                    onClick={handleSmsWinnerToggle}
                    className={cn(
                      "relative w-14 h-7 rounded-full cursor-pointer transition-all",
                      smsWinnerEnabled
                        ? "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.7)]"
                        : "bg-gray-600"
                    )}
                    title="Enable texting a winner when Spin Auto / Spin Stop selects a winner"
                  >
                    <span
                      className={cn(
                        "absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-all",
                        smsWinnerEnabled ? "translate-x-7" : ""
                      )}
                    />
                  </button>
                </div>
              </div>

              <div className={cn("mt-2 text-xs text-white/70")}>
                Sends a text to the winner when a winner is selected (Auto or Stop).<br />
                Tokens: <span className="font-mono">{`{first_name}`}</span>,{" "}
                <span className="font-mono">{`{last_name}`}</span>,{" "}
                <span className="font-mono">{`{wheel_title}`}</span>
              </div>

              {smsWinnerEnabled && (
                <div className={cn("mt-3")}>
                  <textarea
                    value={smsWinnerMessage}
                    onChange={(e) => {
                      setSmsWinnerMessage(e.target.value);
                      setSmsDirty(true);
                    }}
                    rows={4}
                    className={cn(
                      "w-full rounded-lg p-2 text-sm",
                      "bg-black/40 text-white border border-white/15",
                      "focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
                    )}
                    placeholder={DEFAULT_SMS_TEMPLATE}
                  />

                  <div className={cn("flex items-center justify-between mt-2 gap-2")}>
                    <div className={cn("text-[0.7rem] text-white/60")}>
                      Example: Congrats {`{first_name}`}! You won {`{wheel_title}`}.
                    </div>

                    <button
                      type="button"
                      disabled={!smsDirty || smsSaving}
                      onClick={handleSaveSmsMessage}
                      className={cn(
                        "px-3 py-1 rounded-md text-sm font-semibold transition",
                        smsDirty && !smsSaving
                          ? "bg-emerald-500 hover:bg-emerald-600 text-black"
                          : "bg-gray-600 text-gray-300 cursor-not-allowed"
                      )}
                    >
                      {smsSaving ? "Saving…" : "Save Message"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </Tabs.Content>
        </Tabs.Root>
      </div>

      <PrizeWheelSettingsModal
        open={settingsModalOpen}
        wheel={wheel}
        onClose={() => setSettingsModalOpen(false)}
        onSaved={(patch) => {
          setThankYouPopupEnabled(!!patch.thank_you_popup_enabled);
        }}
      />

      {/* ✅ Toast */}
      {toast && (
        <div
          className={cn(
            "fixed bottom-6 left-1/2 -translate-x-1/2 z-[99999]",
            "px-4 py-2 rounded-lg font-semibold text-white shadow-lg"
          )}
          style={{ background: toast.color || "rgba(239,68,68,0.95)" }}
        >
          {toast.text}
        </div>
      )}
    </>
  );
}
