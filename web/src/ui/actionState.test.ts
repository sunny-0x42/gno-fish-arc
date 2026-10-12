import { describe, expect, it } from "vitest";
import { createPracticeGame, PLAYER_ID, VIEWER_ID, type Claim } from "../sim/game";
import { COMBAT_LOCK_MS, LAY_FEE_UGNOT, MINT_FEE_UGNOT, STAKE_MIN_UGNOT, VIEWER_WATCH_MS, ictDayIndex, upgradeTo } from "../sim/tokenomics";
import { arcSeaFull, claimGate, combatState, fundsCopy, healGate, layGate, liveTarget, mintGate, onyxMintGate, onyxStakeGate, ownedState, playStep, swimGate, upgradeGate, watchReadiness } from "./actionState";

function setup() {
  const game = createPracticeGame(1000);
  game.seedPracticeCast(1000);
  game.mint("medium", "Mine", 1000);
  const fish = game.fish.find((fish) => fish.ownerId === PLAYER_ID)!;
  const snap = { fish: game.fish, matches: game.matches, player: game.purse(PLAYER_ID), cheers: game.cheers };
  return { game, fish, snap };
}
function shard(): Claim {
  return { id: "claim", viewerId: "", gnot: 1, fish: 0, killerId: "killer", kind: "watch", claimed: false, expiresAt: 40000, killAt: 20000, killId: "kill", killerOwnerId: "other", victimOwnerId: "another" };
}

describe("action presentation", () => {
  it("clamps cooldowns and respects no-combat and quiet equality", () => {
    const { fish } = setup();
    fish.nextBiteAt = 5000; fish.nextBurstAt = 6000; fish.burstUntil = 2000; fish.lastCombatAt = -1;
    expect(combatState(fish, 1000)).toEqual({ biteLeft: 4000, burstLeft: 5000, burstActive: 1000, quietLeft: 0 });
    fish.lastCombatAt = 1000;
    expect(combatState(fish, 1000 + COMBAT_LOCK_MS - 1).quietLeft).toBe(1);
    expect(combatState(fish, 1000 + COMBAT_LOCK_MS)).toEqual({ biteLeft: 0, burstLeft: 0, burstActive: 0, quietLeft: 0 });
  });
  it("filters invalid, own and departed bite targets", () => {
    const { fish, snap } = setup();
    expect(liveTarget(snap, null, fish.id)).toBeNull();
    expect(liveTarget(snap, fish.id, fish.id)).toBeNull();
    expect(liveTarget(snap, "missing", fish.id)).toBeNull();
    const target = snap.fish.find((item) => item.ai && item.matchId)!;
    expect(liveTarget(snap, target.id, fish.id)?.id).toBe(target.id);
    target.matchId = null;
    expect(liveTarget(snap, target.id, fish.id)).toBeNull();
  });
  it("explains owned lifecycle and mint prerequisites without mutating", () => {
    const { fish, snap } = setup();
    const before = JSON.stringify(snap);
    expect(ownedState(fish, snap, 1000).status).toBe("Needs a match");
    expect(mintGate(snap).ready).toBe(false);
    expect(onyxMintGate(snap, { signer: "g1n4pl5uc4yt5r96m9w6fmdznx3x0jyg8l6arhmt", ugnot: MINT_FEE_UGNOT }).reason).toMatch(/Finish a match/);
    const open = { fish: snap.fish.filter((fish) => fish.ownerId !== "player"), player: snap.player };
    expect(onyxMintGate(open, { signer: null, ugnot: MINT_FEE_UGNOT }).reason).toMatch(/Connect a wallet/);
    expect(onyxMintGate(open, { signer: "0x8eaae9f664214987204616dd8145bacad48044f6", ugnot: 1_000_000 }).reason).toMatch(/USDC/);
    expect(onyxMintGate(open, { signer: "0x8eaae9f664214987204616dd8145bacad48044f6", ugnot: 5_000_000 }).ready).toBe(true);
    expect(playStep({ signer: false, fish: 0, swimming: false })).toBe(1);
    expect(playStep({ signer: true, fish: 0, swimming: false })).toBe(2);
    expect(playStep({ signer: true, fish: 1, swimming: false })).toBe(3);
    expect(playStep({ signer: true, fish: 1, swimming: true })).toBe(4);
    expect(arcSeaFull([{ id: "a", onyxId: 1, matchId: "sea" }, { id: "b", onyxId: 2, matchId: "sea" }], "c")).toBe(true);
    expect(arcSeaFull([{ id: "a", onyxId: 1, matchId: "sea" }, { id: "b", onyxId: 2, matchId: "sea" }], "b")).toBe(false);
    expect(swimGate(fish, snap, 0).ready).toBe(false);
    expect(swimGate(fish, snap, 5_000_000).ready).toBe(false);
    expect(swimGate(fish, snap, STAKE_MIN_UGNOT).ready).toBe(true);
    expect(swimGate(fish, snap, 1001 * 1_000_000).ready).toBe(true);
    expect(onyxStakeGate(0).ready).toBe(true);
    expect(onyxStakeGate(1001 * 1_000_000).ready).toBe(true);
    expect(swimGate(fish, snap, NaN).ready).toBe(false);
    expect(JSON.stringify(snap)).toBe(before);
    fish.mustHeal = true;
    expect(ownedState(fish, snap, 1000).status).toBe("Needs heal");
    expect(swimGate(fish, snap, STAKE_MIN_UGNOT).ready).toBe(false);
    fish.layCommitAt = 1000;
    expect(ownedState(fish, snap, 1000).status).toBe("Lay locked");
  });
  it("uses actual HealView rollover projection and blocks in-sea heal", () => {
    const { fish, game, snap } = setup();
    fish.hp = 40;
    fish.healDay = ictDayIndex(1000) - 1;
    fish.healsUsed = 2;
    fish.healReadyAt = 99999;
    const before = JSON.stringify(fish);
    const view = game.healView(fish.id, 1000);
    expect(view.healsLeft).toBe(2);
    expect(view.readyIn).toBe(0);
    expect(JSON.stringify(fish)).toBe(before);
    expect(healGate(fish, snap, view).ready).toBe(true);
    fish.matchId = "sea";
    expect(healGate(fish, snap, view).reason).toBe("Heal outside the sea.");
  });
  it("gates lay on completed bouts, fee and pending commitments", () => {
    const { fish } = setup();
    expect(layGate(fish, LAY_FEE_UGNOT).ready).toBe(false);
    fish.bouts = 3;
    expect(layGate(fish, LAY_FEE_UGNOT).ready).toBe(true);
    expect(layGate(fish, LAY_FEE_UGNOT - 1).ready).toBe(false);
    fish.layCommitAt = 1000;
    expect(layGate(fish, LAY_FEE_UGNOT).ready).toBe(false);
  });
  it("requires completed matching fish for upgrade", () => {
    const { fish } = setup();
    const food = { ...fish, id: "second" };
    const fee = upgradeTo("uncommon")!.fee;
    expect(upgradeGate(fish, food, fee).ready).toBe(false);
    fish.bouts = 1; food.bouts = 1;
    expect(upgradeGate(fish, food, fee - 1).reason).toBe("Not enough FISH for the upgrade fee.");
    expect(upgradeGate(fish, food, fee).ready).toBe(true);
    food.matchId = "sea";
    expect(upgradeGate(fish, food, fee).ready).toBe(false);
  });
  it("keeps stake and refundable escrow separate from spent mint fee", () => {
    const { fish, snap } = setup();
    fish.poolUgnot = 5_000_000;
    snap.cheers.push({ id: "cheer", viewerId: VIEWER_ID, fishId: fish.id, matchId: "sea", asset: "gnot", amount: 2_000_000, until: 0, returned: false, valueGnotAtLock: 2_000_000 });
    const copy = fundsCopy(snap);
    expect(copy.stake).toContain("5.00 USDC");
    expect(copy.mintFee).toContain("spent fee, not stake");
    expect(copy.escrow).toContain("2.00 USDC");
    snap.cheers[0].returned = true;
    expect(fundsCopy(snap).escrow).toBe("No cheer escrow locked");
  });
});

describe("watch eligibility", () => {
  it("uses actual watch start, not mount time, at the exact threshold", () => {
    expect(watchReadiness(true, 1000, 1000 + VIEWER_WATCH_MS - 1).ready).toBe(false);
    expect(watchReadiness(true, 1000, 1000 + VIEWER_WATCH_MS).ready).toBe(true);
    expect(watchReadiness(true, 1000, 900)).toEqual({ ready: false, left: VIEWER_WATCH_MS });
    expect(watchReadiness(true, null, 99999).ready).toBe(false);
    expect(watchReadiness(false, 1000, 99999).ready).toBe(false);
  });
  it("requires start 15 seconds before this kill, not current readiness", () => {
    const claim = shard();
    expect(claimGate(claim, [claim], true, claim.killAt - VIEWER_WATCH_MS, 30000).ready).toBe(true);
    expect(claimGate(claim, [claim], true, claim.killAt - VIEWER_WATCH_MS + 1, 30000).ready).toBe(false);
  });
  it("matches action expiry > rather than tick expiry >=", () => {
    const claim = shard();
    expect(claimGate(claim, [claim], true, 0, claim.expiresAt).ready).toBe(true);
    expect(claimGate(claim, [claim], true, 0, claim.expiresAt + 1).reason).toBe("This shard expired.");
  });
  it("handles claimed, ownership, one-per-kill and cheer claims", () => {
    const claim = shard();
    claim.killerOwnerId = VIEWER_ID;
    expect(claimGate(claim, [claim], true, 0, 30000).ready).toBe(false);
    claim.killerOwnerId = "other";
    const collected = { ...claim, id: "collected", claimed: true, viewerId: VIEWER_ID };
    expect(claimGate(claim, [claim, collected], true, 0, 30000).reason).toContain("One shard");
    expect(claimGate(collected, [collected], true, 0, 30000).ready).toBe(false);
    claim.kind = "cheer";
    expect(claimGate(claim, [claim], false, null, 99999).ready).toBe(false);
    claim.viewerId = VIEWER_ID;
    expect(claimGate(claim, [claim], false, null, 99999).ready).toBe(true);
  });
});
