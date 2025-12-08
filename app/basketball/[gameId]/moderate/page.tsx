"use client";

import { useParams } from "next/navigation";
import BasketballModerationModal from "@/components/BasketballModerationModal";

export default function ModeratePage() {
  const { gameId } = useParams();
  const id = Array.isArray(gameId) ? gameId[0] : gameId;

  return (
    <BasketballModerationModal
      gameId={id}
      onClose={() => window.close()}
    />
  );
}
