import type { Size } from "./tokenomics";

/** Reefs and caves. Meshes in scenery.ts read this same list. */
export type ShelterKind = "reef" | "cave";

export type ShelterLayout = {
  id: string;
  kind: ShelterKind;
  x: number;
  z: number;
  /** Outer read of the structure. The pocket collider is `inner`. */
  radius: number;
  /** Pocket radius. Large fish cannot enter. Caves also refuse medium. */
  inner: number;
};

export type RockLayout = {
  id: string;
  x: number;
  z: number;
  radius: number;
};

export const SHELTER_HP = 64;
export const SHELTER_REBUILD_MS = 20_000;
export const SPRING_PERIOD_MS = 20_000;
export const SPRING_LIFE_MS = 15_000;
export const SPRING_RADIUS = 3;
export const SPRING_HEAL_PERCENT = 20;

/** Fixed pockets. Spawn cells stay outside `inner`. */
export const SHELTERS: readonly ShelterLayout[] = [
  { id: "reef-lee", kind: "reef", x: 96, z: 8, radius: 11, inner: 5.2 },
  { id: "reef-spur", kind: "reef", x: -120, z: 72, radius: 12, inner: 5.6 },
  { id: "cave-north", kind: "cave", x: 28, z: -110, radius: 10, inner: 4.4 },
  { id: "cave-south", kind: "cave", x: -140, z: 150, radius: 10, inner: 4.4 },
];

/** Solid discs. Every size slides out. The mesh scale is this radius. */
export const ROCKS: readonly RockLayout[] = [
  { id: "rock-lane", x: 18, z: -24, radius: 3.6 },
  { id: "rock-gap", x: -8, z: 48, radius: 3.6 },
  { id: "rock-rise", x: 120, z: -48, radius: 4.2 },
];

/**
 * Idle cruise radius for rival `seq`.
 * 88, 104, 120, 136, 152 sit on the reef ring and stay inside the 360 sea.
 * SeaView is the only caller.
 */
export function idleCruiseRadius(seq: number): number {
  const step = ((Math.trunc(seq) % 5) + 5) % 5;
  return 88 + step * 16;
}

/** Reef: small and medium. Cave: small. Large never enters a living shelter. */
export function shelterAdmits(kind: ShelterKind, size: Size): boolean {
  if (size === "large") return false;
  if (kind === "cave") return size === "small";
  return size === "small" || size === "medium";
}

export type SpringSpot = { x: number; z: number; born: number; until: number };

/**
 * One spring for the first 15s of each 20s window.
 * Angle and radius follow the window index, so the spot is not one coordinate.
 */
export function springSlot(now: number): SpringSpot | null {
  if (now < 0) return null;
  const slot = Math.floor(now / SPRING_PERIOD_MS);
  const born = slot * SPRING_PERIOD_MS;
  const until = born + SPRING_LIFE_MS;
  if (now >= until) return null;
  const angle = (slot * 2.399963) % (Math.PI * 2);
  const radius = 48 + ((slot * 17) % 9) * 22;
  return {
    x: Math.cos(angle) * radius,
    z: Math.sin(angle) * radius,
    born,
    until,
  };
}

export type BlockDisc = { x: number; z: number; radius: number };

/** Push a point out of every disc. A zero vector leaves along +Z. */
export function escapePoint(x: number, z: number, blocks: readonly BlockDisc[]): { x: number; z: number } {
  let px = x;
  let pz = z;
  for (let pass = 0; pass < 4; pass++) {
    let hit = false;
    for (const block of blocks) {
      let dx = px - block.x;
      let dz = pz - block.z;
      const dist = Math.hypot(dx, dz);
      if (dist >= block.radius - 1e-6) continue;
      hit = true;
      if (dist < 1e-4) {
        dx = 0;
        dz = 1;
      } else {
        dx /= dist;
        dz /= dist;
      }
      px = block.x + dx * block.radius;
      pz = block.z + dz * block.radius;
    }
    if (!hit) break;
  }
  return { x: px, z: pz };
}
