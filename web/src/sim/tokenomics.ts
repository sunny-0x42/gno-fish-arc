import { nextRarity, RARITIES, UGNOT, type Rarity } from "./catalog";

/** Practice sea scale. Spec range 1.00 is one 8-unit sector in this world. */
export const RANGE_WORLD = 8;
/** Spec speed 100 cruises at the old Minnow pace of 22 world units per second. */
export const STAT_SPEED_TO_WORLD = 0.22;
/** No FISH/USDC pool in this build. Practice lock price is 0.02 USDC per FISH. */
export const PRACTICE_TWAP_UGNOT_PER_FISH = 20_000;

/** Chain supply. The practice purse stays at GENESIS_FISH and is not rescaled to this. */
export const CHAIN_FISH_SUPPLY = 100_000_000;
export const CHAIN_FISH_DECIMALS = 6;
export const CHAIN_FISH_ALLOCATION = [
  { key: "season", label: "Season", whole: 43_000_000, bps: 4_300 },
  { key: "liquidity", label: "Liquidity", whole: 20_000_000, bps: 2_000 },
  { key: "ecosystem", label: "Ecosystem", whole: 15_000_000, bps: 1_500 },
  { key: "community", label: "Early community", whole: 12_000_000, bps: 1_200 },
  { key: "sale", label: "Public sale", whole: 5_000_000, bps: 500 },
  { key: "team", label: "Team", whole: 5_000_000, bps: 500 },
] as const;
/** Reserved for a later pool. A wallet transfer is not taxed. */
export const BUY_TAX_BPS = 200;
export const SELL_TAX_BPS = 400;
/** Secondary NFT buy on the collection. The practice sea does not run that buy. */
export const PROTOCOL_BPS = 200;
export const ROYALTY_BPS = 500;

export const MINT_GNOT = 150;
export const MINT_FEE_UGNOT = MINT_GNOT * UGNOT;
/** Lay fee. Same 60/20/10/10 split as mint. It is not locked on the NFT. */
export const LAY_FEE_UGNOT = 2 * UGNOT;
/** Finished matches since the previous lay before another lay can lock. */
export const LAY_BOUTS = 3;
/** Practice stand-in for two later blocks. A realm waits on chain height. */
export const LAY_SETTLE_MS = 8_000;

export function layMatchesLeft(bouts: number, layBoutsUsed: number): number {
  return Math.max(0, LAY_BOUTS - (bouts - layBoutsUsed));
}

export function layShortDetail(name: string, left: number): string {
  if (left === 1) return `Finish 1 more match with ${name} before a lay.`;
  return `Finish ${left} more matches with ${name} before a lay.`;
}
/** Quiet time after a bite before a living fish can leave with its stake. */
export const COMBAT_LOCK_MS = 5_000;
/** Staked sea floor. Swim refuses less than this. There is no product maximum. */
export const STAKE_MIN_GNOT = 10;
export const STAKE_MIN_UGNOT = STAKE_MIN_GNOT * UGNOT;
/** Largest ugnot amount that still fits in a JS safe integer. Not a game cap. */
export const STAKE_CEIL_UGNOT = Number.MAX_SAFE_INTEGER;
export const STAKE_BAND = `at least ${STAKE_MIN_GNOT}`;
export const HEAL_COOLDOWN_MS = 8 * 60 * 60 * 1000;
export const ICT_OFFSET_MS = 7 * 60 * 60 * 1000;
export const DEATH_HP_PERCENT = 30;
export const HEAL_HP_PERCENT = 40;
export const MIN_ENTER_HP_PERCENT = 30;
export const VIEWER_SHARDS = 10;
export const VIEWER_WINDOW_MS = 30_000;
export const VIEWER_WATCH_MS = 15_000;

export const SIZES = ["small", "medium", "large"] as const;
export type Size = (typeof SIZES)[number];
export const TRAITS = ["swift", "fang", "hide"] as const;
export type Trait = (typeof TRAITS)[number];

/** Sea stake. Zero and anything under the floor fail this check. */
export function stakeFitsSea(ugnot: number): boolean {
  const amount = Math.trunc(ugnot);
  return amount >= STAKE_MIN_UGNOT && amount <= STAKE_CEIL_UGNOT;
}

const SIZE_MOD: Record<Size, { speed: number; range: number; bite: number; hp: number }> = {
  small: { speed: 1.16, range: 0.86, bite: 0.86, hp: 0.88 },
  medium: { speed: 1, range: 1, bite: 1, hp: 1 },
  large: { speed: 0.88, range: 1.22, bite: 1.18, hp: 1.2 },
};

/** World units pulled off the attacker's bite radius. Large gains HP, not this dodge. */
const SIZE_DODGE: Record<Size, number> = {
  small: 2.4,
  medium: 0,
  large: 0,
};

/**
 * Trait dodge, in the same sea units. The NFT stores ten times this:
 * swift 24, hide 12, fang 4.
 */
export const TRAIT_DODGE: Record<Trait, number> = {
  swift: 2.4,
  hide: 1.2,
  fang: 0.4,
};

/** Cruise turn radius in world units. Small fish corner tighter. */
const TURN_RADIUS: Record<Size, number> = {
  small: 6.2,
  medium: 7.4,
  large: 8.8,
};
const TURN_RATE_MIN = 1.45;
const TURN_RATE_MAX = 4.4;

/** Prey when the other bite is lower by more than this. */
export const PREY_BITE_GAP = 4;
/** Threat when the other bite is higher by more than this. */
export const THREAT_BITE_GAP = 5;

/** Whole FISH, not ugnot. Success burns the fee. A failed roll burns half and returns half. */
const UPGRADE = [
  { to: "uncommon", fee: 150, successBps: 10_000 },
  { to: "rare", fee: 400, successBps: 9_000 },
  { to: "epic", fee: 1_000, successBps: 7_500 },
  { to: "legendary", fee: 2_500, successBps: 5_500 },
  { to: "mythic", fee: 6_000, successBps: 3_500 },
] as const;

export function isSize(value: string): value is Size {
  return (SIZES as readonly string[]).includes(value);
}

export function isTrait(value: string): value is Trait {
  return (TRAITS as readonly string[]).includes(value);
}

export function sizeIndex(size: Size): number {
  return SIZES.indexOf(size);
}

/** Meals before a small fish steps to medium, then large, then one aspect. */
export const GROW_MEDIUM_AT = 2;
export const GROW_LARGE_AT = 4;
export const GROW_EVOLVE_AT = 6;
/** About 30% on the practice counter. Not chain entropy. */
export const KILL_HEAL_BPS = 3_000;
export const KILL_HEAL_PERCENT = 15;

/** A bigger meal counts double. Same size or smaller counts once. */
export function growthGain(attacker: Size, victim: Size): number {
  if (sizeIndex(victim) >= sizeIndex(attacker) + 1) return 2;
  return 1;
}

/** Small becomes medium at 2, then large at 4. Large does not grow a fourth size. */
export function grownSize(size: Size, growth: number): Size {
  let next = size;
  if (next === "small" && growth >= GROW_MEDIUM_AT) next = "medium";
  if (next === "medium" && growth >= GROW_LARGE_AT) next = "large";
  return next;
}

/**
 * One practice shape, the next species, once a large fish has eaten enough.
 * Mythic has no next species. The NFT rarity stays put.
 */
export function aspectFor(rarity: Rarity, size: Size, growth: number, evolved: boolean): Rarity | null {
  if (evolved) return nextRarity(rarity);
  if (size !== "large" || growth < GROW_EVOLVE_AT) return null;
  return nextRarity(rarity);
}

/** Each species hunts the previous rarity. Common hunts mythic. */
export function preyOf(rarity: Rarity): Rarity {
  const index = RARITIES.indexOf(rarity);
  return RARITIES[(index + RARITIES.length - 1) % RARITIES.length];
}

/** Heal from a killing bite when the practice roll falls under KILL_HEAL_BPS. */
export function killHealGain(roll: number, hp: number, hpMax: number): number {
  if (roll < 0 || roll >= KILL_HEAL_BPS) return 0;
  const room = Math.max(0, Math.trunc(hpMax) - Math.max(0, Math.trunc(hp)));
  if (room <= 0) return 0;
  const gain = Math.max(1, percentOf(hpMax, KILL_HEAL_PERCENT));
  return Math.min(room, gain);
}

/** Nearest integer, half up, at least 1. Range stays fractional. */
export function roundStat(value: number): number {
  return Math.max(1, Math.round(value));
}

export function finalStats(input: {
  bite: number;
  hp: number;
  speed: number;
  range: number;
  trait: Trait;
  size: Size;
}): { bite: number; hp: number; speed: number; range: number; dodge: number } {
  const mod = SIZE_MOD[input.size];
  const biteTrait = input.trait === "fang" ? 1.12 : 1;
  const hpTrait = input.trait === "hide" ? 1.12 : 1;
  const speedTrait = input.trait === "swift" ? 1.12 : 1;
  return {
    bite: roundStat(input.bite * biteTrait * mod.bite),
    hp: roundStat(input.hp * hpTrait * mod.hp),
    speed: roundStat(input.speed * speedTrait * mod.speed),
    range: input.range * mod.range,
    dodge: SIZE_DODGE[input.size] + TRAIT_DODGE[input.trait],
  };
}

/** Size only. The mint card uses this before the trait roll. */
export function sizePreview(input: {
  bite: number;
  hp: number;
  speed: number;
  range: number;
  size: Size;
}): { bite: number; hp: number; speed: number; range: number; dodge: number } {
  const mod = SIZE_MOD[input.size];
  return {
    bite: roundStat(input.bite * mod.bite),
    hp: roundStat(input.hp * mod.hp),
    speed: roundStat(input.speed * mod.speed),
    range: input.range * mod.range,
    dodge: SIZE_DODGE[input.size],
  };
}

export function biteRadius(rangeStat: number): number {
  return rangeStat * RANGE_WORLD;
}

/** Attacker radius minus the defender dodge. A touch still lands. */
export function biteReach(radius: number, defenderDodge: number): number {
  const reach = radius - Math.max(0, defenderDodge);
  return reach < 1 ? 1 : reach;
}

export function inBiteRadius(ax: number, az: number, bx: number, bz: number, radius: number): boolean {
  return Math.hypot(ax - bx, az - bz) <= radius + 1e-9;
}

/** Mouth half-angle. Wider than a straight line, narrower than the front half. */
export const MOUTH_ALIGN = Math.cos((42 * Math.PI) / 180);

/** Snout offset in front of the body center. Large mouths sit farther forward. */
const MOUTH_LEAD: Record<Size, number> = {
  small: 0.7,
  medium: 1,
  large: 1.45,
};

/** Centers this close are on the body. Live fish stay farther apart than this. */
const MOUTH_CONTACT = 1;

/**
 * A bite lands only in front of the mouth, inside `reach` measured from the body center.
 * A fish on the flank or behind the tail misses even when the old circle would reach.
 */
export function mouthBite(
  ax: number,
  az: number,
  faceDx: number,
  faceDz: number,
  size: Size,
  bx: number,
  bz: number,
  reach: number,
): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  const dist = Math.hypot(dx, dz);
  if (dist > reach + 1e-9) return false;
  if (dist <= MOUTH_CONTACT) return true;
  let fx = faceDx;
  let fz = faceDz;
  const span = Math.hypot(fx, fz);
  if (span < 1e-6) {
    fx = 0;
    fz = -1;
  } else {
    fx /= span;
    fz /= span;
  }
  const lead = MOUTH_LEAD[size];
  const mx = dx - fx * lead;
  const mz = dz - fz * lead;
  const mouthDist = Math.hypot(mx, mz);
  if (mouthDist < 1e-6) return true;
  return (mx * fx + mz * fz) / mouthDist + 1e-9 >= MOUTH_ALIGN;
}

export function streakSpeedFactor(kills: number): number {
  if (kills < 4) return 1;
  const pct = Math.min(24, (kills - 3) * 8);
  return (100 - pct) / 100;
}

export function worldUnitsPerSecond(statSpeed: number, kills: number): number {
  return statSpeed * STAT_SPEED_TO_WORLD * streakSpeedFactor(kills);
}

/** World units per second. A halt is a full stop. Slow is 0.45. Burst is 7/4. */
export function cruisePace(units: number, slow: boolean, bursting: boolean, halted: boolean): number {
  if (halted) return 0;
  let pace = units;
  if (slow) pace *= 0.45;
  if (bursting) pace *= 7 / 4;
  return pace;
}

/** Yaw rate from cruise and size. Burst and slow do not change it. */
export function turnRateRad(statSpeed: number, size: Size, kills = 0): number {
  const cruise = Math.max(0.01, worldUnitsPerSecond(statSpeed, kills));
  const rate = cruise / TURN_RADIUS[size];
  if (rate < TURN_RATE_MIN) return TURN_RATE_MIN;
  if (rate > TURN_RATE_MAX) return TURN_RATE_MAX;
  return rate;
}

/**
 * D = floor(bite * 100 / (hpMax + 100)), at least 1.
 * Size and rarity do not change the hit. A large fish is not halved against a small one.
 */
export function strikeDamage(
  biteFinal: number,
  defenderHpMax: number,
  _attackerSize: Size,
  _defenderSize: Size,
  _attackerRarity?: Rarity,
  _defenderRarity?: Rarity,
): number {
  const hp = Math.max(0, Math.trunc(defenderHpMax));
  const damage = Math.floor((Math.trunc(biteFinal) * 100) / (hp + 100));
  return damage < 1 ? 1 : damage;
}

/** Mint and lay: 60% upgrade treasury, 20% liquidity, 10% team, 10% burn. Dust joins burn. */
export function splitMint(fee: number): { upgradeTreasury: number; lp: number; burn: number; team: number } {
  const amount = Math.max(0, Math.trunc(fee));
  const upgradeTreasury = Math.floor((amount * 6_000) / 10_000);
  const lp = Math.floor((amount * 2_000) / 10_000);
  const team = Math.floor((amount * 1_000) / 10_000);
  const burn = amount - upgradeTreasury - lp - team;
  return { upgradeTreasury, lp, burn, team };
}

export function upgradeTo(rarity: string): { fee: number; successBps: number } | null {
  const row = UPGRADE.find((item) => item.to === rarity);
  return row ? { fee: row.fee, successBps: row.successBps } : null;
}

export function splitFailFee(fee: number): { burn: number; refund: number } {
  const amount = Math.max(0, Math.trunc(fee));
  const burn = Math.floor((amount * 5_000) / 10_000);
  return { burn, refund: amount - burn };
}

export type KillSplit = {
  killer: number;
  lp: number;
  team: number;
  buyback: number;
  cheer: number;
};

/** The stake a kill may split. The larger stake is not loot. */
export function coveredStake(killerPool: number, victimPool: number): number {
  const killer = Math.max(0, Math.trunc(killerPool));
  const victim = Math.max(0, Math.trunc(victimPool));
  return Math.min(killer, victim);
}

/** 80/10/3/3/4. Killer, liquidity, team, FISH buyback, cheer. Dust from flooring joins the buyback. */
export function splitKill(total: number): KillSplit {
  const amount = Math.max(0, Math.trunc(total));
  const killer = Math.floor((amount * 8_000) / 10_000);
  const lp = Math.floor((amount * 1_000) / 10_000);
  const team = Math.floor((amount * 300) / 10_000);
  const buyback = Math.floor((amount * 300) / 10_000);
  const cheer = Math.floor((amount * 400) / 10_000);
  const dust = amount - killer - lp - team - buyback - cheer;
  return { killer, lp, team, buyback: buyback + dust, cheer };
}

/**
 * Spend the buyback at the labeled practice price. FISH comes from the reserve.
 * A short reserve buys fewer and does not mint the rest. USDC that does not buy a FISH burns.
 */
export function buybackAtTwap(budgetUgnot: number, reserveFish: number): { fish: number; spentUgnot: number; dustUgnot: number } {
  const budget = Math.max(0, Math.trunc(budgetUgnot));
  const reserve = Math.max(0, Math.trunc(reserveFish));
  const affordable = Math.floor(budget / PRACTICE_TWAP_UGNOT_PER_FISH);
  const fish = Math.min(affordable, reserve);
  const spentUgnot = fish * PRACTICE_TWAP_UGNOT_PER_FISH;
  return { fish, spentUgnot, dustUgnot: budget - spentUgnot };
}

/** 1 whole FISH per 1 whole USDC of the stake passed in. A kill passes the covered stake. A short reserve pays less and does not mint. */
export function winFishReward(stakeUgnot: number, reserveFish: number): number {
  const whole = Math.floor(Math.max(0, Math.trunc(stakeUgnot)) / UGNOT);
  return Math.min(whole, Math.max(0, Math.trunc(reserveFish)));
}

/** Full +10% FISH bonus. A smaller party gets a linear step toward this crew size. */
export const PARTY_FISH_BONUS_FULL = 8;
export const PARTY_FISH_BONUS_CAP_BPS = 1_000;

/** 0 for a solo fish. +10% once the party has 8 members. Larger parties stay at +10%. */
export function partyFishBonusBps(members: number): number {
  const n = Math.trunc(members);
  if (n <= 1) return 0;
  const extra = Math.min(n, PARTY_FISH_BONUS_FULL) - 1;
  return Math.floor((extra * PARTY_FISH_BONUS_CAP_BPS) / (PARTY_FISH_BONUS_FULL - 1));
}

/** Extra FISH on top of the base win. `reserveLeft` is what remains after the base is paid. */
export function partyFishBonusFish(baseFish: number, members: number, reserveLeft: number): number {
  const base = Math.max(0, Math.trunc(baseFish));
  const wanted = Math.floor((base * partyFishBonusBps(members)) / 10_000);
  return Math.min(wanted, Math.max(0, Math.trunc(reserveLeft)));
}

/** Equal whole FISH. Dust from flooring goes to the fish that landed the kill. */
export function splitPartyBonus(bonus: number, count: number, killerIndex: number): number[] {
  const amount = Math.max(0, Math.trunc(bonus));
  const n = Math.max(0, Math.trunc(count));
  const out = Array.from({ length: n }, () => 0);
  if (amount === 0 || n === 0) return out;
  const each = Math.floor(amount / n);
  for (let i = 0; i < n; i++) out[i] = each;
  const dustAt = killerIndex >= 0 && killerIndex < n ? killerIndex : 0;
  out[dustAt] += amount - each * n;
  return out;
}

export function cheerValueUgnot(asset: "gnot" | "fish", amount: number): number {
  const qty = Math.max(0, Math.trunc(amount));
  if (asset === "gnot") return qty;
  return Math.floor(qty * PRACTICE_TWAP_UGNOT_PER_FISH);
}

export function ictDayIndex(now: number): number {
  return Math.floor((now + ICT_OFFSET_MS) / (24 * 60 * 60 * 1000));
}

/** cost = 0.5 * tierId * (hoursCut / 8) USDC, in ugnot. */
export function healSkipUgnot(tierId: number, remainingMs: number): number {
  const ms = Math.max(0, Math.trunc(remainingMs));
  const tier = Math.max(0, Math.trunc(tierId));
  return Math.floor((tier * ms * UGNOT) / (16 * 3_600_000));
}

export function percentOf(total: number, percent: number): number {
  return Math.floor((Math.max(0, Math.trunc(total)) * percent) / 100);
}
