/* ============================================================
   ADVANCED 2.5D POP-A-SHOT PHYSICS ENGINE
   (Ball-on-ball collisions + depth + rim/backboard)
============================================================ */

export interface Vec2 {
  x: number;
  y: number;
}

export interface BallPhysics {
  x: number;          // horizontal position
  y: number;          // screen Y position
  z: number;          // depth (0 = front, 1 = far)
  vx: number;         // velocity X
  vy: number;         // velocity Y (screen)
  vz: number;         // velocity depth
  radius: number;
}

export interface Rim {
  x: number;
  y: number;     // screen Y
  z: number;     // depth position
  width: number;
}

export interface Backboard {
  x: number;
  y: number;
  z: number;
  width: number;
}

/* ============================================================
   CONSTANTS (you can tune these)
============================================================ */

export const BALL_RADIUS = 19;
export const GRAVITY = 0.65;         // falling strength
export const FRICTION = 0.92;        // rolling slowdown
export const BOUNCE_DAMP = 0.45;     // bounce energy loss
export const COLLISION_DAMP = 0.85;  // ball/ball collision softness

export const ARC_HEIGHT = 32;        // vertical arc
export const RIM_Z = 0.55;           // rim depth
export const FLOOR_Z = 0.80;         // fall depth
export const FRONT_Z = 0.00;         // where balls roll to

/* ============================================================
   DEPTH → SCALE PROJECTION
============================================================ */
export function depthToScale(z: number): number {
  return 1 - z * 0.55;
}

/* ============================================================
   DEPTH → SCREEN Y PROJECTION
============================================================ */
export function projectY(baseY: number, z: number): number {
  return baseY - z * 22; // adjust if needed
}

/* ============================================================
   SPIN DRIFT (small, realistic)
============================================================ */
export function spinDrift(spin: number, z: number): number {
  return spin * (1 - z) * 1.2;
}

/* ============================================================
   VERTICAL ARC (parabolic)
============================================================ */
export function computeArc(progress: number, power: number): number {
  const p = Math.max(0, Math.min(progress, 1));
  return (4 * p * (1 - p)) * (ARC_HEIGHT + power * 16);
}

/* ============================================================
   BALL-ON-BALL COLLISION RESPONSE
============================================================ */
export function resolveBallCollision(a: BallPhysics, b: BallPhysics) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const minDist = a.radius + b.radius;

  if (dist >= minDist || dist === 0) return;

  const overlap = minDist - dist;
  const nx = dx / dist;
  const ny = dy / dist;

  // Push balls apart proportionally
  a.x -= nx * overlap * 0.5;
  a.y -= ny * overlap * 0.5;
  b.x += nx * overlap * 0.5;
  b.y += ny * overlap * 0.5;

  // Swap velocity along collision normal
  const dvx = b.vx - a.vx;
  const dvy = b.vy - a.vy;
  const impact = dvx * nx + dvy * ny;

  if (impact > 0) return;

  const impulse = -(1 + COLLISION_DAMP) * impact * 0.5;

  a.vx -= impulse * nx;
  a.vy -= impulse * ny;
  b.vx += impulse * nx;
  b.vy += impulse * ny;
}

/* ============================================================
   RIM COLLISION (2D cylinder)
============================================================ */
export function detectRimCollision(ball: BallPhysics, rim: Rim): boolean {
  const dx = ball.x - rim.x;
  const dy = ball.y - rim.y;

  const half = rim.width / 2;
  const withinX = Math.abs(dx) < half + ball.radius;
  const withinY = Math.abs(dy) < ball.radius * 1.4;

  return withinX && withinY;
}

export function applyRimBounce(ball: BallPhysics) {
  ball.vx = -ball.vx * BOUNCE_DAMP;
  ball.vy = -ball.vy * BOUNCE_DAMP;
}

/* ============================================================
   BACKBOARD COLLISION
============================================================ */
export function detectBackboardCollision(ball: BallPhysics, board: Backboard): boolean {
  const withinZ = Math.abs(ball.z - board.z) < 0.08;
  const withinY = Math.abs(ball.y - board.y) < ball.radius * 1.5;
  const withinX = Math.abs(ball.x - board.x) < board.width / 2 + ball.radius;

  return withinZ && withinX && withinY;
}

export function applyBackboardBounce(ball: BallPhysics) {
  ball.vy = -ball.vy * BOUNCE_DAMP;
  ball.vx *= 0.75;
}

/* ============================================================
   UPDATE BALL PHYSICS (per frame)
============================================================ */
export function updateBall(ball: BallPhysics) {

  // Apply velocity
  ball.x += ball.vx;
  ball.y += ball.vy;
  ball.z += ball.vz;

  // Gravity when falling past the rim
  if (ball.z > RIM_Z) {
    ball.vy -= GRAVITY;
  }

  // Ball hits ground plane (FLOOR_Z)
  if (ball.z > FLOOR_Z) {
    ball.z = FLOOR_Z;
    ball.vz = 0;
    ball.vy = -ball.vy * BOUNCE_DAMP;

    // If almost stopped → start rolling forward
    if (Math.abs(ball.vy) < 0.4) {
      ball.vy = 0;
    }
  }

  // Rolling toward player
  if (ball.z <= FLOOR_Z && ball.y <= 10) {
    ball.vz = -0.02; // roll forward
  }

  // Friction slows rolling balls
  ball.vx *= FRICTION;
  ball.vy *= FRICTION;
  ball.vz *= FRICTION;

  return ball;
}
