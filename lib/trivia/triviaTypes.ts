export type TriviaTimerLength = 10 | 15 | 20 | 25 | 30;

export type TriviaScoringMode = "FAST_1000" | "FAST_100";

export interface TriviaTimerConfig {
  durationMs: number;
  scoringMode: TriviaScoringMode;
}

export interface TriviaTickState {
  elapsedMs: number;
  remainingMs: number;
  percentRemaining: number; // 0–1
  currentScore: number;
  isExpired: boolean;
}
