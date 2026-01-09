"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { getFanWallsByHost } from "@/lib/actions/fan_walls";

import DashboardHeader from "./components/DashboardHeader";
import FanWallGrid from "./components/FanWallGrid";
import PrizeWheelGrid from "./components/PrizeWheelGrid";
import PollGrid from "./components/PollGrid";
import TriviaGrid from "./components/TriviaGrid";
import SlideshowGrid from "./components/SlideshowGrid";

import BasketballGrid from "./components/BasketballGrid";
import CreateBasketballGameModal from "@/components/CreateBasketballGameModal";
import BasketballOptionsModal from "@/components/BasketballOptionsModal";

import CreateFanWallModal from "@/components/CreateFanWallModal";
import CreatePrizeWheelModal from "@/components/CreatePrizeWheelModal";
import CreatePollModal from "@/components/CreatePollModal";
import TriviaCreationModal from "@/components/TriviaCreationModal";
import CreateSlideShowModal from "@/components/CreateSlideShowModal";

import OptionsModalPoll from "@/components/OptionsModalPoll";
import OptionsModalFanWall from "@/components/OptionsModalFanWall";
import OptionsModalPrizeWheel from "@/components/OptionsModalPrizeWheel";
import OptionsModalSlideshow from "@/components/OptionsModalSlideShow";

import AdsManagerModal from "@/components/AdsManagerModal";
import HostProfilePanel from "@/components/HostProfilePanel";

import CreateNewAdModal from "@/components/CreateNewAdModal";
import AdBuilderModal from "@/components/AdBuilderModal";

import TriviaModerationModal from "@/components/TriviaModerationModal";

import { cn } from "@/lib/utils";

const supabase = getSupabaseClient();

type GateState = "loading" | "ok" | "verify" | "subscribe";

function isEmailVerified(user: any) {
  return !!(user?.email_confirmed_at || user?.confirmed_at);
}

function isStripeStatusActive(status: any) {
  const s = String(status || "").toLowerCase();
  return s === "active" || s === "trialing";
}

/**
 * Supports multiple possible schemas:
 * - subscription_active (boolean)
 * - stripe_status (text)
 * - subscription_status (text)
 */
function hostHasActiveSub(hostRow: any) {
  if (!hostRow) return false;
  if (hostRow.subscription_active === true) return true;
  if (isStripeStatusActive(hostRow.stripe_status)) return true;
  if (isStripeStatusActive(hostRow.subscription_status)) return true;
  return false;
}

export default function DashboardPage() {
  const [host, setHost] = useState<any>(null);

  const [fanWalls, setFanWalls] = useState<any[]>([]);
  const [prizeWheels, setPrizeWheels] = useState<any[]>([]);
  const [polls, setPolls] = useState<any[]>([]);
  const [triviaList, setTriviaList] = useState<any[]>([]);
  const [slideshows, setSlideshows] = useState<any[]>([]);
  const [basketballGames, setBasketballGames] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);

  // Gate
  const [gate, setGate] = useState<GateState>("loading");
  const [gateEmail, setGateEmail] = useState<string>("");
  const [gateMsg, setGateMsg] = useState<string>("");

  // Modals
  const [isFanWallModalOpen, setFanWallModalOpen] = useState(false);
  const [isPrizeWheelModalOpen, setPrizeWheelModalOpen] = useState(false);
  const [isPollModalOpen, setPollModalOpen] = useState(false);
  const [isTriviaModalOpen, setTriviaModalOpen] = useState(false);
  const [isSlideShowModalOpen, setSlideShowModalOpen] = useState(false);
  const [isBasketballModalOpen, setBasketballModalOpen] = useState(false);

  const [isAdsModalOpen, setAdsModalOpen] = useState(false);

  const [selectedWall, setSelectedWall] = useState<any | null>(null);
  const [selectedPrizeWheel, setSelectedPrizeWheel] = useState<any | null>(null);
  const [selectedPoll, setSelectedPoll] = useState<any | null>(null);
  const [selectedSlideshow, setSelectedSlideshow] = useState<any | null>(null);

  // Basketball options
  const [selectedBasketballGame, setSelectedBasketballGame] = useState<any | null>(null);
  const [isBasketballOptionsOpen, setBasketballOptionsOpen] = useState(false);

  // Ads Builder
  const [isCreateAdModalOpen, setCreateAdModalOpen] = useState(false);
  const [builderAdId, setBuilderAdId] = useState<string | null>(null);
  const [showBuilderModal, setShowBuilderModal] = useState(false);

  // Trivia moderation
  const [selectedTriviaForModeration, setSelectedTriviaForModeration] = useState<any | null>(null);

  const loadedRef = useRef(false);

  const qs = useMemo(() => {
    if (typeof window === "undefined") return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  }, []);

  const checkoutSuccess = qs.get("success") === "true";
  const checkoutCanceled = qs.get("canceled") === "true";

  async function refreshAll(hostId: string) {
    const [walls, wheels, pollsData, triviaData, slideshowsData, basketballData] =
      await Promise.all([
        getFanWallsByHost(hostId),
        supabase.from("prize_wheels").select("*").eq("host_id", hostId).order("created_at", { ascending: false }),
        supabase.from("polls").select("*").eq("host_id", hostId).order("created_at", { ascending: false }),
        supabase.from("trivia_cards").select("*").eq("host_id", hostId).order("created_at", { ascending: false }),
        supabase.from("slide_shows").select("*").eq("host_id", hostId).order("created_at", { ascending: false }),
        supabase.from("bb_games").select("*").eq("host_id", hostId).order("created_at", { ascending: false }),
      ]);

    setFanWalls(walls);
    setPrizeWheels(wheels.data || []);
    setPolls(pollsData.data || []);
    setTriviaList(triviaData.data || []);
    setSlideshows(slideshowsData.data || []);
    setBasketballGames(basketballData.data || []);
  }

  // ✅ PATCHED: silent refresh option to prevent flicker
  async function loadHostAndGate(opts?: { silent?: boolean }) {
    const silent = !!opts?.silent;

    // Only show full-screen loading on initial load
    if (!silent) {
      setGate("loading");
      setGateMsg("");
      setLoading(true);
    }

    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;

    if (!user) {
      setGate("verify");
      setGateMsg("You are not logged in.");
      setLoading(false);
      return;
    }

    setGateEmail(user.email || "");

    // Gate 1: verify email
    if (!isEmailVerified(user)) {
      setGate("verify");
      setLoading(false);
      return;
    }

    // Load host by auth_id
    let { data: hostRow, error: hostErr } = await supabase
      .from("hosts")
      .select("*")
      .eq("auth_id", user.id)
      .maybeSingle();

    if (hostErr) console.error("Host load error:", hostErr);

    // Auto-create host row (only using columns that exist in YOUR table)
    if (!hostRow) {
      const email = user.email || "unknown@example.com";
      const username = email.includes("@") ? email.split("@")[0] : "newuser";

      const newHost = {
        id: crypto.randomUUID(),
        auth_id: user.id,
        email,
        username,
        venue_name: "My Venue",
        role: "host",
        created_at: new Date().toISOString(),
      };

      const { data: inserted, error: insErr } = await supabase
        .from("hosts")
        .insert([newHost])
        .select()
        .maybeSingle();

      if (insErr) console.error("Host auto-create failed:", insErr);

      hostRow = inserted || null;
    }

    setHost(hostRow);

    // Gate 2: subscription
    if (!hostHasActiveSub(hostRow)) {
      setGate("subscribe");
      setLoading(false);
      return;
    }

    // unlocked
    setGate("ok");

    // Don't constantly clear+re-set on silent refresh
    if (checkoutSuccess) setGateMsg("✅ Subscription success! Updating your dashboard…");
    else if (checkoutCanceled) setGateMsg("⚠️ Checkout canceled.");

    if (hostRow?.id) await refreshAll(hostRow.id);

    setLoading(false);
  }

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    loadHostAndGate().catch((err) => {
      console.error("❌ Dashboard load error:", err?.message || err);
      setLoading(false);
      setGate("verify");
      setGateMsg("Dashboard failed to load.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After Stripe success, webhook may take a moment -> light polling (silent to prevent flicker)
  useEffect(() => {
    if (!checkoutSuccess) return;

    let tries = 0;
    const id = setInterval(async () => {
      tries++;
      try {
        await loadHostAndGate({ silent: true });
      } catch {}
      if (tries >= 10) clearInterval(id);
    }, 1000);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutSuccess]);

  // Guard wrapper
  function requireUnlocked(fn: () => void) {
    if (gate !== "ok") {
      alert(gate === "verify" ? "Please verify your email first." : "Please subscribe to unlock creation.");
      return;
    }
    fn();
  }

  async function resendVerificationEmail() {
    try {
      if (!gateEmail) return;

      const payload: any = { type: "signup", email: gateEmail };
      payload.options = { emailRedirectTo: `${window.location.origin}/login` };

      await (supabase.auth as any).resend(payload);
      setGateMsg("✅ Verification email re-sent. Check your inbox.");
    } catch (e: any) {
      console.error(e);
      setGateMsg(e?.message || "Failed to resend.");
    }
  }

  // ✅ checkout starter
  async function startCheckout() {
    try {
      const hostId = host?.id;
      if (!hostId) {
        alert("Host profile not ready yet (host.id missing). Try refresh.");
        return;
      }

      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostId }),
      });

      const contentType = res.headers.get("content-type") || "";
      const payload = contentType.includes("application/json")
        ? await res.json().catch(() => null)
        : await res.text().catch(() => "");

      console.log("checkout response:", {
        status: res.status,
        ok: res.ok,
        contentType,
        payload,
      });

      if (!res.ok) {
        const msg =
          typeof payload === "string"
            ? payload.slice(0, 800)
            : (payload as any)?.error ||
              (payload as any)?.detail ||
              JSON.stringify(payload);

        alert(`Checkout failed (${res.status}):\n\n${msg}`);
        return;
      }

      const url = (payload as any)?.url;
      if (!url) {
        alert("Checkout response missing url:\n\n" + JSON.stringify(payload, null, 2));
        return;
      }

      window.location.href = url;
    } catch (e: any) {
      console.error("startCheckout error:", e);
      alert(e?.message || "Checkout failed.");
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  // Loading
  if (loading || gate === "loading") {
    return (
      <div className={cn("flex items-center justify-center h-screen bg-black text-white")}>
        <p>Loading Dashboard…</p>
      </div>
    );
  }

  // Gate: Verify email
  if (gate === "verify") {
    return (
      <div className={cn("min-h-screen bg-[#0b111d] text-white flex items-center justify-center p-8")}>
        <div className={cn("w-full max-w-lg rounded-2xl border border-white/10 bg-white/5 p-6 text-center")}>
          <h1 className={cn("text-2xl font-semibold")}>Verify your email</h1>
          <p className={cn("mt-3 text-white/80")}>
            We sent a verification link to{" "}
            <span className="font-semibold">{gateEmail || "your email"}</span>.
            <br />
            Please verify to unlock your dashboard.
          </p>

          {gateMsg ? <div className={cn("mt-3 text-sm text-white/80")}>{gateMsg}</div> : null}

          <div className={cn("mt-5 flex flex-col gap-3")}>
            <button
              onClick={resendVerificationEmail}
              className={cn("w-full rounded-xl bg-blue-600 hover:bg-blue-700 font-semibold py-3")}
            >
              Resend Verification Email
            </button>

            <button
              onClick={() => loadHostAndGate({ silent: true })}
              className={cn("w-full rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 font-semibold py-3")}
            >
              I Verified — Refresh
            </button>

            <button
              onClick={logout}
              className={cn("w-full rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 font-semibold py-3")}
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Gate: Subscribe
  if (gate === "subscribe") {
    return (
      <div className={cn("min-h-screen bg-[#0b111d] text-white flex flex-col items-center p-8")}>
        <div className={cn("w-full flex items-center justify-between mb-6 max-w-4xl")}>
          <h1 className={cn("text-3xl font-semibold")}>Host Dashboard</h1>
          <HostProfilePanel host={host} setHost={setHost} />
        </div>

        <div className={cn("w-full max-w-lg rounded-2xl border border-white/10 bg-white/5 p-6 text-center mt-10")}>
          <h2 className={cn("text-2xl font-semibold")}>Subscription Required</h2>
          <p className={cn("mt-3 text-white/80")}>
            You’re verified — now you just need an active subscription to create walls and games.
          </p>

          <div className={cn("mt-2 text-sm text-white/70")}>
            Status:{" "}
            <span className="font-semibold">
              {String(
                host?.stripe_status ||
                  host?.subscription_status ||
                  (host?.subscription_active ? "active" : "inactive") ||
                  "inactive"
              )}
            </span>
          </div>

          {gateMsg ? <div className={cn("mt-3 text-sm text-white/80")}>{gateMsg}</div> : null}

          <div className={cn("mt-5 flex flex-col gap-3")}>
            <button
              onClick={startCheckout}
              className={cn("w-full rounded-xl bg-green-600 hover:bg-green-700 font-semibold py-3")}
            >
              Subscribe Now
            </button>

            <button
              onClick={() => loadHostAndGate({ silent: true })}
              className={cn("w-full rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 font-semibold py-3")}
            >
              Refresh Status
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ✅ Unlocked dashboard
  return (
    <div
      className={cn("min-h-screen bg-[#0b111d] text-white flex flex-col items_center p-8").replace(
        "items_center",
        "items-center"
      )}
    >
      <div className={cn("w-full flex items-center justify-between mb-2")}>
        <h1 className={cn("text-3xl font-semibold")}>Host Dashboard</h1>
        <HostProfilePanel host={host} setHost={setHost} />
      </div>

      {gateMsg ? (
        <div className={cn("w-full max-w-6xl mb-4 text-sm text-white/80")}>{gateMsg}</div>
      ) : null}

      <DashboardHeader
        onCreateFanWall={() => requireUnlocked(() => setFanWallModalOpen(true))}
        onCreatePoll={() => requireUnlocked(() => setPollModalOpen(true))}
        onCreatePrizeWheel={() => requireUnlocked(() => setPrizeWheelModalOpen(true))}
        onOpenAds={() => requireUnlocked(() => setAdsModalOpen(true))}
        onCreateTriviaGame={() => requireUnlocked(() => setTriviaModalOpen(true))}
        onCreateNewAd={() => requireUnlocked(() => setCreateAdModalOpen(true))}
        onCreateSlideShow={() => requireUnlocked(() => setSlideShowModalOpen(true))}
        onCreateBasketballGame={() => requireUnlocked(() => setBasketballModalOpen(true))}
      />

      <TriviaGrid
        trivia={triviaList}
        host={host}
        refreshTrivia={async () => {
          if (!host?.id) return;
          const { data } = await supabase
            .from("trivia_cards")
            .select("*")
            .eq("host_id", host.id)
            .order("created_at", { ascending: false });
          setTriviaList(data || []);
        }}
        onOpenOptions={() => {}}
        onOpenModeration={(t) => setSelectedTriviaForModeration(t)}
      />

      <div className={cn("w_full max-w-6xl mt-10").replace("w_full", "w-full")}>
        <SlideshowGrid
          slideshows={slideshows}
          host={host}
          refreshSlideshows={async () => {
            if (!host?.id) return;
            const { data } = await supabase
              .from("slide_shows")
              .select("*")
              .eq("host_id", host.id)
              .order("created_at", { ascending: false });
            setSlideshows(data || []);
          }}
          onOpenOptions={setSelectedSlideshow}
        />
      </div>

      <div className={cn("w-full max-w-6xl mt-10")}>
        <FanWallGrid
          walls={fanWalls}
          host={host}
          refreshFanWalls={async () => {
            if (!host?.id) return;
            const updated = await getFanWallsByHost(host.id);
            setFanWalls(updated);
          }}
          onOpenOptions={setSelectedWall}
        />
      </div>

      <div className={cn("w-full max-w-6xl mt-10")}>
        <PrizeWheelGrid
          wheels={prizeWheels}
          host={host}
          refreshPrizeWheels={async () => {
            if (!host?.id) return;
            const { data } = await supabase
              .from("prize_wheels")
              .select("*")
              .eq("host_id", host.id)
              .order("created_at", { ascending: false });
            setPrizeWheels(data || []);
          }}
          onOpenOptions={setSelectedPrizeWheel}
        />
      </div>

      <div className={cn("w-full max-w-6xl mt-10")}>
        <BasketballGrid
          games={basketballGames}
          host={host}
          refreshBasketballGames={async () => {
            if (!host?.id) return;
            const { data } = await supabase
              .from("bb_games")
              .select("*")
              .eq("host_id", host.id)
              .order("created_at", { ascending: false });
            setBasketballGames(data || []);
          }}
          onOpenOptions={(game: any) => {
            setSelectedBasketballGame(game);
            setBasketballOptionsOpen(true);
          }}
        />
      </div>

      <div className={cn("w-full max-w-6xl mt-10")}>
        <PollGrid
          host={host}
          polls={polls}
          refreshPolls={async () => {
            if (!host?.id) return;
            const { data } = await supabase
              .from("polls")
              .select("*")
              .eq("host_id", host.id)
              .order("created_at", { ascending: false });
            setPolls(data || []);
          }}
          onOpenOptions={setSelectedPoll}
        />
      </div>

      {/* CREATION MODALS */}
      <CreateFanWallModal
        isOpen={isFanWallModalOpen}
        onClose={() => setFanWallModalOpen(false)}
        hostId={host?.id}
        refreshFanWalls={async () => {
          if (!host?.id) return;
          const updated = await getFanWallsByHost(host.id);
          setFanWalls(updated);
        }}
      />

      <CreatePrizeWheelModal
        isOpen={isPrizeWheelModalOpen}
        onClose={() => setPrizeWheelModalOpen(false)}
        hostId={host?.id}
        refreshPrizeWheels={async () => {
          if (!host?.id) return;
          const { data } = await supabase
            .from("prize_wheels")
            .select("*")
            .eq("host_id", host.id)
            .order("created_at", { ascending: false });
          setPrizeWheels(data || []);
        }}
      />

      <CreatePollModal
        isOpen={isPollModalOpen}
        onClose={() => setPollModalOpen(false)}
        hostId={host?.id}
        refreshPolls={async () => {
          if (!host?.id) return;
          const { data } = await supabase
            .from("polls")
            .select("*")
            .eq("host_id", host.id)
            .order("created_at", { ascending: false });
          setPolls(data || []);
        }}
        onPollCreated={setSelectedPoll}
      />

      <TriviaCreationModal
        isOpen={isTriviaModalOpen}
        onClose={() => setTriviaModalOpen(false)}
        hostId={host?.id}
        refreshTrivia={async () => {
          if (!host?.id) return;
          const { data } = await supabase
            .from("trivia_cards")
            .select("*")
            .eq("host_id", host.id)
            .order("created_at", { ascending: false });
          setTriviaList(data || []);
        }}
        onGenerateTrivia={async () => {}}
      />

      <CreateSlideShowModal
        isOpen={isSlideShowModalOpen}
        onClose={() => setSlideShowModalOpen(false)}
        hostId={host?.id}
        refreshSlideshows={async () => {
          if (!host?.id) return;
          const { data } = await supabase
            .from("slide_shows")
            .select("*")
            .eq("host_id", host.id)
            .order("created_at", { ascending: false });
          setSlideshows(data || []);
        }}
      />

      <CreateBasketballGameModal
        isOpen={isBasketballModalOpen}
        onClose={() => setBasketballModalOpen(false)}
        hostId={host?.id}
        refreshBasketballGames={async () => {
          if (!host?.id) return;
          const { data } = await supabase
            .from("bb_games")
            .select("*")
            .eq("host_id", host.id)
            .order("created_at", { ascending: false });
          setBasketballGames(data || []);
        }}
      />

      {/* OPTIONS MODALS */}
      {selectedWall && (
        <OptionsModalFanWall
          wall={selectedWall}
          hostId={host?.id}
          onClose={() => setSelectedWall(null)}
          refreshFanWalls={async () => {
            if (!host?.id) return;
            const updated = await getFanWallsByHost(host.id);
            setFanWalls(updated);
          }}
        />
      )}

      {selectedPrizeWheel && (
        <OptionsModalPrizeWheel
          event={selectedPrizeWheel}
          hostId={host?.id}
          onClose={() => setSelectedPrizeWheel(null)}
          refreshPrizeWheels={async () => {
            if (!host?.id) return;
            const { data } = await supabase
              .from("prize_wheels")
              .select("*")
              .eq("host_id", host.id)
              .order("created_at", { ascending: false });
            setPrizeWheels(data || []);
          }}
        />
      )}

      {selectedPoll && (
        <OptionsModalPoll
          poll={selectedPoll}
          hostId={host?.id}
          onClose={() => setSelectedPoll(null)}
          refreshPolls={async () => {
            if (!host?.id) return;
            const { data } = await supabase
              .from("polls")
              .select("*")
              .eq("host_id", host.id)
              .order("created_at", { ascending: false });
            setPolls(data || []);
          }}
        />
      )}

      {selectedSlideshow && (
        <OptionsModalSlideshow
          show={selectedSlideshow}
          hostId={host?.id}
          onClose={() => setSelectedSlideshow(null)}
          refreshSlideshows={async () => {
            if (!host?.id) return;
            const { data } = await supabase
              .from("slide_shows")
              .select("*")
              .eq("host_id", host.id)
              .order("created_at", { ascending: false });
            setSlideshows(data || []);
          }}
        />
      )}

      {selectedBasketballGame && (
        <BasketballOptionsModal
          game={selectedBasketballGame}
          isOpen={isBasketballOptionsOpen}
          onClose={() => {
            setBasketballOptionsOpen(false);
            setSelectedBasketballGame(null);
          }}
          refreshBasketballGames={async () => {
            if (!host?.id) return;
            const { data } = await supabase
              .from("bb_games")
              .select("*")
              .eq("host_id", host.id)
              .order("created_at", { ascending: false });
            setBasketballGames(data || []);
          }}
        />
      )}

      {isAdsModalOpen && <AdsManagerModal host={host} onClose={() => setAdsModalOpen(false)} />}

      {isCreateAdModalOpen && (
        <CreateNewAdModal
          hostId={host?.id}
          onClose={() => setCreateAdModalOpen(false)}
          onCreated={(id) => {
            setBuilderAdId(id);
            setShowBuilderModal(true);
          }}
        />
      )}

      {showBuilderModal && builderAdId && (
        <AdBuilderModal
          adId={builderAdId}
          hostId={host?.id}
          onClose={() => setShowBuilderModal(false)}
        />
      )}

      {selectedTriviaForModeration && (
        <TriviaModerationModal
          triviaId={selectedTriviaForModeration.id}
          onClose={() => setSelectedTriviaForModeration(null)}
        />
      )}
    </div>
  );
}
