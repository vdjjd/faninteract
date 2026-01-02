// lib/trivia/triviaScoringEngine.ts

export type TriviaScoringMode = "100s" | "1000s" | "10000s";

export interface TriviaScoringInput {
  scoringMode?: TriviaScoringMode | string | null;
  timerSeconds?: number | null;
  questionStartedAt?: string | null;
  nowMs?: number; // optional override for tests
}

/**
 * Returns the max points for the given scoring mode.
 *  - "100s"   → 100
 *  - "1000s"  → 1000
 *  - "10000s" → 10000
 */
export function getMaxPointsForMode(
  scoringMode?: TriviaScoringMode | string | null
): number {
  switch (scoringMode) {
    case "1000s":
      return 1000;
    case "10000s":
      return 10000;
    case "100s":
    default:
      return 100;
  }
}

/**
 * Time-based trivia scoring:
 * - Starts at max points at question start.
 * - Linearly decays to 0 by the end of the timer window.
 * - Anchored to question_started_at so all devices agree.
 */
export function computeTriviaPoints({
  scoringMode,
  timerSeconds,
  questionStartedAt,
  nowMs,
}: TriviaScoringInput): number {
  const maxPoints = getMaxPointsForMode(scoringMode);

  const durationSeconds =
    typeof timerSeconds === "number" && timerSeconds > 0 ? timerSeconds : 1;

  const now = typeof nowMs === "number" ? nowMs : Date.now();
  const startMs = questionStartedAt
    ? new Date(questionStartedAt).getTime()
    : now;

  const elapsedSec = (now - startMs) / 1000;
  const remainingSec = Math.max(0, durationSeconds - elapsedSec);
  const fraction = Math.max(0, Math.min(1, remainingSec / durationSeconds));

  return Math.round(maxPoints * fraction);
}
