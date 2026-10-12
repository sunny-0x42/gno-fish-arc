import { ARC_COLLECTION_MICRO } from "../chain/arc";
import { nextRarity } from "../sim/catalog";
import { formatFish, formatGnot, formatLeft } from "../sim/format";
import { PLAYER_ID, SEA_ID, VIEWER_ID, type Claim, type FishNft, type HealView } from "../sim/game";
import { COMBAT_LOCK_MS, LAY_FEE_UGNOT, LAY_SETTLE_MS, MIN_ENTER_HP_PERCENT, MINT_FEE_UGNOT, STAKE_BAND, VIEWER_WATCH_MS, layMatchesLeft, layShortDetail, stakeFitsSea, upgradeTo } from "../sim/tokenomics";
import { seaFish } from "./selection";
import type { ShoalSnap } from "./useShoal";

type SeaSnap = Pick<ShoalSnap, "fish" | "matches">;
export type ActionGate = { ready: boolean; reason: string | null };
const gate = (reason: string | null): ActionGate => ({ ready: reason === null, reason });
export const remaining = (deadline: number, now: number) => Math.max(0, deadline - now);

/** Presentation only: never tests readiness by invoking or mutating a game action. */
export function combatState(fish: FishNft, now: number) {
  return {
    biteLeft: remaining(fish.nextBiteAt, now),
    burstLeft: remaining(fish.nextBurstAt, now),
    burstActive: remaining(fish.burstUntil, now),
    quietLeft: fish.lastCombatAt < 0 ? 0 : remaining(fish.lastCombatAt + COMBAT_LOCK_MS, now),
  };
}

export function liveTarget(snap: SeaSnap, targetId: string | null, youId: string) {
  return seaFish(snap).find((fish) => fish.id === targetId && fish.id !== youId) ?? null;
}

export function ownedState(fish: FishNft, snap: SeaSnap, now: number) {
  if (fish.burned || !fish.alive) return { status: "Unavailable", next: "Choose another fish." };
  if (seaFish(snap).some((item) => item.id === fish.id)) return { status: "In the sea", next: "Play, or leave after the quiet window." };
  if (fish.layCommitAt !== null) {
    const left = remaining(fish.layCommitAt + LAY_SETTLE_MS, now);
    return { status: "Lay locked", next: left > 0 ? `Settle in ${formatLeft(left)}. No cancel.` : "Settle the lay, then swim." };
  }
  if (fish.mustHeal) return { status: "Needs heal", next: "Heal outside the sea before swimming." };
  if (fish.hp * 100 < fish.hpMax * MIN_ENTER_HP_PERCENT) return { status: "Low HP", next: "Heal to at least 30% HP before swimming." };
  return { status: fish.bouts < 1 ? "Needs a match" : "Ready to swim", next: fish.bouts < 1 ? "Choose a pool stake of at least 1 USDC. Leaving does not finish a match." : "Choose a pool stake of at least 1 USDC, or check Lay / Upgrade." };
}

export function mintGate(snap: Pick<ShoalSnap, "fish" | "player">) {
  const unplayed = snap.fish.find((fish) => fish.ownerId === PLAYER_ID && !fish.burned && fish.bouts < 1);
  return gate(unplayed ? `Finish a match with ${unplayed.name} before minting another. Leaving does not count.` : snap.player.gnot < MINT_FEE_UGNOT ? "Not enough USDC for the mint fee." : null);
}

/** 1 wallet, 2 mint, 3 swim, 4 sea. The first unmet step is the one Next points at. */
export function playStep(input: { signer: boolean; fish: number; swimming: boolean }): 1 | 2 | 3 | 4 {
  if (!input.signer) return 1;
  if (input.fish < 1) return 2;
  if (!input.swimming) return 3;
  return 4;
}

/** The Shoal collection mint spends 5 USDC from the Arc wallet. The practice purse is not the fee. */
export function onyxMintGate(
  snap: Pick<ShoalSnap, "fish">,
  wallet: { signer: string | null; ugnot: number | null },
) {
  const unplayed = snap.fish.find((fish) => fish.ownerId === PLAYER_ID && !fish.burned && fish.bouts < 1);
  if (unplayed) return gate(`Finish a match with ${unplayed.name} before minting another. Leaving does not count.`);
  if (!wallet.signer) return gate("Connect a wallet on Arc testnet. Mint spends 5 USDC from that wallet.");
  if (wallet.ugnot !== null && wallet.ugnot < ARC_COLLECTION_MICRO) return gate("Not enough USDC in the wallet.");
  return gate(null);
}

export function swimGate(fish: FishNft, snap: SeaSnap & Pick<ShoalSnap, "player">, stake: number) {
  return gate(!fish.alive || fish.burned ? "That fish is unavailable."
    : fish.layCommitAt !== null ? "Settle the lay before swimming."
    : fish.matchId ? "This fish is already in a match."
    : fish.mustHeal ? "Heal before the next swim."
    : fish.hp * 100 < fish.hpMax * MIN_ENTER_HP_PERCENT ? "HP has to be at least 30% to swim."
    : !Number.isFinite(stake) || !stakeFitsSea(stake) ? `Swim in this tab needs ${STAKE_BAND} USDC. There is no maximum.`
    : snap.fish.some((item) => item.ownerId === PLAYER_ID && !item.burned && item.matchId === SEA_ID) ? "One fish per wallet in the sea."
    : !snap.matches.some((match) => match.id === SEA_ID) ? "The sea is not open."
    : snap.player.gnot < stake ? "Not enough USDC in this tab to swim." : null);
}

/** FishDuel seats two fish. A third register reverts, so the button stays quiet. */
export function arcSeaFull(
  fish: readonly { id: string; onyxId?: number; matchId: string | null; burned?: boolean }[],
  selfId: string,
): boolean {
  let others = 0;
  for (const item of fish) {
    if (item.id === selfId || item.burned) continue;
    if (typeof item.onyxId === "number" && item.matchId === SEA_ID) others += 1;
  }
  return others >= 2;
}

/** The sea opens only after 1 USDC is staked into the pool. The practice purse is not that stake. */
export function poolEntryGate(fish: FishNft, snap: SeaSnap) {
  return gate(!fish.alive || fish.burned ? "That fish is unavailable."
    : fish.layCommitAt !== null ? "Settle the lay before entering the sea."
    : fish.matchId ? "This fish is already in a match."
    : fish.mustHeal ? "Heal before the next swim."
    : fish.hp * 100 < fish.hpMax * MIN_ENTER_HP_PERCENT ? "HP has to be at least 30% to swim."
    : snap.fish.some((item) => item.ownerId === PLAYER_ID && !item.burned && item.matchId === SEA_ID) ? "One fish per wallet in the sea."
    : !snap.matches.some((match) => match.id === SEA_ID) ? "The sea is not open."
    : null);
}

/** Arc lock is always 1 USDC. The practice stake box does not set that amount. */
export function onyxStakeGate(_stake: number) {
  void _stake;
  return gate(null);
}

/** HealView is the existing simulation's read-only rollover projection; do not invent a new cooldown. */
export function healGate(fish: FishNft, snap: SeaSnap, heal: HealView) {
  const inMatch = snap.matches.some((match) => match.id === fish.matchId && (match.status === "live" || match.status === "waiting"));
  return gate(!fish.alive || fish.burned ? "That fish is unavailable." : inMatch ? "Heal outside the sea."
    : fish.hp >= fish.hpMax && !fish.mustHeal ? "HP is already full."
    : heal.readyIn > 0 ? `Heal opens in ${formatLeft(heal.readyIn)}.`
    : heal.healsLeft === 0 ? "No free heal left today." : null);
}

export function layGate(fish: FishNft, balance: number) {
  const left = layMatchesLeft(fish.bouts, fish.layBoutsUsed);
  return gate(!fish.alive || fish.burned ? "That fish is unavailable." : fish.layCommitAt !== null ? "The lay is already locked."
    : fish.matchId ? "Leave the sea before laying." : left > 0 ? layShortDetail(fish.name, left)
    : balance < LAY_FEE_UGNOT ? "Not enough USDC for the lay fee." : null);
}

export function upgradeGate(target: FishNft, food: FishNft | null, balance: number) {
  const next = nextRarity(target.rarity);
  return gate(!next ? "Mythic does not step up." : !food ? "Choose a second fish with the same tier, size and trait."
    : !target.alive || !food.alive || target.burned || food.burned ? "Both fish have to be alive."
    : target.id === food.id ? "Pick a second fish."
    : target.ownerId !== PLAYER_ID || food.ownerId !== PLAYER_ID || target.ai || food.ai ? "Both fish must be yours."
    : target.matchId || food.matchId ? "Both fish must be outside the sea."
    : target.rarity !== food.rarity || target.size !== food.size || target.trait !== food.trait ? "Match tier, size and trait."
    : target.bouts < 1 || food.bouts < 1 ? "Both fish must finish a match first."
    : target.layCommitAt !== null || food.layCommitAt !== null ? "Settle both lays before upgrading."
    : balance < (upgradeTo(next)?.fee ?? 0) ? "Not enough FISH for the upgrade fee." : null);
}

export function watchReadiness(watching: boolean, startedAt: number | null, now: number) {
  const left = !watching || startedAt === null ? VIEWER_WATCH_MS : Math.min(VIEWER_WATCH_MS, remaining(startedAt + VIEWER_WATCH_MS, now));
  return { ready: watching && startedAt !== null && left === 0, left };
}

/** Exact claim() boundary: > expiresAt, not >=. The tick can already remove a shard at equality. */
export function claimGate(claim: Claim, claims: Claim[], watching: boolean, startedAt: number | null, now: number) {
  return gate(claim.claimed ? "Already collected or closed."
    : claim.kind === "cheer" ? claim.viewerId !== VIEWER_ID ? "This cheer share belongs to another viewer." : null
    : claim.expiresAt > 0 && now > claim.expiresAt ? "This shard expired."
    : !watching || startedAt === null || startedAt > claim.killAt - VIEWER_WATCH_MS ? "You needed to watch 15 seconds before this kill."
    : claim.killerOwnerId === VIEWER_ID || claim.victimOwnerId === VIEWER_ID ? "The killer and victim cannot collect this shard."
    : claims.some((other) => other.killId === claim.killId && other.claimed && other.viewerId === VIEWER_ID) ? "One shard per wallet on this kill." : null);
}

/** Separate labels, never an aggregate spendable balance. */
export function fundsCopy(snap: Pick<ShoalSnap, "fish" | "cheers">) {
  const stake = snap.fish.filter((fish) => fish.ownerId === PLAYER_ID && !fish.burned).reduce((sum, fish) => sum + fish.poolUgnot, 0);
  const escrow = snap.cheers.filter((cheer) => cheer.viewerId === VIEWER_ID && !cheer.returned);
  return {
    mintFee: `${formatGnot(MINT_FEE_UGNOT)} USDC · spent fee, not stake`,
    stake: `${formatGnot(stake)} USDC · locked stake`,
    escrow: escrow.length ? escrow.map((cheer) => `${cheer.asset === "gnot" ? formatGnot(cheer.amount) : formatFish(cheer.amount)} ${cheer.asset === "gnot" ? "USDC" : "FISH"}`).join(" + ") + " · cheer escrow, not balance" : "No cheer escrow locked",
  };
}
