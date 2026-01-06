// lib/trivia/triviaScoringEngine.ts

// ✅ scale options from dashboard
export type TriviaPointsType = "100s" | "1000s" | "10000s";

// ✅ how points are awarded
export type TriviaScoringMode = "flat" | "speed" | "100s" | "speed_based"; 
// keep legacy strings tolerated ("100s" was your old "flat")

export interface TriviaScoringInput {
  scoringMode?: TriviaScoringMode | string | null;   // trivia_cards.scoring_mode ("100s" or "speed")
  pointsType?: TriviaPointsType | string | null;     // trivia_cards.points_type ("100s"|"1000s"|"10000s")
  timerSeconds?: number | null;                      // trivia_cards.timer_seconds
  questionStartedAt?: string | null;                 // trivia_sessions.question_started_at
  questionStartMs?: number | null;
  nowMs?: number;
}

export function resolvePointsType(pointsType?: TriviaPointsType | string | null): TriviaPointsType {
  const raw = String(pointsType || "100s").trim();

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

export function getMaxPoints(pointsType?: TriviaPointsType | string | null): number {
  const pt = resolvePointsType(pointsType);
  if (pt === "1000s") return 1000;
  if (pt === "10000s") return 10000;
  return 100;
}

export function resolveScoringAlgorithm(scoringMode?: TriviaScoringMode | string | null): "flat" | "speed" {
  const raw = String(scoringMode || "flat").trim();

  // ✅ your current UI uses "speed" or "100s"
  if (raw === "speed") return "speed";
  if (raw === "speed_based") return "speed";

  // legacy / default
  return "flat";
}

/**
 * ✅ Option B: returns the ACTUAL points to store in trivia_answers.points
 * - flat: always max points
 * - speed: decays from max→0 based on elapsed time
 */
export function computeTriviaPoints({
  scoringMode,
  pointsType,
  timerSeconds,
  questionStartedAt,
  questionStartMs,
  nowMs,
}: TriviaScoringInput): number {
  const maxPoints = getMaxPoints(pointsType);
  const algo = resolveScoringAlgorithm(scoringMode);

  // flat scoring = full max
  if (algo === "flat") return maxPoints;

  // speed scoring = time decay
  const durationSeconds =
    typeof timerSeconds === "number" && timerSeconds > 0 ? timerSeconds : 1;

  const now =
    typeof nowMs === "number" && Number.isFinite(nowMs) ? nowMs : Date.now();

  let startMs =
    typeof questionStartMs === "number" && Number.isFinite(questionStartMs)
      ? questionStartMs
      : questionStartedAt
      ? new Date(questionStartedAt).getTime()
      : now;

  if (!Number.isFinite(startMs)) startMs = now;

  const elapsedSec = Math.max(0, (now - startMs) / 1000);
  const remainingSec = Math.max(0, durationSeconds - elapsedSec);
  const fraction = Math.max(0, Math.min(1, remainingSec / durationSeconds));

  return Math.round(maxPoints * fraction);
}
