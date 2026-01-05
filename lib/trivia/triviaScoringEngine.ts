// lib/trivia/triviaScoringEngine.ts

// The *display / config* scale options you use in the dashboard
export type TriviaScoringMode = "100s" | "1000s" | "10000s";

export interface TriviaScoringInput {
  /**
   * Legacy / existing scoring mode.
   * Often backed by trivia_cards.scoring_mode.
   */
  scoringMode?: TriviaScoringMode | string | null;

  /**
   * ✅ NEW: direct “Points Type” from the dashboard
   * (e.g. trivia_cards.points_type).
   *
   * If provided, this takes priority over scoringMode.
   */
  pointsType?: TriviaScoringMode | string | null;

  /**
   * Question timer length in seconds
   * (usually trivia_cards.timer_seconds).
   */
  timerSeconds?: number | null;

  /**
   * Existing (DB ISO string) question start.
   * You can keep passing trivia_sessions.question_started_at.
   */
  questionStartedAt?: string | null;

  /**
   * ✅ Optional direct numeric start timestamp
   * (preferred when you’ve already computed “effective start”).
   */
  questionStartMs?: number | null;

  /**
   * Optional override for tests / deterministic scoring.
   * Defaults to Date.now().
   */
  nowMs?: number;
}

/**
 * Normalize whatever the DB gives us into one of the supported
 * scoring scales: "100s", "1000s", or "10000s".
 *
 * Priority:
 *  1. pointsType (new “Points Type” setting)
 *  2. scoringMode (legacy / existing field)
 *  3. default "100s"
 */
export function resolveScoringMode(
  scoringMode?: TriviaScoringMode | string | null,
  pointsType?: TriviaScoringMode | string | null
): TriviaScoringMode {
  const raw = String(pointsType || scoringMode || "100s").trim();

  switch (raw) {
    case "1000s":
    case "1000":
    case "thousands":
      return "1000s";

    case "10000s":
    case "10000":
    case "ten_thousands":
      return "10000s";

    case "100s":
    case "100":
    case "hundreds":
    default:
      return "100s";
  }
}

/**
 * Returns the max points for the given scoring scale.
 *  - "100s"   → 100
 *  - "1000s"  → 1000
 *  - "10000s" → 10000
 */
export function getMaxPointsForMode(
  scoringMode?: TriviaScoringMode | string | null,
  pointsType?: TriviaScoringMode | string | null
): number {
  const mode = resolveScoringMode(scoringMode, pointsType);

  switch (mode) {
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
 * Dashboard mapping:
 * - timerSeconds ← trivia_cards.timer_seconds
 * - pointsType   ← trivia_cards.points_type (or scoring_mode)
 */
export function computeTriviaPoints({
  scoringMode,
  pointsType,
  timerSeconds,
  questionStartedAt,
  questionStartMs,
  nowMs,
}: TriviaScoringInput): number {
  // ✅ Use Points Type (if present) or fall back to scoringMode
  const maxPoints = getMaxPointsForMode(scoringMode, pointsType);

  const durationSeconds =
    typeof timerSeconds === "number" && timerSeconds > 0 ? timerSeconds : 1;

  const now =
    typeof nowMs === "number" && Number.isFinite(nowMs) ? nowMs : Date.now();

  // Prefer numeric start if provided (less parsing / more precise)
  let startMs =
    typeof questionStartMs === "number" && Number.isFinite(questionStartMs)
      ? questionStartMs
      : questionStartedAt
      ? new Date(questionStartedAt).getTime()
      : now;

  // If startMs is invalid, fall back to now (award max points)
  if (!Number.isFinite(startMs)) startMs = now;

  // If start is in the future, treat as not started yet (elapsed = 0)
  const elapsedSec = Math.max(0, (now - startMs) / 1000);

  const remainingSec = Math.max(0, durationSeconds - elapsedSec);
  const fraction = Math.max(0, Math.min(1, remainingSec / durationSeconds));

  return Math.round(maxPoints * fraction);
}
