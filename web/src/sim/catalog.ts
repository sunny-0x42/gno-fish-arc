export const RARITIES = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
  "mythic",
] as const;

export type Rarity = (typeof RARITIES)[number];

export const UGNOT = 1_000_000;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const HEALS_PER_DAY = 2;
export const HEAL_GAP_MS = 6 * 60 * 60 * 1000;
export const PLAYER_RESPAWN_MS = 8 * 60 * 60 * 1000;
export const AI_RESPAWN_MS = 20_000;
export const CHEER_MS = 10 * 60 * 1000;
export const GENESIS_GNOT = 20_000 * UGNOT;
export const GENESIS_FISH = 1_000_000;
export const PLAYER_START_GNOT = 2_000 * UGNOT;
export const VIEWER_START_GNOT = 500 * UGNOT;
export const VIEWER_START_FISH = 200;
export const MIN_CHEER_GNOT = 1 * UGNOT;
export const MIN_CHEER_FISH = 10;

export type Species = {
  rarity: Rarity;
  species: string;
  blurb: string;
  tierId: number;
  /** Base stats before trait and size. */
  hp: number;
  bite: number;
  speed: number;
  range: number;
  scale: number;
  biteCooldownMs: number;
  biteRange: number;
  skill: string;
};

/** Two heads climb one tier. Any other pair stops. Astravex is five climbs. */
export const COIN_FLIP_ODDS: Record<Rarity, string> = {
  common: "3 in 4",
  uncommon: "3 in 16",
  rare: "3 in 64",
  epic: "3 in 256",
  legendary: "3 in 1024",
  mythic: "1 in 1024",
};

/** A second coin flip, on bits the species roll does not use. */
export const TRAIT_COIN_ODDS = {
  swift: "1 in 2",
  fang: "1 in 4",
  hide: "1 in 4",
} as const;

export const SPECIES: Record<Rarity, Species> = {
  common: {
    rarity: "common",
    species: "Bubble",
    blurb: "A small round body. The shortest bite.",
    tierId: 1,
    hp: 100,
    bite: 22,
    speed: 100,
    range: 1,
    scale: 0.72,
    biteCooldownMs: 1000,
    biteRange: 4.4,
    skill: "Nip",
  },
  uncommon: {
    rarity: "uncommon",
    species: "Tideblade",
    blurb: "A long blade of a body and a sharp lunge.",
    tierId: 2,
    hp: 112,
    bite: 26,
    speed: 97,
    range: 1.06,
    scale: 0.95,
    biteCooldownMs: 1000,
    biteRange: 5.1,
    skill: "Lunge",
  },
  rare: {
    rarity: "rare",
    species: "Abysswing",
    blurb: "Wide fins. Holds a lane.",
    tierId: 3,
    hp: 126,
    bite: 31,
    speed: 94,
    range: 1.12,
    scale: 1.2,
    biteCooldownMs: 1000,
    biteRange: 5.8,
    skill: "Spine bite",
  },
  epic: {
    rarity: "epic",
    species: "Embermaw",
    blurb: "A hot jaw and a heavy bite.",
    tierId: 4,
    hp: 142,
    bite: 37,
    speed: 91,
    range: 1.18,
    scale: 1.5,
    biteCooldownMs: 1000,
    biteRange: 6.6,
    skill: "Lure bite",
  },
  legendary: {
    rarity: "legendary",
    species: "Aurelion",
    blurb: "Long fins. The sea makes room.",
    tierId: 5,
    hp: 160,
    bite: 44,
    speed: 88,
    range: 1.24,
    scale: 1.9,
    biteCooldownMs: 1000,
    biteRange: 7.6,
    skill: "Gold fang",
  },
  mythic: {
    rarity: "mythic",
    species: "Astravex",
    blurb: "A heavy bite with a long reach.",
    tierId: 6,
    hp: 180,
    bite: 52,
    speed: 85,
    range: 1.32,
    scale: 2.4,
    biteCooldownMs: 1000,
    biteRange: 8.8,
    skill: "Abyss bite",
  },
};

export const RIVAL_PLAN: {
  rarity: Rarity;
  name: string;
  size: "small" | "medium" | "large";
  trait: "swift" | "fang" | "hide";
  stakeGnot: number;
}[] = [
  { rarity: "common", name: "Pebble", size: "small", trait: "swift", stakeGnot: 16 },
  { rarity: "common", name: "Silt", size: "medium", trait: "fang", stakeGnot: 24 },
  { rarity: "common", name: "Nacre", size: "large", trait: "hide", stakeGnot: 36 },
  { rarity: "uncommon", name: "Kelp", size: "medium", trait: "fang", stakeGnot: 50 },
  { rarity: "uncommon", name: "Current", size: "small", trait: "swift", stakeGnot: 80 },
  { rarity: "rare", name: "Brine", size: "large", trait: "hide", stakeGnot: 200 },
  { rarity: "epic", name: "Vortex", size: "medium", trait: "fang", stakeGnot: 300 },
  { rarity: "legendary", name: "Marrow", size: "large", trait: "fang", stakeGnot: 800 },
  { rarity: "common", name: "Foam", size: "medium", trait: "hide", stakeGnot: 20 },
  { rarity: "common", name: "Drift", size: "medium", trait: "swift", stakeGnot: 28 },
  { rarity: "common", name: "Coral", size: "large", trait: "fang", stakeGnot: 36 },
  { rarity: "uncommon", name: "Tide", size: "medium", trait: "swift", stakeGnot: 48 },
  { rarity: "uncommon", name: "Anemone", size: "large", trait: "hide", stakeGnot: 70 },
  { rarity: "rare", name: "Wreck", size: "large", trait: "fang", stakeGnot: 120 },
];

/** First four stay reef, the next four stay abyss, and later fish alternate. */
export function rivalClanId(index: number): "reef" | "abyss" {
  if (index < 8) return index < 4 ? "reef" : "abyss";
  return index % 2 === 0 ? "reef" : "abyss";
}

export function isRarity(value: string): value is Rarity {
  return (RARITIES as readonly string[]).includes(value);
}

export function nextRarity(rarity: Rarity): Rarity | null {
  const index = RARITIES.indexOf(rarity);
  if (index < 0 || index + 1 >= RARITIES.length) return null;
  return RARITIES[index + 1];
}
