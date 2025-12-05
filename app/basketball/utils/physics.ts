/* ============================================================
   80% REALISTIC / 20% ARCADE BASKETBALL PHYSICS (2.5D Compatible)
   --------------------------------------------------------------
   Designed specifically for:
   ✔ Ball moving AWAY from viewer (shrinking)
   ✔ Rim interaction at mid-depth
   ✔ Ball returning FORWARD (growing)
   ✔ No side-scrolling — X only used for spin drift
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
   TRUE PARABOLIC ARC (Vertical Only)
============================================================ */
/**
 * Pure vertical arc. Returns arc height.
 * This is applied ON TOP OF the Y-movement toward the rim.
 */
export function computeArcY(progress: number, power: number): number {
  const parabola = 4 * progress * (1 - progress);   // 0 → peak → 0

  // Height tuned for Pop-A-Shot illusion
  const height = 30 + power * 42;

  return parabola * height;
}

/* ============================================================
   SPIN DRIFT (very small left/right drift)
   NOT forward motion — that is simulated by scale & Y.
============================================================ */
export function computeSpinDrift(progress: number, spin: number): number {
  return spin * progress * 4;
}

/* ============================================================
   RIM COLLISION (treat rim like a 2D cylinder)
============================================================ */
export function detectRimCollision(ball: Vec2, radius: number, rim: Rim): boolean {
  const half = rim.width / 2;

  const hitX =
    ball.x > rim.x - half - radius &&
    ball.x < rim.x + half + radius;

  const hitY = Math.abs(ball.y - rim.y) < radius * 1.4;

  return hitX && hitY;
}

/* ============================================================
   SPIN-BASED RIM DEFLECTION
============================================================ */
export function rimDeflect(ballX: number, rimX: number, spin: number): number {
  const direction = ballX > rimX ? 1 : -1;
  const base = 0.25 + spin * 0.4;
  return direction * base;
}

/* ============================================================
   RIM RATTLING
============================================================ */
export function rimRattle(power: number): number {
  return (Math.random() - 0.5) * (0.4 + power * 0.6);
}

/* ============================================================
   LIP-OUT CHANCE
============================================================ */
export function lipOutChance(power: number, spin: number): boolean {
  const probability = 0.05 + power * 0.06 + spin * 0.08;
  return Math.random() < probability;
}

/* ============================================================
   BACKBOARD COLLISION
============================================================ */
export function detectBackboardCollision(
  ball: Vec2,
  radius: number,
  board: Backboard
): boolean {
  const hitY = Math.abs(ball.y - board.y) < radius * 1.4;
  const hitX = Math.abs(ball.x - board.x) < board.width / 2 + radius;
  return hitX && hitY;
}

/* ============================================================
   BACKBOARD BOUNCE
============================================================ */
export function bankShotBounce(vx: number, power: number): number {
  return -vx * (0.45 + power * 0.2);
}

/* ============================================================
   VERTICAL ENERGY LOSS
============================================================ */
export function bounceVertical(vy: number, power: number): number {
  return -Math.abs(vy) * (0.38 + power * 0.18);
}

/* ============================================================
   HORIZONTAL ENERGY LOSS
============================================================ */
export function bounceHorizontal(vx: number, power: number): number {
  return -vx * (0.35 + power * 0.2);
}

/* ============================================================
   RIM ASSIST (slight magnetic pull inward)
============================================================ */
export function rimAssist(ball: Vec2, rim: Rim): number {
  const dx = ball.x - rim.x;
  const dist = Math.abs(dx);

  if (dist < rim.width * 0.6) {
    return -dx * 0.03;
  }

  return 0;
}
