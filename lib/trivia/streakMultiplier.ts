// lib/trivia/streakMultiplier.ts
import { getSupabaseClient } from "@/lib/supabaseClient";
const supabase = getSupabaseClient();

export async function getConsecutiveCorrectStreak(args: {
  playerId: string;
  sessionId: string;
  limit?: number;
}): Promise<number> {
  const { playerId, sessionId, limit = 30 } = args;

  const { data, error } = await supabase
    .from("trivia_answers")
    .select(
      `
      is_correct,
      created_at,
      trivia_players!inner (
        session_id
      )
    `
    )
    .eq("player_id", playerId)
    .eq("trivia_players.session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("⚠️ streak lookup error:", error);
    return 0;
  }

  let streak = 0;
  for (const row of (data as any[]) || []) {
    if (row?.is_correct === true) streak += 1;
    else break;
  }
  return streak;
}

export function streakBonusPct(streakIncludingCurrent: number): number {
  if (streakIncludingCurrent < 2) return 0;
  const steps = streakIncludingCurrent - 1; // 2->1 step, 3->2 steps...
  return Math.min(steps * 0.1, 0.5);
}

export function applyStreakBonus(basePoints: number, streakIncludingCurrent: number): number {
  const bonus = streakBonusPct(streakIncludingCurrent);
  return Math.round(basePoints * (1 + bonus));
}
