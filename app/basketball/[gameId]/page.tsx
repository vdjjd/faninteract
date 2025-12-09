"use client";

import { use, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ActiveBasketball from "@/app/basketball/components/Active";
import InactiveBasketball from "@/app/basketball/components/Inactive";

export default function Page({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = use(params);
  const [game, setGame] = useState<any>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("bb_games")
        .select("*")
        .eq("id", gameId)
        .single();
      setGame(data);
    }

    load();
    const t = setInterval(load, 1000);
    return () => clearInterval(t);
  }, [gameId]);

  if (!game)
    return (
      <div style={{ color: "white", padding: 40, fontSize: 32 }}>
        Loading…
      </div>
    );

  // NEW LOGIC:
  if (!game.wall_active) {
    return <InactiveBasketball game={game} />;
  }

  return <ActiveBasketball gameId={gameId} />;
}
