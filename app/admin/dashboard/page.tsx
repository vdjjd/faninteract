'use client';

import { useState, useEffect, useRef } from 'react';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { getFanWallsByHost } from '@/lib/actions/fan_walls';

import DashboardHeader from './components/DashboardHeader';
import FanWallGrid from './components/FanWallGrid';
import PrizeWheelGrid from './components/PrizeWheelGrid';
import PollGrid from './components/PollGrid';
import TriviaGrid from './components/TriviaGrid';

import CreateFanWallModal from '@/components/CreateFanWallModal';
import CreatePrizeWheelModal from '@/components/CreatePrizeWheelModal';
import CreatePollModal from '@/components/CreatePollModal';
import TriviaCreationModal from '@/components/TriviaCreationModal';

import OptionsModalPoll from '@/components/OptionsModalPoll';
import OptionsModalFanWall from '@/components/OptionsModalFanWall';
import OptionsModalPrizeWheel from '@/components/OptionsModalPrizeWheel';
import AdsManagerModal from '@/components/AdsManagerModal';
import HostProfilePanel from '@/components/HostProfilePanel';

import { cn } from '@/lib/utils';

const supabase = getSupabaseClient();

export default function DashboardPage() {
  const [host, setHost] = useState<any>(null);

  const [fanWalls, setFanWalls] = useState<any[]>([]);
  const [prizeWheels, setPrizeWheels] = useState<any[]>([]);
  const [polls, setPolls] = useState<any[]>([]);
  const [triviaList, setTriviaList] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);

  const [isFanWallModalOpen, setFanWallModalOpen] = useState(false);
  const [isPrizeWheelModalOpen, setPrizeWheelModalOpen] = useState(false);
  const [isPollModalOpen, setPollModalOpen] = useState(false);
  const [isAdsModalOpen, setAdsModalOpen] = useState(false);
  const [isTriviaModalOpen, setTriviaModalOpen] = useState(false);

  const [selectedWall, setSelectedWall] = useState<any | null>(null);
  const [selectedPrizeWheel, setSelectedPrizeWheel] = useState<any | null>(null);
  const [selectedPoll, setSelectedPoll] = useState<any | null>(null);

  const loadedRef = useRef(false);

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
          const [walls, wheels, pollsData, triviaData] = await Promise.all([
            getFanWallsByHost(hostRow.id),
            supabase.from("prize_wheels").select("*").eq("host_id", hostRow.id).order("created_at", { ascending: false }),
            supabase.from("polls").select("*").eq("host_id", hostRow.id).order("created_at", { ascending: false }),
            supabase.from("trivia_cards").select("*").eq("host_id", hostRow.id).order("created_at", { ascending: false }),
          ]);

          setFanWalls(walls);
          setPrizeWheels(wheels.data || []);
          setPolls(pollsData.data || []);
          setTriviaList(triviaData.data || []);
        }

      } catch (err: any) {
        console.error("❌ Dashboard load error:", err.message || err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  async function refreshFanWalls() {
    if (!host?.id) return;
    const updated = await getFanWallsByHost(host.id);
    setFanWalls(updated);
  }

  async function refreshPrizeWheels() {
    if (!host?.id) return;
    const { data } = await supabase.from("prize_wheels").select("*").eq("host_id", host.id).order("created_at", { ascending: false });
    setPrizeWheels(data || []);
  }

  async function refreshPolls() {
    if (!host?.id) return;
    const { data } = await supabase.from("polls").select("*").eq("host_id", host.id).order("created_at", { ascending: false });
    setPolls(data || []);
  }

  async function refreshTrivia() {
    if (!host?.id) return;
    const { data } = await supabase.from("trivia_cards").select("*").eq("host_id", host.id).order("created_at", { ascending: false });
    setTriviaList(data || []);
  }

  if (loading)
    return (
      <div className={cn("flex items-center justify-center h-screen bg-black text-white")}>
        <p>Loading Dashboard…</p>
      </div>
    );

  return (
    <div className={cn("min-h-screen bg-[#0b111d] text-white flex flex-col items-center p-2")}>

      {/* ⭐⭐⭐ PATCHED HEADER (NO TITLE) ⭐⭐⭐ */}
<div className={cn('w-full', 'flex', 'items-center', 'justify-end', 'mb-6')}>
  <HostProfilePanel host={host} setHost={setHost} />
</div>
{/* ⭐⭐⭐ END PATCH ⭐⭐⭐ */}


      <DashboardHeader
        onCreateFanWall={() => setFanWallModalOpen(true)}
        onCreatePoll={() => setPollModalOpen(true)}
        onCreatePrizeWheel={() => setPrizeWheelModalOpen(true)}
        onOpenAds={() => setAdsModalOpen(true)}
        onCreateTriviaGame={() => setTriviaModalOpen(true)}
      />

      <TriviaGrid trivia={triviaList} host={host} refreshTrivia={refreshTrivia} onOpenOptions={() => {}} />

      <FanWallGrid
        walls={fanWalls}
        host={host}
        refreshFanWalls={refreshFanWalls}
        onOpenOptions={(wall) => {
          setSelectedPrizeWheel(null);
          setSelectedPoll(null);
          setTimeout(() => setSelectedWall(wall), 25);
        }}
      />

      <PrizeWheelGrid
        wheels={prizeWheels}
        host={host}
        refreshPrizeWheels={refreshPrizeWheels}
        onOpenOptions={(wheel) => {
          setSelectedWall(null);
          setSelectedPoll(null);
          setTimeout(() => setSelectedPrizeWheel(wheel), 25);
        }}
      />

      <PollGrid
        host={host}
        refreshPolls={refreshPolls}
        onOpenOptions={(poll) => {
          setSelectedWall(null);
          setSelectedPrizeWheel(null);
          setTimeout(() => setSelectedPoll(poll), 25);
        }}
      />

      <CreateFanWallModal isOpen={isFanWallModalOpen} onClose={() => setFanWallModalOpen(false)} hostId={host?.id} refreshFanWalls={refreshFanWalls} />
      <CreatePrizeWheelModal isOpen={isPrizeWheelModalOpen} onClose={() => setPrizeWheelModalOpen(false)} hostId={host?.id} refreshPrizeWheels={refreshPrizeWheels} />
      <CreatePollModal isOpen={isPollModalOpen} onClose={() => setPollModalOpen(false)} hostId={host?.id} refreshPolls={refreshPolls} onPollCreated={setSelectedPoll} />

      <TriviaCreationModal
        isOpen={isTriviaModalOpen}
        onClose={() => setTriviaModalOpen(false)}
        onGenerateTrivia={async (payload) => {
          try {
            const res = await fetch("/trivia/ai-generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...payload, hostId: host?.id }),
            });

            const data = await res.json();
            if (!data.success) return alert("Trivia creation failed: " + data.error);

            setTriviaModalOpen(false);
            await refreshTrivia();
          } catch (err) {
            console.error(err);
            alert("Error creating trivia.");
          }
        }}
      />

      {selectedWall && (
        <OptionsModalFanWall
          key={`fanwall-${selectedWall.id}`}
          wall={selectedWall}
          hostId={host?.id}
          onClose={() => setSelectedWall(null)}
          refreshFanWalls={refreshFanWalls}
        />
      )}

      {selectedPrizeWheel && (
        <OptionsModalPrizeWheel
          key={`wheel-${selectedPrizeWheel.id}`}
          event={selectedPrizeWheel}
          hostId={host?.id}
          onClose={() => setSelectedPrizeWheel(null)}
          refreshPrizeWheels={refreshPrizeWheels}
        />
      )}

      {selectedPoll && (
        <OptionsModalPoll
          key={`poll-${selectedPoll.id}`}
          poll={selectedPoll}
          hostId={host?.id}
          onClose={() => {
            setSelectedPoll(null);
            refreshPolls();
          }}
          refreshPolls={refreshPolls}
        />
      )}

      {isAdsModalOpen && <AdsManagerModal host={host} onClose={() => setAdsModalOpen(false)} />}
    </div>
  );
}
