/* ============================================================
   ULTRA-LIGHTWEIGHT PHYSICS ENGINE FOR ARCADE BASKETBALL
   --------------------------------------------------------
   Provides:
   ✓ Rim collision + deflection
   ✓ Spin-based roll-around
   ✓ Backboard bank shots
   ✓ Lip-outs (probability)
   ✓ Rim rattles (micro bounce)
   ✓ Gravity easing for smooth arcs
============================================================ */

export interface Vec2 {
  x: number;
  y: number;
}

export interface Rim {
  x: number;     // center X
  y: number;     // height (Y position)
  width: number; // interior width of rim
}

export interface Backboard {
  x: number;     // center X
  y: number;     // vertical location
  width: number; // board width
}

/* ============================================================
   GRAVITY EASING — smoother arc, more natural motion
============================================================ */
export function gravityEase(progress: number): number {
  return progress < 0.5
    ? 2 * progress * progress
    : -1 + (4 - 2 * progress) * progress;
}

/* ============================================================
   RIM COLLISION DETECTION
============================================================ */
export function detectRimCollision(
  ball: Vec2,
  radius: number,
  rim: Rim
): boolean {
  const half = rim.width / 2;

  return (
    ball.y <= rim.y + 3 &&
    ball.y >= rim.y - 3 &&
    ball.x > rim.x - half - radius &&
    ball.x < rim.x + half + radius
  );
}

/* ============================================================
   RIM-BASED SPIN DEFLECTION
============================================================ */
export function rimDeflect(x: number, spin: number): number {
  // direction based on which side of rim center the ball hits
  const dir = x > 0 ? 1 : -1;
  return dir * (0.3 + spin * 0.25);
}

/* ============================================================
   RIM RATTLING (micro shaking motion)
============================================================ */
export function rimRattle(power: number): number {
  return (Math.random() - 0.5) * (0.6 + power * 0.5);
}

/* ============================================================
   LIP OUT PROBABILITY — ball looks in, then pops out
============================================================ */
export function lipOutChance(power: number, spin: number): boolean {
  const probability = 0.07 + power * 0.1 + spin * 0.05;
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
  return (
    ball.y >= board.y - 2 &&
    ball.y <= board.y + 2 &&
    ball.x > board.x - board.width / 2 - radius &&
    ball.x < board.x + board.width / 2 + radius
  );
}

/* ============================================================
   BANK SHOT BOUNCE — dampened reflection
============================================================ */
export function bankShotBounce(angle: number, power: number): number {
  return angle * -0.45 * (0.7 + power * 0.2);
}

/* ============================================================
   GENERAL BOUNCE HELPERS
============================================================ */
export function bounceVertical(y: number, power: number): number {
  return -Math.abs(y) * (0.4 + power * 0.2);
}

export function bounceHorizontal(x: number, power: number): number {
  return -x * (0.35 + power * 0.15);
}
