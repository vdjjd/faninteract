// lib/trivia/triviaScoringEngine.ts

export type TriviaScoringMode = "100s" | "1000s" | "10000s";

export interface TriviaScoringInput {
  scoringMode?: TriviaScoringMode | string | null;
  timerSeconds?: number | null;

  // Existing (DB ISO string)
  questionStartedAt?: string | null;

  // ✅ NEW: optional direct start timestamp (preferred when you compute "effective start")
  questionStartMs?: number | null;

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
 *
 * ✅ Robustness:
 * - Handles invalid dates safely (NaN)
 * - Treats "start in the future" as elapsed=0 (award max points)
 * - Allows callers to provide questionStartMs directly (avoids ISO conversion errors)
 */
export function computeTriviaPoints({
  scoringMode,
  timerSeconds,
  questionStartedAt,
  questionStartMs,
  nowMs,
}: TriviaScoringInput): number {
  const maxPoints = getMaxPointsForMode(scoringMode);

  const durationSeconds =
    typeof timerSeconds === "number" && timerSeconds > 0 ? timerSeconds : 1;

  const now =
    typeof nowMs === "number" && Number.isFinite(nowMs) ? nowMs : Date.now();

  // Prefer numeric start if provided
  let startMs =
    typeof questionStartMs === "number" && Number.isFinite(questionStartMs)
      ? questionStartMs
      : questionStartedAt
      ? new Date(questionStartedAt).getTime()
      : now;

  // If startMs is invalid, fall back to now (award max points)
  if (!Number.isFinite(startMs)) startMs = now;

  // ✅ If start is in the future, treat as not started yet (elapsed = 0)
  const elapsedSec = Math.max(0, (now - startMs) / 1000);

  const remainingSec = Math.max(0, durationSeconds - elapsedSec);
  const fraction = Math.max(0, Math.min(1, remainingSec / durationSeconds));

  return Math.round(maxPoints * fraction);
}
