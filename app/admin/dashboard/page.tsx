"use client";

import { useState, useEffect, useRef } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { getFanWallsByHost } from "@/lib/actions/fan_walls";

import DashboardHeader from "./components/DashboardHeader";
import FanWallGrid from "./components/FanWallGrid";
import PrizeWheelGrid from "./components/PrizeWheelGrid";
import PollGrid from "./components/PollGrid";
import TriviaGrid from "./components/TriviaGrid";
import SlideshowGrid from "./components/SlideshowGrid";

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

type GateState = "loading" | "ok" | "verify";

function isEmailVerified(user: any) {
  return !!(user?.email_confirmed_at || user?.confirmed_at);
}

export default function DashboardPage() {
  const [host, setHost] = useState<any>(null);

  const [fanWalls, setFanWalls] = useState<any[]>([]);
  const [prizeWheels, setPrizeWheels] = useState<any[]>([]);
  const [polls, setPolls] = useState<any[]>([]);
  const [triviaList, setTriviaList] = useState<any[]>([]);
  const [slideshows, setSlideshows] = useState<any[]>([]);
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
  const [isAdsModalOpen, setAdsModalOpen] = useState(false);

  const [selectedWall, setSelectedWall] = useState<any | null>(null);
  const [selectedPrizeWheel, setSelectedPrizeWheel] = useState<any | null>(null);
  const [selectedPoll, setSelectedPoll] = useState<any | null>(null);
  const [selectedSlideshow, setSelectedSlideshow] = useState<any | null>(null);

  // Ads Builder
  const [isCreateAdModalOpen, setCreateAdModalOpen] = useState(false);
  const [builderAdId, setBuilderAdId] = useState<string | null>(null);
  const [showBuilderModal, setShowBuilderModal] = useState(false);

  // Trivia moderation
  const [selectedTriviaForModeration, setSelectedTriviaForModeration] = useState<any | null>(null);

  const loadedRef = useRef(false);

  async function refreshAll(hostId: string) {
    const [walls, wheels, pollsData, triviaData, slideshowsData] =
      await Promise.all([
        getFanWallsByHost(hostId),
        supabase
          .from("prize_wheels")
          .select("*")
          .eq("host_id", hostId)
          .order("created_at", { ascending: false }),
        supabase
          .from("polls")
          .select("*")
          .eq("host_id", hostId)
          .order("created_at", { ascending: false }),
        supabase
          .from("trivia_cards")
          .select("*")
          .eq("host_id", hostId)
          .order("created_at", { ascending: false }),
        supabase
          .from("slide_shows")
          .select("*")
          .eq("host_id", hostId)
          .order("created_at", { ascending: false }),
      ]);

    setFanWalls(walls);
    setPrizeWheels(wheels.data || []);
    setPolls(pollsData.data || []);
    setTriviaList(triviaData.data || []);
    setSlideshows(slideshowsData.data || []);
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

    // Support accounts created before signup began saving auth_id.
    if (!hostRow) {
      const { data: legacyHost, error: legacyHostErr } = await supabase
        .from("hosts")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (legacyHostErr) console.error("Legacy host load error:", legacyHostErr);

      if (legacyHost) {
        const { data: linkedHost, error: linkErr } = await supabase
          .from("hosts")
          .update({ auth_id: user.id })
          .eq("id", legacyHost.id)
          .select()
          .maybeSingle();

        if (linkErr) console.error("Legacy host link failed:", linkErr);
        hostRow = linkedHost || legacyHost;
      }
    }

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

    // Email verification is the only access gate.
    setGate("ok");

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

  // Guard wrapper
  function requireUnlocked(fn: () => void) {
    if (gate !== "ok") {
      alert("Please verify your email first.");
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

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  // ✅ FIX: Create Trivia must call the *real* generator route: /trivia/ai-generate
  // (Your regen flow already uses this same endpoint.) :contentReference[oaicite:2]{index=2}
  async function handleGenerateTrivia(payload: any) {
    const hostId = host?.id;
    if (!hostId) {
      throw new Error("Host profile not ready yet (host.id missing).");
    }

    const res = await fetch("/trivia/ai-generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        hostId, // force correct hostId
      }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.success) {
      // Route returns { success:false, error: "..." } on errors :contentReference[oaicite:3]{index=3}
      const msg =
        data?.error ||
        `Generate trivia failed (${res.status}).`;
      throw new Error(msg);
    }

    // Refresh list + close modal
    const { data: cards, error } = await supabase
      .from("trivia_cards")
      .select("*")
      .eq("host_id", hostId)
      .order("created_at", { ascending: false });

    if (error) console.error("❌ refreshTrivia after generate error:", error);
    setTriviaList(cards || []);

    setTriviaModalOpen(false);
    setGateMsg("✅ Trivia created!");
  }

  // Loading
  if (loading || gate === "loading") {
    return (
      <div
        className={cn(
          "flex items-center justify-center h-screen bg-black text-white"
        )}
      >
        <p>Loading Dashboard…</p>
      </div>
    );
  }

  // Gate: Verify email
  if (gate === "verify") {
    return (
      <div
        className={cn(
          "min-h-screen bg-[#0b111d] text-white flex items-center justify-center p-8"
        )}
      >
        <div
          className={cn(
            "w-full max-w-lg rounded-2xl border border-white/10 bg-white/5 p-6 text-center"
          )}
        >
          <h1 className={cn("text-2xl font-semibold")}>Verify your email</h1>
          <p className={cn("mt-3 text-white/80")}>
            We sent a verification link to{" "}
            <span className="font-semibold">
              {gateEmail || "your email"}
            </span>
            .
            <br />
            Please verify to unlock your dashboard.
          </p>

          {gateMsg ? (
            <div className={cn("mt-3 text-sm text-white/80")}>{gateMsg}</div>
          ) : null}

          <div className={cn("mt-5 flex flex-col gap-3")}>
            <button
              onClick={resendVerificationEmail}
              className={cn(
                "w-full rounded-xl bg-blue-600 hover:bg-blue-700 font-semibold py-3"
              )}
            >
              Resend Verification Email
            </button>

            <button
              onClick={() => loadHostAndGate({ silent: true })}
              className={cn(
                "w-full rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 font-semibold py-3"
              )}
            >
              I Verified — Refresh
            </button>

            <button
              onClick={logout}
              className={cn(
                "w-full rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 font-semibold py-3"
              )}
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ✅ Unlocked dashboard
  return (
    <div
      className={cn(
        "min-h-screen bg-[#0b111d] text-white flex flex-col items_center p-8"
      ).replace("items_center", "items-center")}
    >
      <div className={cn("w-full flex items-center justify-between mb-2")}>
        <h1 className={cn("text-3xl font-semibold")}>Host Dashboard</h1>
        <HostProfilePanel host={host} setHost={setHost} />
      </div>

      {gateMsg ? (
        <div className={cn("w-full max-w-6xl mb-4 text-sm text-white/80")}>
          {gateMsg}
        </div>
      ) : null}

      <DashboardHeader
        onCreateFanWall={() =>
          requireUnlocked(() => setFanWallModalOpen(true))
        }
        onCreatePoll={() =>
          requireUnlocked(() => setPollModalOpen(true))
        }
        onCreatePrizeWheel={() =>
          requireUnlocked(() => setPrizeWheelModalOpen(true))
        }
        onOpenAds={() =>
          requireUnlocked(() => setAdsModalOpen(true))
        }
        onCreateTriviaGame={() =>
          requireUnlocked(() => setTriviaModalOpen(true))
        }
        onCreateNewAd={() =>
          requireUnlocked(() => setCreateAdModalOpen(true))
        }
        onCreateSlideShow={() =>
          requireUnlocked(() => setSlideShowModalOpen(true))
        }
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
        onGenerateTrivia={handleGenerateTrivia} // ✅ FIXED: now actually generates via /trivia/ai-generate
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

      {isAdsModalOpen && (
        <AdsManagerModal host={host} onClose={() => setAdsModalOpen(false)} />
      )}

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
