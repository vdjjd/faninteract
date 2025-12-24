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

import TriviaModerationModal from "@/components/TriviaModerationModal"; // ✅ NEW

import { cn } from "@/lib/utils";

const supabase = getSupabaseClient();

export default function DashboardPage() {
  const [host, setHost] = useState<any>(null);

  const [fanWalls, setFanWalls] = useState<any[]>([]);
  const [prizeWheels, setPrizeWheels] = useState<any[]>([]);
  const [polls, setPolls] = useState<any[]>([]);
  const [triviaList, setTriviaList] = useState<any[]>([]);
  const [slideshows, setSlideshows] = useState<any[]>([]);

  const [basketballGames, setBasketballGames] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);

  // Creation modals
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

  // ⭐ Basketball options modal
  const [selectedBasketballGame, setSelectedBasketballGame] =
    useState<any | null>(null);
  const [isBasketballOptionsOpen, setBasketballOptionsOpen] =
    useState(false);

  // Ads Builder
  const [isCreateAdModalOpen, setCreateAdModalOpen] = useState(false);
  const [builderAdId, setBuilderAdId] = useState<string | null>(null);
  const [showBuilderModal, setShowBuilderModal] = useState(false);

  // ✅ NEW: which trivia is being moderated?
  const [selectedTriviaForModeration, setSelectedTriviaForModeration] =
    useState<any | null>(null);

  const loadedRef = useRef(false);

  /* ---------------------------------------------- */
  /* INITIAL LOAD */
  /* ---------------------------------------------- */
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    async function load() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("No authenticated user");

        let { data: hostRow } = await supabase
          .from("hosts")
          .select("*")
          .eq("auth_id", user.id)
          .maybeSingle();

        if (!hostRow) {
          const newHost = {
            id: crypto.randomUUID(),
            auth_id: user.id,
            email: user.email || "unknown@example.com",
            username: user.email?.split("@")[0] || "newuser",
            venue_name: "My Venue",
            role: "host",
            created_at: new Date().toISOString(),
          };

          const { data: inserted } = await supabase
            .from("hosts")
            .insert([newHost])
            .select()
            .maybeSingle();

          hostRow = inserted;
        }

        setHost(hostRow);

        if (hostRow?.id) {
          const [
            walls,
            wheels,
            pollsData,
            triviaData,
            slideshowsData,
            basketballData,
          ] = await Promise.all([
            getFanWallsByHost(hostRow.id),

            supabase
              .from("prize_wheels")
              .select("*")
              .eq("host_id", hostRow.id)
              .order("created_at", { ascending: false }),

            supabase
              .from("polls")
              .select("*")
              .eq("host_id", hostRow.id)
              .order("created_at", { ascending: false }),

            supabase
              .from("trivia_cards")
              .select("*")
              .eq("host_id", hostRow.id)
              .order("created_at", { ascending: false }),

            supabase
              .from("slide_shows")
              .select("*")
              .eq("host_id", hostRow.id)
              .order("created_at", { ascending: false }),

            supabase
              .from("bb_games")
              .select("*")
              .eq("host_id", hostRow.id)
              .order("created_at", { ascending: false }),
          ]);

          setFanWalls(walls);
          setPrizeWheels(wheels.data || []);
          setPolls(pollsData.data || []);
          setTriviaList(triviaData.data || []);
          setSlideshows(slideshowsData.data || []);
          setBasketballGames(basketballData.data || []);
        }
      } catch (err: any) {
        console.error("❌ Dashboard load error:", err.message || err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  /* ---------------------------------------------- */
  /* REFRESH HELPERS */
  /* ---------------------------------------------- */
  async function refreshSlideshows() {
    if (!host?.id) return;
    const { data } = await supabase
      .from("slide_shows")
      .select("*")
      .eq("host_id", host.id)
      .order("created_at", { ascending: false });
    setSlideshows(data || []);
  }

  async function refreshFanWalls() {
    if (!host?.id) return;
    const updated = await getFanWallsByHost(host.id);
    setFanWalls(updated);
  }

  async function refreshPrizeWheels() {
    if (!host?.id) return;
    const { data } = await supabase
      .from("prize_wheels")
      .select("*")
      .eq("host_id", host.id)
      .order("created_at", { ascending: false });
    setPrizeWheels(data || []);
  }

  async function refreshPolls() {
    if (!host?.id) return;
    const { data } = await supabase
      .from("polls")
      .select("*")
      .eq("host_id", host.id)
      .order("created_at", { ascending: false });
    setPolls(data || []);
  }

  async function refreshTrivia() {
    if (!host?.id) return;
    const { data } = await supabase
      .from("trivia_cards")
      .select("*")
      .eq("host_id", host.id)
      .order("created_at", { ascending: false });
    setTriviaList(data || []);
  }

  async function refreshBasketballGames() {
    if (!host?.id) return;
    const { data } = await supabase
      .from("bb_games")
      .select("*")
      .eq("host_id", host.id)
      .order("created_at", { ascending: false });
    setBasketballGames(data || []);
  }

  /* ---------------------------------------------- */
  /* TRIVIA CREATION — AI GENERATED                 */
  /* ---------------------------------------------- */
  async function handleGenerateTrivia(payload: any) {
    try {
      console.log("🚀 Generating trivia via AI", payload);

      const res = await fetch("/trivia/ai-generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        console.error("❌ Trivia generation failed:", json);
        alert("Trivia generation failed. Check server logs.");
        return;
      }

      console.log("✅ Trivia generated:", json.triviaId);

      await refreshTrivia();
      setTriviaModalOpen(false);
    } catch (err) {
      console.error("❌ Trivia generation threw:", err);
      alert("Trivia generation crashed. Check console/server logs.");
    }
  }

  /* ---------------------------------------------- */
  /* LOADING SCREEN */
  /* ---------------------------------------------- */
  if (loading)
    return (
      <div
        className={cn(
          "flex items-center justify-center h-screen bg-black text-white"
        )}
      >
        <p>Loading Dashboard…</p>
      </div>
    );

  /* ---------------------------------------------- */
  /* RENDER DASHBOARD */
  /* ---------------------------------------------- */
  return (
    <div
      className={cn(
        "min-h-screen bg-[#0b111d] text-white flex flex-col items_center p-8"
      ).replace("items_center", "items-center")}
    >
      <div className={cn("w-full flex items-center justify-between mb-6")}>
        <h1 className={cn("text-3xl font-semibold")}>Host Dashboard</h1>
        <HostProfilePanel host={host} setHost={setHost} />
      </div>

      <DashboardHeader
        onCreateFanWall={() => setFanWallModalOpen(true)}
        onCreatePoll={() => setPollModalOpen(true)}
        onCreatePrizeWheel={() => setPrizeWheelModalOpen(true)}
        onOpenAds={() => setAdsModalOpen(true)}
        onCreateTriviaGame={() => setTriviaModalOpen(true)}
        onCreateNewAd={() => setCreateAdModalOpen(true)}
        onCreateSlideShow={() => setSlideShowModalOpen(true)}
        onCreateBasketballGame={() => setBasketballModalOpen(true)}
      />

      {/* ---------------- TRIVIA GRID ---------------- */}
      <TriviaGrid
        trivia={triviaList}
        host={host}
        refreshTrivia={refreshTrivia}
        onOpenOptions={() => {}}
        // ✅ Hook moderation handler
        onOpenModeration={(t) => setSelectedTriviaForModeration(t)}
      />

      <div className={cn("w_full max-w-6xl mt-10").replace("w_full", "w-full")}>
        <SlideshowGrid
          slideshows={slideshows}
          host={host}
          refreshSlideshows={refreshSlideshows}
          onOpenOptions={setSelectedSlideshow}
        />
      </div>

      <div className={cn("w-full max-w-6xl mt-10")}>
        <FanWallGrid
          walls={fanWalls}
          host={host}
          refreshFanWalls={refreshFanWalls}
          onOpenOptions={setSelectedWall}
        />
      </div>

      <div className={cn("w-full max-w-6xl mt-10")}>
        <PrizeWheelGrid
          wheels={prizeWheels}
          host={host}
          refreshPrizeWheels={refreshPrizeWheels}
          onOpenOptions={setSelectedPrizeWheel}
        />
      </div>

      {/* ---------------- BASKETBALL GAMES ---------------- */}
      <div className={cn("w-full max-w-6xl mt-10")}>
        <BasketballGrid
          games={basketballGames}
          host={host}
          refreshBasketballGames={refreshBasketballGames}
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
          refreshPolls={refreshPolls}
          onOpenOptions={setSelectedPoll}
        />
      </div>

      {/* ---------------- CREATION MODALS ---------------- */}
      <CreateFanWallModal
        isOpen={isFanWallModalOpen}
        onClose={() => setFanWallModalOpen(false)}
        hostId={host?.id}
        refreshFanWalls={refreshFanWalls}
      />

      <CreatePrizeWheelModal
        isOpen={isPrizeWheelModalOpen}
        onClose={() => setPrizeWheelModalOpen(false)}
        hostId={host?.id}
        refreshPrizeWheels={refreshPrizeWheels}
      />

      <CreatePollModal
        isOpen={isPollModalOpen}
        onClose={() => setPollModalOpen(false)}
        hostId={host?.id}
        refreshPolls={refreshPolls}
        onPollCreated={setSelectedPoll}
      />

      <TriviaCreationModal
        isOpen={isTriviaModalOpen}
        onClose={() => setTriviaModalOpen(false)}
        hostId={host?.id}
        refreshTrivia={refreshTrivia}
        onGenerateTrivia={handleGenerateTrivia}
      />

      <CreateSlideShowModal
        isOpen={isSlideShowModalOpen}
        onClose={() => setSlideShowModalOpen(false)}
        hostId={host?.id}
        refreshSlideshows={refreshSlideshows}
      />

      <CreateBasketballGameModal
        isOpen={isBasketballModalOpen}
        onClose={() => setBasketballModalOpen(false)}
        hostId={host?.id}
        refreshBasketballGames={refreshBasketballGames}
      />

      {/* ---------------- OPTIONS MODALS ---------------- */}
      {selectedWall && (
        <OptionsModalFanWall
          wall={selectedWall}
          hostId={host?.id}
          onClose={() => setSelectedWall(null)}
          refreshFanWalls={refreshFanWalls}
        />
      )}

      {selectedPrizeWheel && (
        <OptionsModalPrizeWheel
          event={selectedPrizeWheel}
          hostId={host?.id}
          onClose={() => setSelectedPrizeWheel(null)}
          refreshPrizeWheels={refreshPrizeWheels}
        />
      )}

      {selectedPoll && (
        <OptionsModalPoll
          poll={selectedPoll}
          hostId={host?.id}
          onClose={() => setSelectedPoll(null)}
          refreshPolls={refreshPolls}
        />
      )}

      {selectedSlideshow && (
        <OptionsModalSlideshow
          show={selectedSlideshow}
          hostId={host?.id}
          onClose={() => setSelectedSlideshow(null)}
          refreshSlideshows={refreshSlideshows}
        />
      )}

      {/* ---------------- BASKETBALL OPTIONS MODAL ---------------- */}
      {selectedBasketballGame && (
        <BasketballOptionsModal
          game={selectedBasketballGame}
          isOpen={isBasketballOptionsOpen}
          onClose={() => {
            setBasketballOptionsOpen(false);
            setSelectedBasketballGame(null);
          }}
          refreshBasketballGames={refreshBasketballGames}
        />
      )}

      {/* ---------------- ADS MODAL ---------------- */}
      {isAdsModalOpen && (
        <AdsManagerModal host={host} onClose={() => setAdsModalOpen(false)} />
      )}

      {/* ---------------- AD CREATOR → BUILDER ---------------- */}
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

      {/* ---------------- TRIVIA MODERATION MODAL ---------------- */}
      {selectedTriviaForModeration && (
        <TriviaModerationModal
          triviaId={selectedTriviaForModeration.id}
          onClose={() => setSelectedTriviaForModeration(null)}
        />
      )}
    </div>
  );
}
