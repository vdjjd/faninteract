/* ============================================================
   80% REALISTIC / 20% ARCADE POP-A-SHOT PHYSICS (2.5D Engine)
   --------------------------------------------------------------
   Designed for:
   ✔ Ball moving AWAY from viewer (shrinking)
   ✔ Ball returning FORWARD (growing)
   ✔ Low Pop-A-Shot arc (Option B)
   ✔ Rim + Backboard collisions
   ✔ Lip-outs & rim rattles
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
   DEPTH PROGRESSION (0 → 1)
   How far “into the screen” the ball has traveled.
============================================================ */
export function computeDepth(progress: number): number {
  // Smooth visually, but consistent timing
  return progress;
}

/* ============================================================
   POP-A-SHOT ARC (Option B)
   True parabola, peaks below rim height.
============================================================ */
export function computeArcVertical(depth: number, power: number): number {
  // True arc shape
  const arc = 4 * depth * (1 - depth);

  // Pop-A-Shot arc height (not too tall)
  const HEIGHT = 18 + power * 24;

  return arc * HEIGHT;
}

/* ============================================================
   PROJECT ARC + DEPTH INTO SCREEN SPACE
   Converts depth + arc height → PlayerCard Y pixel/percent.
============================================================ */
export function projectScreenY(
  depth: number,
  arcHeight: number,
  floorY: number,
  rimY: number
) {
  // Linear depth travel from player (floor) to rim
  const depthY = floorY + depth * (rimY - floorY);

  // Convert arc height to screen movement (smaller multiplier for Option B)
  const ARC_VISUAL_SCALE = 0.55;

  return depthY + arcHeight * ARC_VISUAL_SCALE;
}

/* ============================================================
   SIDE SPIN DRIFT (tiny left/right drift)
============================================================ */
export function spinDrift(depth: number, spin: number): number {
  return spin * depth * 4; // small, controlled drift
}

/* ============================================================
   RIM COLLISION (2D Cylinder Approximation)
============================================================ */
export function detectRimCollision(ball: Vec2, radius: number, rim: Rim): boolean {
  const half = rim.width / 2;

  const hitX =
    ball.x > rim.x - half - radius &&
    ball.x < rim.x + half + radius;

  const hitY = Math.abs(ball.y - rim.y) < radius * 1.3;

  return hitX && hitY;
}

/* ============================================================
   RIM DEFLECTION — spin-based
============================================================ */
export function rimDeflect(ballX: number, rimX: number, spin: number): number {
  const side = ballX > rimX ? 1 : -1;
  const base = 0.25 + spin * 0.35;
  return side * base;
}

/* ============================================================
   RIM RATTLE — slight unpredictability
============================================================ */
export function rimRattle(power: number): number {
  return (Math.random() - 0.5) * (0.35 + power * 0.55);
}

/* ============================================================
   LIP-OUT CHANCE
============================================================ */
export function lipOutChance(power: number, spin: number): boolean {
  return Math.random() < (0.05 + power * 0.05 + spin * 0.08);
}

/* ============================================================
   BACKBOARD COLLISION DETECTION
============================================================ */
export function detectBackboardCollision(
  ball: Vec2,
  radius: number,
  board: Backboard
): boolean {
  const hitY = Math.abs(ball.y - board.y) < radius * 1.25;
  const hitX = Math.abs(ball.x - board.x) < board.width / 2 + radius;
  return hitX && hitY;
}

/* ============================================================
   BACKBOARD BOUNCE — dampened
============================================================ */
export function bankShotBounce(vx: number, power: number): number {
  return -vx * (0.45 + power * 0.2);
}

/* ============================================================
   ENERGY LOSS — Vertical
============================================================ */
export function bounceVertical(vy: number, power: number): number {
  return -Math.abs(vy) * (0.35 + power * 0.18);
}

/* ============================================================
   ENERGY LOSS — Horizontal
============================================================ */
export function bounceHorizontal(vx: number, power: number): number {
  return -vx * (0.35 + power * 0.15);
}

/* ============================================================
   RIM ASSIST — small magnetic pull centerwards
============================================================ */
export function rimAssist(ball: Vec2, rim: Rim): number {
  const dx = ball.x - rim.x;
  const d = Math.abs(dx);

  if (d < rim.width * 0.7) {
    return -dx * 0.03;
  }
  return 0;
}
