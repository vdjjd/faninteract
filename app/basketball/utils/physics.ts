export interface Ball {
  id: string;
  lane: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  createdAt: number;
  power: number;
  rainbow?: boolean;
  fire?: boolean;
}

export const GRAVITY = 0.0045;   // tuned later
export const FRICTION = 0.995;

export function stepBall(ball: Ball, dt: number): Ball {
  const next = { ...ball };

  // Update position
  next.x += next.vx * dt;
  next.y += next.vy * dt;

  // Gravity
  next.vy += GRAVITY * dt;

  // Drag
  next.vx *= FRICTION;

  return next;
}

export function isBallDead(ball: Ball): boolean {
  return ball.y > 1.4; // off-screen bottom
}
