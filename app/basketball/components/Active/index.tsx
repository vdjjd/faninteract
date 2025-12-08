"use client";

import ActiveBasketballPage from "./ActiveBasketballPage";

export default function ActiveBasketball({
  gameId,
  countdownTrigger,
}: {
  gameId: string;
  countdownTrigger?: boolean;
}) {
  return (
    <ActiveBasketballPage
      gameId={gameId}
      countdownTrigger={countdownTrigger}
    />
  );
}
