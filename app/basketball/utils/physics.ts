/* ============================================================
   80% REALISTIC / 20% ARCADE BASKETBALL PHYSICS ENGINE
============================================================ */

export interface Vec2 {
  x: number;
  y: number;
}

export interface Rim {
  x: number;
  y: number;
  width: number;
}

export interface Backboard {
  x: number;
  y: number;
  width: number;
}

/* ============================================================
   TRUE PARABOLIC ARC WITH REALISTIC HEIGHT
============================================================ */
/**
 * Uses a true 0→1→0 parabola for vertical arc
 * Height tuned for realism + a slight arcade boost
 */
export function computeArcY(progress: number, power: number): number {
  const rawArc = 4 * progress * (1 - progress); // true parabola
  const height = 65 + power * 45; // more natural than 80 + 60
  return rawArc * height;
}

/* ============================================================
   REAL FORWARD MOTION + ARCADE SPIN CURVE
============================================================ */
export function computeArcX(progress: number, power: number, spin: number) {
  // Forward travel — the #1 thing missing before
  const forwardDistance = 120 + power * 60; // MUCH deeper into the scene

  // Progress-based forward push
  const xForward = progress * forwardDistance;

  // Spin curve (gradual)
  const xSpin = (progress * progress) * spin * 20;

  // Center ball at start, push forward into rim
  return xForward - forwardDistance / 2 + xSpin;
}

/* ============================================================
   RIM COLLISION — CYLINDER DETECTION
============================================================ */
export function detectRimCollision(ball: Vec2, radius: number, rim: Rim): boolean {
  const half = rim.width / 2;

  const withinX =
    ball.x > rim.x - half - radius &&
    ball.x < rim.x + half + radius;

  const withinY = Math.abs(ball.y - rim.y) < radius * 1.4;

  return withinX && withinY;
}

/* ============================================================
   SPIN-BASED RIM DEFLECTION (REAL FEEL)
============================================================ */
export function rimDeflect(ballX: number, rimX: number, spin: number): number {
  const side = ballX > rimX ? 1 : -1;
  const base = 0.25 + spin * 0.4;
  return side * base;
}

/* ============================================================
   RIM RATTLING — ENHANCED BOUNCE
============================================================ */
export function rimRattle(power: number): number {
  return (Math.random() - 0.5) * (0.4 + power * 0.6);
}

/* ============================================================
   RIM ASSIST — 20% ARCADE
============================================================ */
export function rimAssist(ball: Vec2, rim: Rim): number {
  const dx = ball.x - rim.x;
  const dist = Math.abs(dx);

  // Soft “magnetic pull” toward the rim center
  if (dist < rim.width * 0.6) {
    return -dx * 0.03;
  }
  return 0;
}

/* ============================================================
   LIP-OUT CHANCE — LOOKS REAL
============================================================ */
export function lipOutChance(power: number, spin: number): boolean {
  const probability = 0.05 + power * 0.06 + spin * 0.08;
  return Math.random() < probability;
}

/* ============================================================
   BACKBOARD COLLISION
============================================================ */
export function detectBackboardCollision(ball: Vec2, radius: number, board: Backboard): boolean {
  const withinY = Math.abs(ball.y - board.y) < radius * 1.4;
  const withinX = Math.abs(ball.x - board.x) < board.width / 2 + radius;
  return withinX && withinY;
}

/* ============================================================
   BANK SHOT BOUNCE
============================================================ */
export function bankShotBounce(velocityX: number, power: number): number {
  return -velocityX * (0.45 + power * 0.2);
}

/* ============================================================
   ENERGY-LOSS BOUNCES
============================================================ */
export function bounceVertical(vy: number, power: number): number {
  return -Math.abs(vy) * (0.38 + power * 0.18);
}

export function bounceHorizontal(vx: number, power: number): number {
  return -vx * (0.35 + power * 0.2);
}
