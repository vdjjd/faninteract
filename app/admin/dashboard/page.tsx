'use client';

import { useState, useEffect, useRef } from 'react';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { getFanWallsByHost } from '@/lib/actions/fan_walls';

import DashboardHeader from './components/DashboardHeader';
import FanWallGrid from './components/FanWallGrid';
import PrizeWheelGrid from './components/PrizeWheelGrid';
import PollGrid from './components/PollGrid';
import TriviaGrid from './components/TriviaGrid';
import SlideshowGrid from './components/SlideshowGrid';

import CreateFanWallModal from '@/components/CreateFanWallModal';
import CreatePrizeWheelModal from '@/components/CreatePrizeWheelModal';
import CreatePollModal from '@/components/CreatePollModal';
import TriviaCreationModal from '@/components/TriviaCreationModal';
import CreateSlideShowModal from '@/components/CreateSlideShowModal';

import OptionsModalPoll from '@/components/OptionsModalPoll';
import OptionsModalFanWall from '@/components/OptionsModalFanWall';
import OptionsModalPrizeWheel from '@/components/OptionsModalPrizeWheel';
import OptionsModalSlideshow from '@/components/OptionsModalSlideShow';

import AdsManagerModal from '@/components/AdsManagerModal';
import HostProfilePanel from '@/components/HostProfilePanel';

import CreateNewAdModal from '@/components/CreateNewAdModal';
import AdBuilderModal from '@/components/AdBuilderModal';

import { cn } from '@/lib/utils';

const supabase = getSupabaseClient();

export default function DashboardPage() {
  const [host, setHost] = useState<any>(null);

  const [fanWalls, setFanWalls] = useState<any[]>([]);
  const [prizeWheels, setPrizeWheels] = useState<any[]>([]);
  const [polls, setPolls] = useState<any[]>([]);
  const [triviaList, setTriviaList] = useState<any[]>([]);
  const [slideshows, setSlideshows] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);

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

  const [isCreateAdModalOpen, setCreateAdModalOpen] = useState(false);
  const [builderAdId, setBuilderAdId] = useState<string | null>(null);
  const [showBuilderModal, setShowBuilderModal] = useState(false);

  const loadedRef = useRef(false);

  // ----------------------------------------
  // INITIAL LOAD
  // ----------------------------------------
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
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
            created_at: new Date().toISOString()
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
          ] = await Promise.all([
            getFanWallsByHost(hostRow.id),
            supabase.from("prize_wheels").select("*").eq("host_id", hostRow.id).order("created_at", { ascending: false }),
            supabase.from("polls").select("*").eq("host_id", hostRow.id).order("created_at", { ascending: false }),
            supabase.from("trivia_cards").select("*").eq("host_id", hostRow.id).order("created_at", { ascending: false }),
            supabase.from("slide_shows").select("*").eq("host_id", hostRow.id).order("created_at", { ascending: false })
          ]);

          setFanWalls(walls);
          setPrizeWheels(wheels.data || []);
          setPolls(pollsData.data || []);
          setTriviaList(triviaData.data || []);
          setSlideshows(slideshowsData.data || []);
        }

      } catch (err: any) {
        console.error("❌ Dashboard load error:", err.message || err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  // ----------------------------------------
  // REFRESH FUNCTIONS
  // ----------------------------------------
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
    const { data } = await supabase.from("prize_wheels")
      .select("*")
      .eq("host_id", host.id)
      .order("created_at", { ascending: false });
    setPrizeWheels(data || []);
  }

  async function refreshPolls() {
    if (!host?.id) return;
    const { data } = await supabase.from("polls")
      .select("*")
      .eq("host_id", host.id)
      .order("created_at", { ascending: false });
    setPolls(data || []);
  }

  async function refreshTrivia() {
    if (!host?.id) return;
    const { data } = await supabase.from("trivia_cards")
      .select("*")
      .eq("host_id", host.id)
      .order("created_at", { ascending: false });
    setTriviaList(data || []);
  }

  // ----------------------------------------
  // LOADING SCREEN
  // ----------------------------------------
  if (loading)
    return (
      <div className={cn('flex items-center justify-center h-screen bg-black text-white')}>
        <p>Loading Dashboard…</p>
      </div>
    );

  // ----------------------------------------
  // RENDER
  // ----------------------------------------
  return (
    <div className={cn('min-h-screen bg-[#0b111d] text-white flex flex-col items-center p-8')}>

      <div className={cn('w-full flex items-center justify-between mb-6')}>
        <h1 className={cn('text-3xl font-semibold')}>Host Dashboard</h1>
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
      />

      {/* TRIVIA */}
      <TriviaGrid
        trivia={triviaList}
        host={host}
        refreshTrivia={refreshTrivia}
      />

      {/* SLIDESHOW GRID */}
      <div className={cn('w-full max-w-6xl mt-10')}>
        <SlideshowGrid
          slideshows={slideshows}
          host={host}
          refreshSlideshows={refreshSlideshows}
          onOpenOptions={(show) => {
            setSelectedWall(null);
            setSelectedPrizeWheel(null);
            setSelectedPoll(null);
            setSelectedSlideshow(show);
          }}
        />
      </div>

      {/* FAN WALLS (FIXED WRAPPER) */}
      <div className={cn('w-full max-w-6xl mt-10')}>
        <FanWallGrid
          walls={fanWalls}
          host={host}
          refreshFanWalls={refreshFanWalls}
          onOpenOptions={(wall) => {
            setSelectedPrizeWheel(null);
            setSelectedPoll(null);
            setSelectedSlideshow(null);
            setTimeout(() => setSelectedWall(wall), 25);
          }}
        />
      </div>

      {/* PRIZE WHEELS */}
      <div className={cn('w-full max-w-6xl mt-10')}>
        <PrizeWheelGrid
          wheels={prizeWheels}
          host={host}
          refreshPrizeWheels={refreshPrizeWheels}
          onOpenOptions={(wheel) => {
            setSelectedWall(null);
            setSelectedPoll(null);
            setSelectedSlideshow(null);
            setTimeout(() => setSelectedPrizeWheel(wheel), 25);
          }}
        />
      </div>

      {/* POLLS */}
      <div className={cn('w-full max-w-6xl mt-10')}>
        <PollGrid
          host={host}
          polls={polls}
          refreshPolls={refreshPolls}
          onOpenOptions={(poll) => {
            setSelectedWall(null);
            setSelectedPrizeWheel(null);
            setSelectedSlideshow(null);
            setTimeout(() => setSelectedPoll(poll), 25);
          }}
        />
      </div>

      {/* CREATION MODALS */}
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
      />

      <TriviaCreationModal
        isOpen={isTriviaModalOpen}
        onClose={() => setTriviaModalOpen(false)}
        hostId={host?.id}
        refreshTrivia={refreshTrivia}
      />

      <CreateSlideShowModal
        isOpen={isSlideShowModalOpen}
        onClose={() => setSlideShowModalOpen(false)}
        hostId={host?.id}
        refreshSlideshows={refreshSlideshows}
      />

      {/* OPTIONS MODALS */}
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

      {/* OLD AD OVERLAY MANAGER */}
      {isAdsModalOpen && (
        <AdsManagerModal
          open={isAdsModalOpen}
          onClose={() => setAdsModalOpen(false)}
          host={host}
        />
      )}

      {/* NEW AD SLIDE CREATOR (FIXED) */}
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

      {/* NEW AD SLIDE BUILDER */}
      {showBuilderModal && builderAdId && (
        <AdBuilderModal
          open={showBuilderModal}
          onClose={() => setShowBuilderModal(false)}
          adId={builderAdId}
        />
      )}

    </div>
  );
}
