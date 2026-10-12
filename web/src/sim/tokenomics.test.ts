import { describe, expect, it } from "vitest";
import { UGNOT } from "./catalog";
import {
  stakeFitsSea,
  biteReach,
  biteRadius,
  mouthBite,
  MOUTH_ALIGN,
  finalStats,
  healSkipUgnot,
  sizePreview,
  buybackAtTwap,
  splitFailFee,
  coveredStake,
  partyFishBonusBps,
  partyFishBonusFish,
  splitKill,
  splitMint,
  splitPartyBonus,
  strikeDamage,
  winFishReward,
  cruisePace,
  turnRateRad,
  upgradeTo,
  aspectFor,
  growthGain,
  grownSize,
  killHealGain,
  preyOf,
  MINT_FEE_UGNOT,
} from "./tokenomics";

describe("arena tokenomics vectors", () => {
  it("stops cruise without dropping slow or burst", () => {
    expect(cruisePace(22, false, false, true)).toBe(0);
    expect(cruisePace(22, true, true, true)).toBe(0);
    expect(cruisePace(22, false, false, false)).toBe(22);
    expect(cruisePace(22, true, false, false)).toBeCloseTo(22 * 0.45);
    expect(cruisePace(22, false, true, false)).toBeCloseTo((22 * 7) / 4);
  });

  it("builds a common small swift and a mythic large fang", () => {
    const common = finalStats({ bite: 22, hp: 100, speed: 100, range: 1, trait: "swift", size: "small" });
    expect(common).toEqual({ bite: 19, hp: 88, speed: 130, range: 0.86, dodge: 4.8 });
    const mythic = finalStats({ bite: 52, hp: 180, speed: 85, range: 1.32, trait: "fang", size: "large" });
    expect(mythic.bite).toBe(69);
    expect(mythic.hp).toBe(216);
    expect(mythic.speed).toBe(75);
    expect(mythic.range).toBeCloseTo(1.6104, 10);
    expect(mythic.dodge).toBe(0.4);
    expect(common.speed / mythic.speed).toBeLessThan(1.8);
  });

  it("gives small speed and dodge, and large extra HP with no dodge", () => {
    const base = { bite: 22, hp: 100, speed: 100, range: 1 };
    const small = sizePreview({ ...base, size: "small" });
    const medium = sizePreview({ ...base, size: "medium" });
    const large = sizePreview({ ...base, size: "large" });
    expect(small.speed).toBe(116);
    expect(small.dodge).toBe(2.4);
    expect(medium.dodge).toBe(0);
    expect(large.hp).toBe(120);
    expect(large.dodge).toBe(0);
    expect(large.hp).toBeGreaterThan(medium.hp);
    expect(small.speed).toBeGreaterThan(large.speed);
    const nacre = biteRadius(1.22);
    expect(biteReach(nacre, small.dodge)).toBeLessThan(8);
    expect(biteReach(nacre, large.dodge)).toBeGreaterThan(8);
    expect(mouthBite(4, 4, 0, -1, "large", 4, 12, nacre)).toBe(false);
    expect(mouthBite(4, 4, 0, -1, "large", 12, 4, nacre)).toBe(false);
    expect(mouthBite(4, 4, 0, -1, "large", 4, -4, nacre)).toBe(true);
    expect(mouthBite(0, 0, 0, -1, "large", 0.2, 0.2, nacre)).toBe(true);
    const ahead = 6;
    const wide = (30 * Math.PI) / 180;
    const flank = (80 * Math.PI) / 180;
    expect(mouthBite(0, 0, 0, -1, "large", Math.sin(wide) * ahead, -1.45 - Math.cos(wide) * ahead, nacre)).toBe(true);
    expect(mouthBite(0, 0, 0, -1, "large", Math.sin(flank) * ahead, -1.45 - Math.cos(flank) * ahead, nacre)).toBe(false);
    expect(MOUTH_ALIGN).toBeGreaterThan(0.7);
    expect(MOUTH_ALIGN).toBeLessThan(0.8);
  });

  it("damages from bite and hpMax and does not halve a two-step size gap", () => {
    expect(strikeDamage(69, 88, "medium", "medium")).toBe(36);
    expect(strikeDamage(69, 88, "large", "small")).toBe(36);
    expect(strikeDamage(69, 88, "large", "small", "common", "mythic")).toBe(36);
    expect(strikeDamage(69, 88, "large", "small", "mythic", "common")).toBe(36);
    expect(strikeDamage(52, 100, "medium", "medium")).toBe(26);
    expect(strikeDamage(52, 100, "medium", "medium")).toBeLessThan(100);
    expect(strikeDamage(1, 10_000, "large", "small")).toBe(1);
  });

  it("lets each species hunt one other without changing the hit", () => {
    expect(preyOf("common")).toBe("mythic");
    expect(preyOf("uncommon")).toBe("common");
    expect(preyOf("mythic")).toBe("legendary");
    expect(strikeDamage(69, 88, "large", "small", "common", "common")).toBe(36);
    expect(strikeDamage(69, 88, "medium", "medium", "mythic", "common")).toBe(36);
    expect(strikeDamage(69, 88, "large", "small", "mythic", "common")).toBe(36);
    expect(growthGain("small", "medium")).toBe(2);
    expect(growthGain("small", "small")).toBe(1);
    expect(grownSize("small", 2)).toBe("medium");
    expect(grownSize("medium", 4)).toBe("large");
    expect(grownSize("large", 6)).toBe("large");
    expect(aspectFor("common", "large", 6, false)).toBe("uncommon");
    expect(aspectFor("common", "medium", 6, false)).toBeNull();
    expect(aspectFor("mythic", "large", 6, false)).toBeNull();
    expect(killHealGain(0, 40, 100)).toBe(15);
    expect(killHealGain(3_000, 40, 100)).toBe(0);
    expect(killHealGain(0, 100, 100)).toBe(0);
  });

  it("turns a small swift fish tighter than a large mythic", () => {
    const small = turnRateRad(130, "small", 0);
    const large = turnRateRad(75, "large", 0);
    expect(small).toBeGreaterThan(large);
    expect(small).toBeLessThanOrEqual(4.4);
    expect(large).toBeGreaterThanOrEqual(1.45);
    expect(small / 130).toBeGreaterThan(large / 75);
  });

  it("covers a kill with the smaller stake", () => {
    expect(coveredStake(5 * UGNOT, 18 * UGNOT)).toBe(5 * UGNOT);
    expect(coveredStake(19 * UGNOT, 10 * UGNOT)).toBe(10 * UGNOT);
    expect(coveredStake(10 * UGNOT, 10 * UGNOT)).toBe(10 * UGNOT);
    expect(coveredStake(0, 10 * UGNOT)).toBe(0);
    expect(coveredStake(-1, 10 * UGNOT)).toBe(0);
  });

  it("splits 50 USDC across killer, lp, team, buyback, and cheer", () => {
    const parts = splitKill(50 * UGNOT);
    expect(parts.killer).toBe(40 * UGNOT);
    expect(parts.lp).toBe(5 * UGNOT);
    expect(parts.team).toBe(1.5 * UGNOT);
    expect(parts.buyback).toBe(1.5 * UGNOT);
    expect(parts.cheer).toBe(2 * UGNOT);
    expect(parts.killer + parts.lp + parts.team + parts.buyback + parts.cheer).toBe(50 * UGNOT);
    const bought = buybackAtTwap(parts.buyback, 1_000_000);
    expect(bought).toEqual({ fish: 75, spentUgnot: 1.5 * UGNOT, dustUgnot: 0 });
    expect(winFishReward(50 * UGNOT, 1_000_000)).toBe(50);
    expect(partyFishBonusBps(1)).toBe(0);
    expect(partyFishBonusBps(2)).toBe(142);
    expect(partyFishBonusBps(8)).toBe(1_000);
    expect(partyFishBonusBps(32)).toBe(1_000);
    expect(partyFishBonusFish(10, 8, 1_000)).toBe(1);
    expect(partyFishBonusFish(80, 8, 1_000)).toBe(8);
    expect(partyFishBonusFish(1_000, 2, 1_000)).toBe(14);
    expect(partyFishBonusFish(50, 8, 0)).toBe(0);
    expect(partyFishBonusFish(50, 8, 3)).toBe(3);
    expect(splitPartyBonus(10, 8, 0)).toEqual([3, 1, 1, 1, 1, 1, 1, 1]);
    expect(splitPartyBonus(1, 8, 3)).toEqual([0, 0, 0, 1, 0, 0, 0, 0]);
    const short = buybackAtTwap(parts.buyback, 10);
    expect(short).toEqual({ fish: 10, spentUgnot: 10 * 20_000, dustUgnot: parts.buyback - 10 * 20_000 });
    expect(winFishReward(50 * UGNOT, 0)).toBe(0);
    const dusty = buybackAtTwap(splitKill(5 * UGNOT).buyback, 1_000_000);
    expect(dusty.fish).toBe(7);
    expect(dusty.spentUgnot).toBe(7 * 20_000);
    expect(dusty.dustUgnot).toBe(10_000);
    expect(splitKill(3)).toEqual({ killer: 2, lp: 0, team: 0, buyback: 1, cheer: 0 });
  });

  it("prices a heal skip in burned USDC", () => {
    expect(healSkipUgnot(1, 8 * 3_600_000)).toBe(0.5 * UGNOT);
    expect(healSkipUgnot(3, 4 * 3_600_000)).toBe(0.75 * UGNOT);
  });

  it("prices an upgrade in FISH and splits a failed fee in half", () => {
    expect(upgradeTo("uncommon")?.fee).toBe(150);
    expect(upgradeTo("rare")?.fee).toBe(400);
    expect(upgradeTo("epic")?.fee).toBe(1_000);
    expect(upgradeTo("legendary")?.fee).toBe(2_500);
    expect(upgradeTo("mythic")?.fee).toBe(6_000);
    expect(splitFailFee(upgradeTo("epic")!.fee)).toEqual({ burn: 500, refund: 500 });
    expect(splitMint(MINT_FEE_UGNOT)).toEqual({
      upgradeTreasury: 90 * UGNOT,
      lp: 30 * UGNOT,
      team: 15 * UGNOT,
      burn: 15 * UGNOT,
    });
  });

  it("accepts a sea stake from 10 USDC with no product maximum", () => {
    expect(stakeFitsSea(0)).toBe(false);
    expect(stakeFitsSea(10 * UGNOT)).toBe(true);
    expect(stakeFitsSea(20 * UGNOT)).toBe(true);
    expect(stakeFitsSea(1000 * UGNOT + 1)).toBe(true);
    expect(stakeFitsSea(5000 * UGNOT)).toBe(true);
    expect(stakeFitsSea(9 * UGNOT)).toBe(false);
  });
});
