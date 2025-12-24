export type TriviaTimerConfig = {
  durationMs: number;          // total time (e.g. 30000)
  maxPoints: number;           // 1000 or 100
  tickRateMs?: number;         // default 50ms
};

type TimerCallbacks = {
  onTick?: (payload: {
    timeLeftMs: number;
    progress: number;          // 0 → 1
    pointsRemaining: number;
  }) => void;

  onComplete?: () => void;
};

export class TriviaTimerEngine {
  private startTime = 0;
  private rafId: number | null = null;
  private running = false;

  constructor(
    private config: TriviaTimerConfig,
    private callbacks: TimerCallbacks = {}
  ) {}

  start() {
    if (this.running) return;

    this.running = true;
    this.startTime = performance.now();
    this.loop();
  }

  stop() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  reset() {
    this.stop();
    this.startTime = 0;
  }

  private loop = () => {
    if (!this.running) return;

    const now = performance.now();
    const elapsed = now - this.startTime;
    const remaining = Math.max(0, this.config.durationMs - elapsed);
    const progress = remaining / this.config.durationMs;

    const points = Math.max(
      0,
      Math.round(this.config.maxPoints * progress)
    );

    this.callbacks.onTick?.({
      timeLeftMs: remaining,
      progress,
      pointsRemaining: points,
    });

    if (remaining <= 0) {
      this.running = false;
      this.callbacks.onComplete?.();
      return;
    }

    this.rafId = requestAnimationFrame(this.loop);
  };
}
