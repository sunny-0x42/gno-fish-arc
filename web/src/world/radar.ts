/** Same inset the fish blips use. Do not change the fish radii. */
export const RADAR_INSET = 8;

/** World offset from the radar center. +Z moves down the canvas, matching the sea map. */
export function radarBlip(
  dx: number,
  dz: number,
  arena: number,
  width: number,
  height: number,
  inset = RADAR_INSET,
): { x: number; y: number } {
  return {
    x: width / 2 + (dx / arena) * (width / 2 - inset),
    y: height / 2 + (dz / arena) * (height / 2 - inset),
  };
}

/** Keep a mark inside the radar disc. `outside` means it was pulled in from past the rim. */
export function clampToDisc(
  x: number,
  y: number,
  cx: number,
  cy: number,
  radius: number,
): { x: number; y: number; outside: boolean } {
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.hypot(dx, dy);
  if (dist <= radius || dist < 1e-6) return { x, y, outside: false };
  const scale = radius / dist;
  return { x: cx + dx * scale, y: cy + dy * scale, outside: true };
}

/** NDC from `Vector3.project`. +Y on screen is up, so canvas Y flips. */
export function viewPoint(ndcX: number, ndcY: number, width: number, height: number): { x: number; y: number } {
  return {
    x: (ndcX * 0.5 + 0.5) * width,
    y: (-ndcY * 0.5 + 0.5) * height,
  };
}

/** In front of the camera and inside the padded view. Behind the camera is NDC z > 1. */
export function inView(ndcZ: number, x: number, y: number, width: number, height: number, pad: number): boolean {
  if (ndcZ > 1) return false;
  return x >= pad && y >= pad && x <= width - pad && y <= height - pad;
}
