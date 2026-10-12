/** One chain cell. A realm stores `sx` and `sz`, not a Three.js coordinate. */
export const SECTOR = 8;
export const SEA_RADIUS = 360;

export type Sector = { sx: number; sz: number };

export function sectorOf(x: number, z: number): Sector {
  return { sx: Math.floor(x / SECTOR), sz: Math.floor(z / SECTOR) };
}

export function sectorCenter(sx: number, sz: number): { x: number; z: number } {
  return { x: (sx + 0.5) * SECTOR, z: (sz + 0.5) * SECTOR };
}

export function sectorInSea(sx: number, sz: number): boolean {
  const center = sectorCenter(sx, sz);
  return Math.hypot(center.x, center.z) <= SEA_RADIUS;
}

/** Burst multiplies cruise speed by 7/4 for this long, then waits. */
export const BURST_MULT_NUM = 7;
export const BURST_MULT_DEN = 4;
export const BURST_MS = 1_000;
export const BURST_COOLDOWN_MS = 2_000;

/** Time to cross one cell. A live burst uses the faster speed. */
export function moveDelayMs(speed: number, bursting = false): number {
  const paced = bursting ? Math.floor((speed * BURST_MULT_NUM) / BURST_MULT_DEN) : speed;
  return Math.max(1, Math.floor((SECTOR * 1000) / Math.max(1, Math.trunc(paced))));
}

export function clampToSector(sx: number, sz: number, x: number, z: number): { x: number; z: number } {
  const pad = 0.05;
  return {
    x: Math.min((sx + 1) * SECTOR - pad, Math.max(sx * SECTOR + pad, x)),
    z: Math.min((sz + 1) * SECTOR - pad, Math.max(sz * SECTOR + pad, z)),
  };
}

/**
 * Quantize a world forward into a sector step.
 * Yaw 0 faces -Z, so forward (0, -1) becomes `{ dx: 0, dz: -1 }`.
 */
export function facingFromForward(x: number, z: number): { dx: number; dz: number } {
  const len = Math.hypot(x, z);
  if (len < 1e-6) return { dx: 0, dz: -1 };
  const fx = x / len;
  const fz = z / len;
  const ax = Math.abs(fx);
  const az = Math.abs(fz);
  const dx = ax < 0.38 ? 0 : fx > 0 ? 1 : -1;
  const dz = az < 0.38 ? 0 : fz > 0 ? 1 : -1;
  if (dx !== 0 || dz !== 0) return { dx, dz };
  if (ax >= az) return { dx: fx > 0 ? 1 : -1, dz: 0 };
  return { dx: 0, dz: fz > 0 ? 1 : -1 };
}

/**
 * Same cell, or a cell inside `reach` that is not strictly behind the facing.
 * `reach` defaults to 1 so a one-sector fish keeps the old arc.
 */
export function inBiteArc(
  from: Sector,
  to: Sector,
  face: { dx: number; dz: number },
  reach = 1,
): boolean {
  const dx = to.sx - from.sx;
  const dz = to.sz - from.sz;
  const span = Math.max(1, Math.trunc(reach));
  if (Math.max(Math.abs(dx), Math.abs(dz)) > span) return false;
  if (dx === 0 && dz === 0) return true;
  return dx * face.dx + dz * face.dz >= 0;
}

export function sharePool(pool: number, weights: number[]): number[] {
  const amount = Math.max(0, Math.trunc(pool));
  if (weights.length === 0 || amount === 0) return weights.map(() => 0);
  const total = weights.reduce((sum, w) => sum + Math.max(0, Math.trunc(w)), 0);
  if (total <= 0) return weights.map(() => 0);
  const out = weights.map(() => 0);
  let used = 0;
  let top = 0;
  for (let i = 0; i < weights.length; i++) {
    out[i] = Math.floor((amount * Math.max(0, Math.trunc(weights[i]))) / total);
    used += out[i];
    if (weights[i] > weights[top]) top = i;
  }
  out[top] += amount - used;
  return out;
}
