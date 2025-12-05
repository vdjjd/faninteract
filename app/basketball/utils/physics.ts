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
   TRUE PARABOLIC ARC + VISUAL GRAVITY EASING
============================================================ */
/**
 * p = 0 → 1 → parabolic path (up then down)
 * But eased visually so it *feels* smooth.
 */
export function computeArcY(progress: number, power: number): number {
  const rawArc = 4 * progress * (1 - progress); // true parabola 0→1→0

  // Add slight arcade exaggeration to apex height
  const height = 80 + power * 60;

  return rawArc * height;
}

/* ============================================================
   SIDE-BIAS SPIN EFFECT (arcade realism)
============================================================ */
export function computeArcX(progress: number, power: number, spin: number) {
  // forward motion based on shot strength
  const forward = progress * (26 + power * 18);

  // side deviation based on spin
  const sideCurve = spin * (progress * 14);

  return (progress - 0.5) * 10 + forward * 0.02 + sideCurve;
}

/* ============================================================
   RIM COLLISION (REALISTIC CYLINDER)
============================================================ */
export function detectRimCollision(ball: Vec2, radius: number, rim: Rim): boolean {
  const half = rim.width / 2;

  // Check if ball intersects rim cylinder region
  const withinX = ball.x > rim.x - half - radius && ball.x < rim.x + half + radius;
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
   RIM RATTLING — natural but enhanced
============================================================ */
export function rimRattle(power: number): number {
  return (Math.random() - 0.5) * (0.4 + power * 0.6);
}

/* ============================================================
   ARCADE-STYLE “MAGNETIC RIM ASSIST”
   Helps borderline shots feel satisfying.
============================================================ */
export function rimAssist(ball: Vec2, rim: Rim): number {
  const dx = ball.x - rim.x;
  const dist = Math.abs(dx);

  if (dist < rim.width * 0.6) {
    return -dx * 0.03; // small pull toward center
  }

  return 0;
}

/* ============================================================
   LIP-OUT CHANCE
============================================================ */
export function lipOutChance(power: number, spin: number): boolean {
  // realistic baseline + arcade spin influence
  const probability = 0.05 + power * 0.06 + spin * 0.08;
  return Math.random() < probability;
}

/* ============================================================
   BACKBOARD COLLISION (REALISTIC)
============================================================ */
export function detectBackboardCollision(ball: Vec2, radius: number, board: Backboard): boolean {
  const withinY = Math.abs(ball.y - board.y) < radius * 1.4;
  const withinX = Math.abs(ball.x - board.x) < board.width / 2 + radius;

  return withinX && withinY;
}

/* ============================================================
   BANK SHOT BOUNCE (ENERGY LOSS)
============================================================ */
export function bankShotBounce(velocityX: number, power: number): number {
  // Realistic dampened bounce with slight arcade push
  return -velocityX * (0.45 + power * 0.2);
}

/* ============================================================
   VERTICAL BOUNCE — loss of energy
============================================================ */
export function bounceVertical(vy: number, power: number): number {
  return -Math.abs(vy) * (0.38 + power * 0.18);
}

/* ============================================================
   HORIZONTAL BOUNCE
============================================================ */
export function bounceHorizontal(vx: number, power: number): number {
  return -vx * (0.35 + power * 0.2);
}
