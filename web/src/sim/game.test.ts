import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  GENESIS_FISH,
  GENESIS_GNOT,
  HEALS_PER_DAY,
  RIVAL_PLAN,
  rivalClanId,
  SPECIES,
  UGNOT,
  VIEWER_START_FISH,
} from "./catalog";
import { idleCruiseRadius, ROCKS, SHELTERS, SHELTER_HP, SHELTER_REBUILD_MS, springSlot } from "./cover";
import { formatGnot } from "./format";
import { PLAYER_ID, SEA_ID, ShoalGame, VIEWER_ID, type KillReport } from "./game";
import { BURST_COOLDOWN_MS, BURST_MS, moveDelayMs, SEA_RADIUS, sectorOf, sharePool } from "./rules";
import type { CrestId } from "./social";
import {
  buybackAtTwap,
  cheerValueUgnot,
  COMBAT_LOCK_MS,
  healSkipUgnot,
  LAY_FEE_UGNOT,
  LAY_SETTLE_MS,
  MINT_FEE_UGNOT,
  sizeIndex,
  STAKE_MIN_UGNOT,
  partyFishBonusBps,
  partyFishBonusFish,
  splitKill,
  splitMint,
  splitPartyBonus,
  upgradeTo,
  winFishReward,
  worldUnitsPerSecond,
  type Size,
  type Trait,
} from "./tokenomics";

function expectBooks(game: ShoalGame) {
  const supply = game.supply();
  expect(supply.gnot).toBe(GENESIS_GNOT);
  expect(supply.fish).toBe(GENESIS_FISH);
}

function setPurse(game: ShoalGame, gnot: number) {
  const purse = game.purse(PLAYER_ID);
  const delta = purse.gnot - gnot;
  if (game.books.reserveGnot + delta < 0) throw new Error("reserve cannot fund the purse");
  purse.gnot = gnot;
  game.books.reserveGnot += delta;
}

function setFish(game: ShoalGame, fish: number) {
  const purse = game.purse(PLAYER_ID);
  const delta = purse.fish - fish;
  if (game.books.reserveFish + delta < 0) throw new Error("reserve cannot fund the purse");
  purse.fish = fish;
  game.books.reserveFish += delta;
}

function castGame(now = 0): ShoalGame {
  const game = new ShoalGame(now);
  game.seedPracticeCast(now);
  return game;
}

function mintFish(game: ShoalGame, size: Size, name: string, trait: Trait, now = 0) {
  const minted = game.mint(size, name, now, trait);
  expect(minted.ok).toBe(true);
  if (!minted.ok) throw new Error("mint");
  const fish = game.fishById(minted.detail);
  if (!fish) throw new Error("missing mint");
  return fish;
}

function finishBout(game: ShoalGame, fish: { id: string; matchId: string | null; nextBiteAt: number }, now = 0) {
  const start = Math.max(now, fish.nextBiteAt);
  if (!fish.matchId) expect(game.register(fish.id, STAKE_MIN_UGNOT, start).ok).toBe(true);
  const body = game.fishById(fish.id);
  if (!body) throw new Error("prey");
  const seated = (item: typeof body) => item.ai && item.alive && !item.mustHeal && item.matchId === body.matchId;
  const prey = game.fish.find((item) => seated(item) && sizeIndex(item.size) <= sizeIndex(body.size))
    ?? game.fish.find((item) => seated(item));
  if (!prey) throw new Error("prey");
  const killed = down(game, fish.id, prey.id, start);
  expect(body.bouts).toBeGreaterThan(0);
  expect(game.leaveMatch(fish.id, killed.deathAt + COMBAT_LOCK_MS).ok).toBe(true);
  expect(body.matchId).toBeNull();
}

function down(game: ShoalGame, attackerId: string, victimId: string, start: number) {
  const victim = game.fishById(victimId);
  const attacker = game.fishById(attackerId);
  if (!victim || !attacker) throw new Error("missing fish");
  game.relocate(attackerId, victim.sx, victim.sz);
  let now = start;
  let deathAt = start;
  let report: KillReport | undefined;
  for (let i = 0; i < 80 && !victim.mustHeal; i++) {
    const bite = game.tryBite(attackerId, victimId, now);
    expect(bite.ok).toBe(true);
    if (bite.report) {
      report = bite.report;
      deathAt = now;
    }
    now += 5_000;
  }
  expect(victim.mustHeal).toBe(true);
  if (!report) throw new Error("missing kill");
  return { now, deathAt, report };
}

describe("practice books", () => {
  it("starts with an empty sea until a player enters", () => {
    const empty = new ShoalGame(0);
    expectBooks(empty);
    expect(empty.fish).toHaveLength(0);
    expect(empty.chats).toHaveLength(0);
    expect(empty.friends).toHaveLength(0);
    expect(empty.purse(PLAYER_ID).gnot).toBe(2_000 * UGNOT);
    expect(empty.books.reserveFish).toBe(GENESIS_FISH - VIEWER_START_FISH);
    const mirrored = empty.syncChainRoster("g1n4pl5uc4yt5r96m9w6fmdznx3x0jyg8l6arhmt", [{
      onyxId: 1,
      owner: "g1n4pl5uc4yt5r96m9w6fmdznx3x0jyg8l6arhmt",
      name: "Minnow",
      rarity: "common",
      size: "medium",
      trait: "fang",
      poolUgnot: 5 * UGNOT,
      inMatch: true,
      bouts: 0,
      image: "",
    }], 0);
    expect(mirrored.added).toBe(1);
    expect(empty.fish[0].ai).toBe(false);
    expect(empty.fish[0].ownerId).toBe(PLAYER_ID);
    expect(empty.fish[0].matchId).toBe(SEA_ID);
    expect(empty.fish[0].onyxSwim).toBe(true);
    expect(empty.syncChainRoster("g1n4pl5uc4yt5r96m9w6fmdznx3x0jyg8l6arhmt", [{
      onyxId: 1,
      owner: "g1n4pl5uc4yt5r96m9w6fmdznx3x0jyg8l6arhmt",
      name: "Minnow",
      rarity: "common",
      size: "medium",
      trait: "fang",
      poolUgnot: 5 * UGNOT,
      inMatch: true,
      bouts: 0,
      image: "https://gateway.pinata.cloud/ipfs/bafybeid6uahelm3h2oo7rs4z6cgdyrpkueuvcychwuz5fw5tf7mj6hggli",
    }], 0).added).toBe(0);
    expect(empty.fish[0].image).toBe("https://gateway.pinata.cloud/ipfs/bafybeid6uahelm3h2oo7rs4z6cgdyrpkueuvcychwuz5fw5tf7mj6hggli");
    expect(empty.fish).toHaveLength(1);
    expectBooks(empty);

    const fresh = new ShoalGame(0);
    const minted = fresh.mint("medium", "Minnow", 0, "fang");
    expect(minted.ok).toBe(true);
    fresh.syncChainRoster("g1n4pl5uc4yt5r96m9w6fmdznx3x0jyg8l6arhmt", [{
      onyxId: 2,
      owner: "g1n4pl5uc4yt5r96m9w6fmdznx3x0jyg8l6arhmt",
      name: "Minnow",
      rarity: "common",
      size: "medium",
      trait: "fang",
      poolUgnot: 0,
      inMatch: false,
      bouts: 0,
      image: "",
    }], 0);
    expect(fresh.fish).toHaveLength(1);
    expect(fresh.fish[0].onyxId).toBe(2);
    expect(fresh.fish[0].matchId).toBeNull();
    expectBooks(fresh);

    const game = castGame(0);
    expectBooks(game);
    const rivals = game.living().filter((fish) => fish.ai);
    expect(rivals).toHaveLength(RIVAL_PLAN.length);
    expect(rivals.filter((fish) => fish.clanId === "reef")).toHaveLength(RIVAL_PLAN.filter((_, index) => rivalClanId(index) === "reef").length);
    expect(rivals.filter((fish) => fish.clanId === "abyss")).toHaveLength(RIVAL_PLAN.filter((_, index) => rivalClanId(index) === "abyss").length);
    const stakes = RIVAL_PLAN.reduce((sum, plan) => sum + plan.stakeGnot, 0);
    expect(rivals.reduce((sum, fish) => sum + fish.poolUgnot, 0)).toBe(stakes * UGNOT);
    for (const rival of rivals) {
      expect(rival.bodyUgnot).toBe(0);
      expect(Math.hypot(rival.x - 4, rival.z - 12)).toBeLessThan(36);
    }

    const entered = new ShoalGame(0);
    const swimmer = mintFish(entered, "small", "Pip", "swift");
    const reserveBefore = entered.books.reserveGnot;
    expect(entered.register(swimmer.id, STAKE_MIN_UGNOT, 5).ok).toBe(true);
    expect(entered.living().some((fish) => fish.ai)).toBe(false);
    expect(entered.books.reserveGnot).toBe(reserveBefore);
    expect(entered.leaveMatch(swimmer.id, 5).ok).toBe(true);
    expect(entered.enterOnPoolStake(swimmer.id, 5).ok).toBe(true);
    expect(entered.startMatch(swimmer.id, 5).ok).toBe(true);
    expect(entered.living().some((fish) => fish.ai)).toBe(false);
    expectBooks(entered);
  });

  it("splits a Common mint and does not lock the fee on the NFT", () => {
    const game = castGame(0);
    const before = game.purse(PLAYER_ID).gnot;
    const fish = mintFish(game, "small", "Pip", "swift");
    const split = splitMint(MINT_FEE_UGNOT);
    expect(fish.bodyUgnot).toBe(0);
    expect(fish.poolUgnot).toBe(0);
    expect(fish.bite).toBe(19);
    expect(fish.hpMax).toBe(88);
    expect(fish.speed).toBe(130);
    expect(fish.range).toBeCloseTo(0.86);
    expect(game.purse(PLAYER_ID).gnot).toBe(before - MINT_FEE_UGNOT);
    expect(game.books.upgradeTreasuryGnot).toBe(split.upgradeTreasury);
    expect(game.books.liquidityGnot).toBe(split.lp);
    expect(game.books.burnGnot).toBe(split.burn);
    expect(game.books.devGnot).toBe(split.team);
    expect(split.upgradeTreasury).toBe(90_000_000);
    expect(split.lp).toBe(30_000_000);
    expect(split.team).toBe(15_000_000);
    expect(split.burn).toBe(15_000_000);
    expectBooks(game);
  });

  it("refuses another mint until a fish finishes a match", () => {
    const game = castGame(0);
    const before = game.purse(PLAYER_ID).gnot;
    const pip = mintFish(game, "small", "Pip", "swift");
    expect(game.mint("large", "Nib", 0, "hide")).toMatchObject({
      ok: false,
      detail: "Finish a match with Pip before minting another.",
    });
    expect(game.owned(PLAYER_ID)).toHaveLength(1);
    expect(game.purse(PLAYER_ID).gnot).toBe(before - MINT_FEE_UGNOT);
    expect(game.register(pip.id, STAKE_MIN_UGNOT, 0).ok).toBe(true);
    expect(game.startMatch(pip.id, 0).ok).toBe(true);
    expect(game.leaveMatch(pip.id, 0).ok).toBe(true);
    expect(pip.bouts).toBe(0);
    expect(game.mint("large", "Nib", 0, "hide").ok).toBe(false);
    finishBout(game, pip, 0);
    expect(game.mint("small", "Nib", 0, "swift").ok).toBe(true);
    expect(game.owned(PLAYER_ID).map((fish) => fish.name).sort()).toEqual(["Nib", "Pip"]);
    expect(game.purse(PLAYER_ID).gnot).toBe(before - 2 * MINT_FEE_UGNOT + splitKill(STAKE_MIN_UGNOT).killer);
    const nib = game.owned(PLAYER_ID).find((fish) => fish.name === "Nib")!;
    expect(game.upgrade(pip.id, nib.id, 0, 0)).toMatchObject({
      ok: false,
      detail: "Both fish have to finish a match before an upgrade.",
    });
    expect(nib.alive).toBe(true);
    finishBout(game, nib, 0);
    setFish(game, upgradeTo("uncommon")!.fee);
    expect(game.upgrade(pip.id, nib.id, 0, 0).ok).toBe(true);
    expectBooks(game);
  });

  it("rejects a mint the purse cannot pay", () => {
    const game = castGame(0);
    setPurse(game, MINT_FEE_UGNOT - 1);
    expect(game.mint("medium", "Pip", 0, "fang").ok).toBe(false);
    expect(game.owned(PLAYER_ID)).toHaveLength(0);
    expectBooks(game);
  });

  it("burns both fish and mints the next tier on a successful upgrade", () => {
    const game = castGame(0);
    const target = mintFish(game, "medium", "Pip", "fang");
    finishBout(game, target);
    const food = mintFish(game, "medium", "Nib", "fang");
    finishBout(game, food);
    const fee = upgradeTo("uncommon")!.fee;
    setFish(game, fee);
    const purse = game.purse(PLAYER_ID).gnot;
    const held = game.purse(PLAYER_ID).fish;
    const burned = game.books.burnFish;
    const treasury = game.books.upgradeTreasuryGnot;
    const team = game.books.devGnot;
    const result = game.upgrade(target.id, food.id, 0, 0);
    expect(result).toEqual({ ok: true, detail: expect.any(String) });
    expect(game.fishById(target.id)?.burned).toBe(true);
    const next = game.owned(PLAYER_ID);
    expect(next).toHaveLength(1);
    expect(next[0].rarity).toBe("uncommon");
    expect(next[0].name).toBe("Pip");
    expect(next[0].size).toBe("medium");
    expect(next[0].trait).toBe("fang");
    expect(next[0].bodyUgnot).toBe(0);
    expect(game.purse(PLAYER_ID).gnot).toBe(purse);
    expect(game.purse(PLAYER_ID).fish).toBe(held - fee);
    expect(game.books.burnFish).toBe(burned + fee);
    expect(game.books.upgradeTreasuryGnot).toBe(treasury);
    expect(game.books.devGnot).toBe(team);
    expectBooks(game);
  });

  it("burns both fish and returns half the fee when the roll fails", () => {
    const game = castGame(0);
    const first = mintFish(game, "large", "One", "hide");
    finishBout(game, first);
    const second = mintFish(game, "large", "Two", "hide");
    finishBout(game, second);
    setFish(game, upgradeTo("uncommon")!.fee);
    expect(game.upgrade(first.id, second.id, 0, 0).ok).toBe(true);
    const raised = game.owned(PLAYER_ID)[0];
    finishBout(game, raised);
    const third = mintFish(game, "large", "Three", "hide");
    finishBout(game, third);
    const fourth = mintFish(game, "large", "Four", "hide");
    finishBout(game, fourth);
    setFish(game, upgradeTo("uncommon")!.fee);
    expect(game.upgrade(third.id, fourth.id, 0, 0).ok).toBe(true);
    const fresh = game.owned(PLAYER_ID).find((fish) => fish.bouts < 1);
    if (!fresh) throw new Error("fresh upgrade");
    finishBout(game, fresh);
    const [left, right] = game.owned(PLAYER_ID);
    const fee = upgradeTo("rare")!.fee;
    setFish(game, fee);
    const purse = game.purse(PLAYER_ID).gnot;
    const burned = game.books.burnFish;
    const result = game.upgrade(left.id, right.id, 0, 9_000);
    expect(result).toEqual({ ok: true, detail: "failed" });
    expect(game.owned(PLAYER_ID)).toHaveLength(0);
    expect(game.purse(PLAYER_ID).gnot).toBe(purse);
    expect(game.purse(PLAYER_ID).fish).toBe(fee / 2);
    expect(game.books.burnFish).toBe(burned + fee / 2);
    expectBooks(game);
  });

  it("refuses a mismatched pair, a short purse, and a mythic step", () => {
    const game = castGame(0);
    const pip = mintFish(game, "medium", "Pip", "fang");
    finishBout(game, pip);
    const other = mintFish(game, "small", "Nib", "swift");
    finishBout(game, other);
    expect(game.upgrade(pip.id, other.id, 0, 0).ok).toBe(false);
    expect(pip.alive).toBe(true);
    const twin = mintFish(game, "medium", "Twin", "fang");
    finishBout(game, twin);
    setFish(game, upgradeTo("uncommon")!.fee - 1);
    expect(game.upgrade(pip.id, twin.id, 0, 0)).toMatchObject({
      ok: false,
      detail: "Not enough FISH for the upgrade fee.",
    });
    expect(twin.alive).toBe(true);
    pip.rarity = "mythic";
    twin.rarity = "mythic";
    expect(game.upgrade(pip.id, twin.id, 0, 0).ok).toBe(false);
    expect(pip.burned).toBe(false);
    expectBooks(game);
  });

  it("heals 40% outside a match and burns the skip fee", () => {
    const game = castGame(0);
    const fish = mintFish(game, "medium", "Pip", "hide");
    fish.hp = 40;
    expect(game.heal(fish.id, 0).ok).toBe(true);
    expect(fish.hp).toBe(40 + Math.floor(fish.hpMax * 40 / 100));
    expect(game.healView(fish.id, 0).healsLeft).toBe(1);
    fish.hp = 40;
    expect(game.heal(fish.id, 0).ok).toBe(true);
    expect(fish.healsUsed).toBe(HEALS_PER_DAY);
    const purse = game.purse(PLAYER_ID).gnot;
    const burn = game.books.burnGnot;
    const cost = healSkipUgnot(SPECIES.common.tierId, fish.healReadyAt);
    expect(cost).toBe(500_000);
    expect(game.rushHeal(fish.id, 0).ok).toBe(true);
    expect(game.purse(PLAYER_ID).gnot).toBe(purse - cost);
    expect(game.books.burnGnot).toBe(burn + cost);
    expect(fish.healReadyAt).toBe(0);
    fish.hp = 40;
    expect(game.heal(fish.id, 0).ok).toBe(true);
    game.tick(DAY_MS);
    fish.hp = 40;
    expect(game.heal(fish.id, DAY_MS).ok).toBe(true);
    expectBooks(game);
  });

  it("refuses a heal on a rival, a full fish, a live match, and a poor skip", () => {
    const game = castGame(0);
    const fish = mintFish(game, "medium", "Pip", "swift");
    const rival = game.living().find((item) => item.ai)!;
    expect(game.heal(rival.id, 0).ok).toBe(false);
    expect(game.heal(fish.id, 0).ok).toBe(false);
    expect(game.register(fish.id, STAKE_MIN_UGNOT, 0).ok).toBe(true);
    fish.hp = 40;
    expect(game.heal(fish.id, 0).ok).toBe(false);
    expect(game.leaveMatch(fish.id, 0).ok).toBe(true);
    expect(game.heal(fish.id, 0).ok).toBe(true);
    expect(game.heal(fish.id, 0).ok).toBe(true);
    setPurse(game, 0);
    expect(game.rushHeal(fish.id, 1).ok).toBe(false);
    expect(fish.healReadyAt).toBeGreaterThan(1);
    expectBooks(game);
  });
});

describe("sea", () => {
  it("opens the sea from a 1 USDC pool stake without paying the practice purse", () => {
    const game = castGame(0);
    const fish = mintFish(game, "medium", "Pip", "fang");
    const purse = game.purse(PLAYER_ID).gnot;
    expect(game.enterOnPoolStake(fish.id, 0)).toMatchObject({ ok: true });
    expect(fish.poolUgnot).toBe(UGNOT);
    expect(fish.matchId).toBe(SEA_ID);
    expect(game.activeFishId).toBe(fish.id);
    expect(game.purse(PLAYER_ID).gnot).toBe(purse);
    expect(game.enterOnPoolStake(fish.id, 1).ok).toBe(false);
    const again = castGame(0);
    const typed = mintFish(again, "medium", "Kelp", "fang");
    const typedPurse = again.purse(PLAYER_ID).gnot;
    expect(again.enterOnPoolStake(typed.id, 0, 5 * UGNOT)).toMatchObject({ ok: true });
    expect(typed.poolUgnot).toBe(5 * UGNOT);
    expect(again.purse(PLAYER_ID).gnot).toBe(typedPurse);
    expect(again.enterOnPoolStake(typed.id, 1, 2 * UGNOT).ok).toBe(false);
    expect(game.leaveMatch(fish.id, 0).ok).toBe(true);
    expect(fish.poolUgnot).toBe(0);
    expect(game.purse(PLAYER_ID).gnot).toBe(purse);
    expectBooks(game);
  });

  it("refuses a stake of 0 or under 10, and has no maximum", () => {
    const game = castGame(0);
    const fish = mintFish(game, "medium", "Pip", "fang");
    const brine = game.fish.find((item) => item.name === "Brine")!;
    expect(brine.matchId).toBe(SEA_ID);
    const purse = game.purse(PLAYER_ID).gnot;
    expect(game.register(fish.id, 0, 0).ok).toBe(false);
    expect(fish.poolUgnot).toBe(0);
    expect(fish.matchId).toBeFalsy();
    expect(game.purse(PLAYER_ID).gnot).toBe(purse);
    expect(game.register(fish.id, 9 * UGNOT, 0).ok).toBe(false);
    expect(game.register(fish.id, 1001 * UGNOT, 0).ok).toBe(true);
    expect(fish.matchId).toBe(SEA_ID);
    expect(brine.matchId).toBe(fish.matchId);
    expect(game.leaveMatch(fish.id, 0).ok).toBe(true);
    expect(game.register(fish.id, 1000 * UGNOT, 0).ok).toBe(true);
    expect(fish.matchId).toBe(SEA_ID);
    expect(game.leaveMatch(fish.id, 0).ok).toBe(true);
    fish.hp = Math.floor((fish.hpMax * 30) / 100) - 1;
    expect(game.register(fish.id, STAKE_MIN_UGNOT, 0).ok).toBe(false);
    fish.hp = fish.hpMax;
    fish.mustHeal = true;
    expect(game.register(fish.id, STAKE_MIN_UGNOT, 0).ok).toBe(false);
    expectBooks(game);
  });

  it("returns a stake on leave and keeps every other fish in the sea", () => {
    const game = castGame(0);
    const fish = mintFish(game, "medium", "Pip", "fang");
    const pebble = game.fish.find((item) => item.name === "Pebble")!;
    const purse = game.purse(PLAYER_ID).gnot;
    expect(game.register(fish.id, STAKE_MIN_UGNOT, 0).ok).toBe(true);
    expect(pebble.matchId).toBe(SEA_ID);
    expect(game.cheer(pebble.id, "gnot", UGNOT, 0).ok).toBe(true);
    expect(game.leaveMatch(fish.id, 0).ok).toBe(true);
    expect(fish.poolUgnot).toBe(0);
    expect(fish.matchId).toBeNull();
    expect(pebble.matchId).toBe(SEA_ID);
    expect(pebble.poolUgnot).toBe(16 * UGNOT);
    expect(game.purse(PLAYER_ID).gnot).toBe(purse);
    expect(game.purse(VIEWER_ID).gnot).toBe(500 * UGNOT - UGNOT);
    expect(game.cheers.some((cheer) => cheer.fishId === pebble.id && !cheer.returned)).toBe(true);
    expectBooks(game);
  });

  it("keeps the stake locked when a long time passes", () => {
    const game = castGame(0);
    const fish = mintFish(game, "medium", "Pip", "fang");
    const purse = game.purse(PLAYER_ID).gnot;
    expect(game.register(fish.id, STAKE_MIN_UGNOT, 0).ok).toBe(true);
    expect(game.startMatch(fish.id, 0).ok).toBe(true);
    const sea = game.matches.find((match) => match.id === SEA_ID);
    if (!sea) throw new Error("sea");
    game.tick(10_000_000);
    expect(sea.status).toBe("live");
    expect(fish.poolUgnot).toBe(STAKE_MIN_UGNOT);
    expect(fish.mustHeal).toBe(false);
    expect(fish.matchId).toBe(SEA_ID);
    expect(game.purse(PLAYER_ID).gnot).toBe(purse - STAKE_MIN_UGNOT);
    expectBooks(game);
  });

  it("blocks a leave for 5 quiet seconds after a bite", () => {
    const game = castGame(0);
    const fish = mintFish(game, "medium", "Pip", "fang");
    const pebble = game.fish.find((item) => item.name === "Pebble")!;
    expect(game.register(fish.id, STAKE_MIN_UGNOT, 0).ok).toBe(true);
    expect(game.leaveMatch(fish.id, 0).ok).toBe(true);
    expect(game.register(fish.id, STAKE_MIN_UGNOT, 0).ok).toBe(true);
    game.relocate(fish.id, pebble.sx, pebble.sz);
    expect(game.tryBite(fish.id, pebble.id, 0).ok).toBe(true);
    expect(game.leaveMatch(fish.id, 1_000).ok).toBe(false);
    expect(fish.poolUgnot).toBe(STAKE_MIN_UGNOT);
    expect(game.leaveMatch(fish.id, COMBAT_LOCK_MS).ok).toBe(true);
    expect(fish.poolUgnot).toBe(0);
    expectBooks(game);
  });

  it("leaves the browser sea during the quiet lock after the chain returned the stake", () => {
    const game = new ShoalGame(0);
    expect(game.mint("medium", "Pip", 0, "fang").ok).toBe(true);
    const fish = game.owned(PLAYER_ID)[0];
    expect(game.enterOnPoolStake(fish.id, 0, UGNOT).ok).toBe(true);
    fish.lastCombatAt = 0;
    expect(game.leaveMatch(fish.id, 1_000).ok).toBe(false);
    expect(fish.matchId).toBe(SEA_ID);
    expect(game.leaveMatch(fish.id, 1_000, true).ok).toBe(true);
    expect(fish.matchId).toBeNull();
    expect(fish.poolUgnot).toBe(0);
    expect(game.activeFishId).toBeNull();
    expect(game.leaveMatch(fish.id, 1_000, true).ok).toBe(true);
    expectBooks(game);
  });

  it("holds one fish per wallet in the sea", () => {
    const game = castGame(0);
    const first = mintFish(game, "medium", "A", "swift");
    finishBout(game, first);
    const second = mintFish(game, "medium", "B", "swift");
    expect(game.register(first.id, STAKE_MIN_UGNOT, 0).ok).toBe(true);
    expect(game.register(second.id, STAKE_MIN_UGNOT, 0).ok).toBe(false);
    expect(game.leaveMatch(first.id, 0).ok).toBe(true);
    expect(game.register(second.id, STAKE_MIN_UGNOT, 0).ok).toBe(true);
    expect(second.matchId).toBe(SEA_ID);
    expectBooks(game);
  });
});

describe("kills", () => {
  it("splits a 50 USDC pool and pays FISH from the reserve", () => {
    const game = castGame(0);
    const pip = mintFish(game, "medium", "Pip", "fang");
    const pebble = game.fish.find((item) => item.name === "Pebble")!;
    const topUp = 50 * UGNOT - pebble.poolUgnot;
    pebble.poolUgnot += topUp;
    game.books.reserveGnot -= topUp;
    const fishBefore = game.books.reserveFish;
    const held = game.purse(PLAYER_ID).fish;
    expect(game.register(pip.id, 50 * UGNOT, 0).ok).toBe(true);
    expect(game.startMatch(pip.id, 0).ok).toBe(true);
    const purse = game.purse(PLAYER_ID).gnot;
    const season = game.books.seasonTreasuryGnot;
    const team = game.books.devGnot;
    const liquidity = game.books.liquidityGnot;
    const burn = game.books.burnGnot;
    const burnedFish = game.books.burnFish;
    const { report } = down(game, pip.id, pebble.id, 0);
    const parts = splitKill(50 * UGNOT);
    const bought = buybackAtTwap(parts.buyback, fishBefore);
    const reward = winFishReward(50 * UGNOT, fishBefore - bought.fish);
    expect(parts).toEqual({
      killer: 40 * UGNOT,
      lp: 5 * UGNOT,
      team: 1_500_000,
      buyback: 1_500_000,
      cheer: 2 * UGNOT,
    });
    expect(bought).toEqual({ fish: 75, spentUgnot: 1_500_000, dustUgnot: 0 });
    expect(reward).toBe(50);
    expect(report.gnot).toEqual(parts);
    expect(report.fishReward).toBe(50);
    expect(report.buybackFish).toBe(75);
    expect(game.purse(PLAYER_ID).gnot).toBe(purse + parts.killer);
    expect(game.purse(PLAYER_ID).fish).toBe(held + reward);
    expect(game.books.liquidityGnot).toBe(liquidity + parts.lp + bought.spentUgnot);
    expect(game.books.burnGnot).toBe(burn + bought.dustUgnot);
    expect(game.books.devGnot).toBe(team + parts.team + parts.cheer);
    expect(game.books.seasonTreasuryGnot).toBe(season);
    expect(game.books.burnFish).toBe(burnedFish + bought.fish);
    expect(game.claims.filter((claim) => claim.kind === "watch")).toHaveLength(0);
    expect(pebble.alive).toBe(true);
    expect(pebble.burned).toBe(false);
    expect(pebble.mustHeal).toBe(true);
    expect(pebble.poolUgnot).toBe(0);
    expect(pip.poolUgnot).toBe(50 * UGNOT);
    expect(pebble.hp).toBe(Math.max(1, Math.floor(pebble.hpMax * 30 / 100)));
    expect(game.books.reserveFish).toBe(fishBefore - bought.fish - reward);
    expect(game.scores.get(pip.id)).toEqual({ kills: 1, downs: 0 });
    expect(game.scores.get(pebble.id)).toEqual({ kills: 0, downs: 1 });
    const feed = game.killFeed();
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({
      attacker: "skipper",
      attackerCountry: "VN",
      victim: "pebble",
      victimCountry: "VN",
      gnot: parts.killer,
      fish: reward,
    });
    expect(feed[0].id).toMatch(/^k[a-z0-9]{4,20}$/);
    expect(game.killFeed(Date.now() + 3 * 60 * 1000)).toEqual([]);
    expect(game.takeRoomKills()).toEqual([]);
    expectBooks(game);
  });

  it("pays a larger party up to 10% more FISH and splits that bonus", () => {
    const game = castGame(0);
    const pip = mintFish(game, "medium", "Pip", "fang");
    expect(game.foundParty("Tide", pip.id, 0, "sun", "Vietnam").ok).toBe(true);
    const silt = game.fish.find((item) => item.name === "Silt");
    const pebble = game.fish.find((item) => item.name === "Pebble");
    if (!silt || !pebble) throw new Error("missing rival");
    expect(game.inviteToParty("silt", pip.id, 0).ok).toBe(true);
    expect(silt.partyId).toBe(pip.partyId);
    expect(pebble.partyId).toBeNull();
    const topUp = 200 * UGNOT - pebble.poolUgnot;
    pebble.poolUgnot += topUp;
    game.books.reserveGnot -= topUp;
    const stake = 1_000 * UGNOT;
    const victimPool = pebble.poolUgnot;
    expect(game.register(pip.id, stake, 0).ok).toBe(true);
    const fishBefore = game.books.reserveFish;
    const held = game.purse(PLAYER_ID).fish;
    const mateHeld = game.purse(silt.ownerId).fish;
    const { report } = down(game, pip.id, pebble.id, 0);
    const covered = Math.min(stake, victimPool);
    const bought = buybackAtTwap(splitKill(covered).buyback, fishBefore);
    const base = winFishReward(covered, fishBefore - bought.fish);
    const bonus = partyFishBonusFish(base, 2, fishBefore - bought.fish - base);
    expect(partyFishBonusBps(2)).toBe(142);
    expect(covered).toBe(200 * UGNOT);
    expect(base).toBe(200);
    expect(bonus).toBe(2);
    expect(base).not.toBe(stake / UGNOT);
    expect(splitPartyBonus(bonus, 2, 1)).toEqual([1, 1]);
    expect(report.fishReward).toBe(base + 1);
    expect(game.purse(PLAYER_ID).fish).toBe(held + report.fishReward);
    expect(game.purse(silt.ownerId).fish).toBe(mateHeld + 1);
    expect(game.books.reserveFish).toBe(fishBefore - bought.fish - base - bonus);
    expectBooks(game);
  });

  it("buys only the FISH the reserve still holds", () => {
    const game = castGame(0);
    const pip = mintFish(game, "medium", "Pip", "fang");
    const pebble = game.fish.find((item) => item.name === "Pebble")!;
    const topUp = 50 * UGNOT - pebble.poolUgnot;
    pebble.poolUgnot += topUp;
    game.books.reserveGnot -= topUp;
    const parked = game.books.reserveFish - 10;
    game.books.reserveFish = 10;
    game.books.burnFish += parked;
    expect(game.register(pip.id, 50 * UGNOT, 0).ok).toBe(true);
    expect(game.startMatch(pip.id, 0).ok).toBe(true);
    const held = game.purse(PLAYER_ID).fish;
    const burn = game.books.burnGnot;
    const { report } = down(game, pip.id, pebble.id, 0);
    expect(report.buybackFish).toBe(10);
    expect(report.fishReward).toBe(0);
    expect(game.purse(PLAYER_ID).fish).toBe(held);
    expect(game.books.reserveFish).toBe(0);
    expect(game.books.burnGnot).toBe(burn + splitKill(50 * UGNOT).buyback - 10 * 20_000);
    expectBooks(game);
  });

  it("splits the smaller stake and returns the rest of the victim pool", () => {
    const game = castGame(0);
    const pip = mintFish(game, "medium", "Pip", "fang");
    const nacre = game.fish.find((item) => item.name === "Nacre")!;
    const silt = game.fish.find((item) => item.name === "Silt")!;
    expect(nacre.poolUgnot).toBe(36 * UGNOT);
    expect(silt.poolUgnot).toBe(24 * UGNOT);
    expect(game.register(pip.id, STAKE_MIN_UGNOT, 0).ok).toBe(true);
    expect(game.startMatch(pip.id, 0).ok).toBe(true);
    const purse = game.purse(PLAYER_ID).gnot;
    const nacrePurse = game.purse(nacre.ownerId).gnot;
    const parts = splitKill(STAKE_MIN_UGNOT);
    const first = down(game, pip.id, nacre.id, 0);
    expect(first.report.gnot).toEqual(parts);
    expect(game.purse(PLAYER_ID).gnot).toBe(purse + parts.killer);
    expect(game.purse(nacre.ownerId).gnot).toBe(nacrePurse + 26 * UGNOT);
    expect(pip.poolUgnot).toBe(STAKE_MIN_UGNOT);
    expect(nacre.poolUgnot).toBe(0);
    const beforeSecond = game.purse(PLAYER_ID).gnot;
    const siltPurse = game.purse(silt.ownerId).gnot;
    down(game, pip.id, silt.id, first.now);
    expect(game.purse(PLAYER_ID).gnot).toBe(beforeSecond + parts.killer);
    expect(game.purse(silt.ownerId).gnot).toBe(siltPurse + 14 * UGNOT);
    expect(pip.poolUgnot).toBe(STAKE_MIN_UGNOT);
    expect(silt.poolUgnot).toBe(0);
    expect(game.scores.get(pip.id)).toEqual({ kills: 2, downs: 0 });
    expect(game.scores.get(nacre.id)).toEqual({ kills: 0, downs: 1 });
    expect(game.scores.get(silt.id)).toEqual({ kills: 0, downs: 1 });
    expectBooks(game);
  });

  it("pays from the victim stake when the killer posted more", () => {
    const game = castGame(0);
    const pip = mintFish(game, "medium", "Pip", "fang");
    const pebble = game.fish.find((item) => item.name === "Pebble")!;
    expect(game.register(pip.id, 18 * UGNOT, 0).ok).toBe(true);
    expect(game.startMatch(pip.id, 0).ok).toBe(true);
    const purse = game.purse(PLAYER_ID).gnot;
    const held = game.purse(PLAYER_ID).fish;
    const victimPurse = game.purse(pebble.ownerId).gnot;
    const { report } = down(game, pip.id, pebble.id, 0);
    expect(report.gnot).toEqual(splitKill(16 * UGNOT));
    expect(report.fishReward).toBe(16);
    expect(game.purse(PLAYER_ID).gnot).toBe(purse + report.gnot.killer);
    expect(game.purse(PLAYER_ID).fish).toBe(held + 16);
    expect(game.purse(pebble.ownerId).gnot).toBe(victimPurse);
    expect(pip.poolUgnot).toBe(18 * UGNOT);
    expect(pebble.poolUgnot).toBe(0);
    expectBooks(game);
  });

  it("pays cheer USDC by locked weight and ignores cheer for damage", () => {
    const game = castGame(0);
    const pip = mintFish(game, "medium", "Pip", "fang");
    const pebble = game.fish.find((item) => item.name === "Pebble")!;
    expect(game.register(pip.id, STAKE_MIN_UGNOT, 0).ok).toBe(true);
    expect(game.cheer(pip.id, "gnot", UGNOT, 0).ok).toBe(false);
    const cheerCap = Math.floor(pebble.poolUgnot / 2);
    expect(game.cheer(pebble.id, "gnot", cheerCap + UGNOT, 0).ok).toBe(false);
    expect(game.cheer(pebble.id, "gnot", cheerCap, 0).ok).toBe(true);
    const before = game.previewStrike(pip.id, pebble.id, 0);
    const after = game.previewStrike(pip.id, pebble.id, 0);
    expect(after?.damage).toBe(before?.damage);
    expect(game.startMatch(pip.id, 0).ok).toBe(true);
    expect(game.cheer(pebble.id, "gnot", UGNOT, 1).ok).toBe(false);
    game.relocate(pip.id, pebble.sx, pebble.sz);
    const hp = pebble.hp;
    expect(game.tryBite(pip.id, pebble.id, 1).ok).toBe(true);
    expect(pebble.hp).toBe(hp - (before?.damage ?? 0));
    const heavy = 2 * UGNOT;
    const light = 50;
    game.books.reserveGnot -= heavy;
    game.books.reserveFish -= light;
    game.cheers.push(
      {
        id: "c-heavy",
        viewerId: "viewer-heavy",
        fishId: pip.id,
        matchId: pip.matchId ?? "",
        asset: "gnot",
        amount: heavy,
        until: 0,
        returned: false,
        valueGnotAtLock: heavy,
      },
      {
        id: "c-light",
        viewerId: "viewer-light",
        fishId: pip.id,
        matchId: pip.matchId ?? "",
        asset: "fish",
        amount: light,
        until: 0,
        returned: false,
        valueGnotAtLock: cheerValueUgnot("fish", light),
      },
    );
    const { report } = down(game, pip.id, pebble.id, 10_000);
    const weights = [heavy, cheerValueUgnot("fish", light)];
    const shares = sharePool(report.gnot.cheer, weights);
    const heavyClaim = game.claims.find((claim) => claim.viewerId === "viewer-heavy");
    const lightClaim = game.claims.find((claim) => claim.viewerId === "viewer-light");
    expect(heavyClaim).toMatchObject({ kind: "cheer", gnot: shares[0], fish: 0 });
    expect(lightClaim).toMatchObject({ kind: "cheer", gnot: shares[1], fish: 0 });
    expect(shares[0] + shares[1]).toBe(report.gnot.cheer);
    expectBooks(game);
  });

  it("sends an empty cheer to the team and does not drop a watch shard", () => {
    const game = castGame(0);
    const pip = mintFish(game, "medium", "Pip", "fang");
    const pebble = game.fish.find((item) => item.name === "Pebble")!;
    expect(game.register(pip.id, STAKE_MIN_UGNOT, 0).ok).toBe(true);
    expect(game.startMatch(pip.id, 0).ok).toBe(true);
    game.setWatching(VIEWER_ID, true, 0);
    const team = game.books.devGnot;
    const season = game.books.seasonTreasuryGnot;
    const fishBefore = game.books.reserveFish;
    const held = game.purse(PLAYER_ID).fish;
    const { deathAt, report } = down(game, pip.id, pebble.id, 0);
    const bought = buybackAtTwap(report.gnot.buyback, fishBefore);
    expect(game.claims.filter((claim) => claim.kind === "watch")).toHaveLength(0);
    expect(game.books.devGnot).toBe(team + report.gnot.team + report.gnot.cheer);
    expect(game.books.seasonTreasuryGnot).toBe(season);
    expect(report.fishReward).toBe(10);
    expect(bought.fish).toBe(15);
    expect(game.purse(PLAYER_ID).fish).toBe(held + report.fishReward);
    expect(game.books.reserveFish).toBe(fishBefore - bought.fish - report.fishReward);
    game.books.reserveGnot -= 1_000;
    game.claims.push({
      id: "old-shard",
      viewerId: "",
      gnot: 1_000,
      fish: 0,
      killerId: pip.id,
      kind: "watch",
      claimed: false,
      expiresAt: deathAt + 30_000,
      killAt: deathAt,
      killId: "old-kill",
      killerOwnerId: pip.ownerId,
      victimOwnerId: pebble.ownerId,
    });
    game.tick(deathAt + 30_000);
    expect(game.books.seasonTreasuryGnot).toBe(season + 1_000);
    expect(game.claims.find((claim) => claim.id === "old-shard")?.claimed).toBe(true);
    expectBooks(game);
  });
});

describe("bites", () => {
  it("misses outside the radius without starting cooldown", () => {
    const game = castGame(0);
    const pip = mintFish(game, "medium", "Pip", "fang");
    const pebble = game.fish.find((item) => item.name === "Pebble")!;
    expect(game.register(pip.id, STAKE_MIN_UGNOT, 0).ok).toBe(true);
    expect(game.startMatch(pip.id, 0).ok).toBe(true);
    game.relocate(pip.id, pebble.sx + 3, pebble.sz);
    const hp = pebble.hp;
    expect(game.tryBite(pip.id, pebble.id, 0).ok).toBe(false);
    expect(pebble.hp).toBe(hp);
    expect(pip.nextBiteAt).toBe(0);
    game.relocate(pip.id, pebble.sx, pebble.sz);
    expect(game.tryBite(pip.id, pebble.id, 0).ok).toBe(true);
    expect(new Set(Object.values(SPECIES).map((spec) => spec.biteCooldownMs))).toEqual(new Set([1000]));
    expect(pip.nextBiteAt).toBe(1000);
    expect(game.tryBite(pip.id, pebble.id, 10).ok).toBe(false);
    const pipHp = pip.hp;
    expect(game.tryBite(pebble.id, pip.id, 10).ok).toBe(false);
    expect(pip.hp).toBe(pipHp);
    expect(game.tryBite(pebble.id, pip.id, pip.nextBiteAt).ok).toBe(true);
    expect(pip.hp).toBeLessThan(pipHp);
    expectBooks(game);
  });

  it("lets a large fish bite one sector farther than a small fish", () => {
    const game = castGame(0);
    const pip = mintFish(game, "medium", "Pip", "fang");
    const pebble = game.fish.find((item) => item.name === "Pebble")!;
    const nacre = game.fish.find((item) => item.name === "Nacre")!;
    expect(game.register(pip.id, STAKE_MIN_UGNOT, 0).ok).toBe(true);
    expect(game.startMatch(pip.id, 0).ok).toBe(true);
    game.relocate(pebble.id, 0, 0);
    game.relocate(pip.id, 1, 0);
    expect(game.tryBite(pebble.id, pip.id, 0).ok).toBe(false);
    expect(pebble.nextBiteAt).toBe(0);
    game.relocate(nacre.id, 0, 0);
    nacre.faceDx = 1;
    nacre.faceDz = 0;
    expect(game.tryBite(nacre.id, pip.id, 0).ok).toBe(true);
    expectBooks(game);
  });

  it("keeps a large mouth off fish behind the tail and on the flank", () => {
    const game = castGame(0);
    const pip = mintFish(game, "small", "Pip", "fang");
    const nacre = game.fish.find((item) => item.name === "Nacre")!;
    expect(nacre.size).toBe("large");
    expect(game.register(pip.id, STAKE_MIN_UGNOT, 0).ok).toBe(true);
    expect(game.startMatch(pip.id, 0).ok).toBe(true);
    game.relocate(nacre.id, 0, 0);
    nacre.faceDx = 0;
    nacre.faceDz = -1;
    const hp = pip.hp;
    game.relocate(pip.id, 0, 1);
    expect(game.tryBite(nacre.id, pip.id, 0)).toMatchObject({ ok: false, detail: "That fish is outside bite range." });
    expect(nacre.nextBiteAt).toBe(0);
    expect(pip.hp).toBe(hp);
    game.relocate(pip.id, 1, 0);
    expect(game.tryBite(nacre.id, pip.id, 0).ok).toBe(false);
    expect(nacre.nextBiteAt).toBe(0);
    pip.x = nacre.x;
    pip.z = nacre.z - 6;
    expect(game.tryBite(nacre.id, pip.id, 0).ok).toBe(true);
    expect(pip.hp).toBeLessThan(hp);
    expectBooks(game);
  });

  it("lets a small fish dodge the edge that still hits a body with no dodge", () => {
    const game = castGame(0);
    const pip = mintFish(game, "medium", "Pip", "fang");
    const current = game.fish.find((item) => item.name === "Current")!;
    const kelp = game.fish.find((item) => item.name === "Kelp")!;
    const nacre = game.fish.find((item) => item.name === "Nacre")!;
    expect(current.dodge).toBe(4.8);
    expect(current.speed).toBeGreaterThan(nacre.speed);
    expect(nacre.dodge).toBe(1.2);
    expect(nacre.hpMax).toBeGreaterThan(current.hpMax);
    expect(pip.dodge).toBe(0.4);
    expect(game.register(pip.id, 40 * UGNOT, 0).ok).toBe(true);
    expect(game.startMatch(pip.id, 0).ok).toBe(true);
    game.relocate(kelp.id, 0, 0);
    game.relocate(current.id, 1, 0);
    kelp.faceDx = 1;
    kelp.faceDz = 0;
    expect(game.tryBite(kelp.id, current.id, 0)).toMatchObject({ ok: false, detail: "That fish dodged." });
    expect(kelp.nextBiteAt).toBe(0);
    expect(current.hp).toBe(current.hpMax);
    game.relocate(pip.id, 1, 0);
    expect(game.tryBite(kelp.id, pip.id, 0).ok).toBe(true);
    expect(pip.hp).toBeLessThan(pip.hpMax);
    expectBooks(game);
  });

  it("refuses a clan mate and still bites across clans", () => {
    const allied = castGame(0);
    const pip = mintFish(allied, "medium", "Pip", "fang");
    const pebble = allied.fish.find((item) => item.name === "Pebble")!;
    expect(allied.enlist("reef", pip.id, 0).ok).toBe(true);
    expect(allied.register(pip.id, STAKE_MIN_UGNOT, 0).ok).toBe(true);
    expect(allied.startMatch(pip.id, 0).ok).toBe(true);
    allied.relocate(pip.id, pebble.sx, pebble.sz);
    expect(allied.tryBite(pip.id, pebble.id, 0).ok).toBe(false);
    expect(pip.nextBiteAt).toBe(0);

    const across = castGame(0);
    const hunter = mintFish(across, "medium", "Pip", "fang");
    const brine = across.fish.find((item) => item.name === "Brine")!;
    expect(across.enlist("reef", hunter.id, 0).ok).toBe(true);
    expect(across.register(hunter.id, 80 * UGNOT, 0).ok).toBe(true);
    expect(across.startMatch(hunter.id, 0).ok).toBe(true);
    across.relocate(hunter.id, brine.sx, brine.sz);
    expect(across.tryBite(hunter.id, brine.id, 0).ok).toBe(true);
    expectBooks(allied);
    expectBooks(across);
  });

  it("refuses a self bite and an ally bite", () => {
    const game = castGame(0);
    const pip = mintFish(game, "medium", "Pip", "fang");
    const pebble = game.fish.find((item) => item.name === "Pebble")!;
    expect(game.tryBite(pip.id, pip.id, 0).ok).toBe(false);
    expect(pip.nextBiteAt).toBe(0);
    expect(game.register(pip.id, STAKE_MIN_UGNOT, 0).ok).toBe(true);
    expect(game.foundParty("Hunt", pip.id, 0).ok).toBe(true);
    expect(game.inviteToParty("pebble", pip.id, 0).ok).toBe(true);
    game.relocate(pip.id, pebble.sx, pebble.sz);
    expect(game.tryBite(pip.id, pebble.id, 0).ok).toBe(false);
    expect(pip.nextBiteAt).toBe(0);
    expectBooks(game);
  });

  it("keeps old stake, feed, and revive calls closed", () => {
    const game = castGame(0);
    expect(game.stake().ok).toBe(false);
    expect(game.feed().ok).toBe(false);
    expect(game.reviveFree().ok).toBe(false);
    expect(game.revivePaid().ok).toBe(false);
    expectBooks(game);
  });

  it("crosses a sector at the practice cruise speed", () => {
    const game = castGame(0);
    const pip = mintFish(game, "medium", "Pip", "swift");
    game.relocate(pip.id, 0, 1);
    pip.nextMoveAt = 0;
    let x = 4;
    let z = 12;
    let now = 1_000;
    for (let i = 0; i < 40; i++) {
      z -= 12 * 0.033;
      const held = game.commitPose(pip.id, x, z, 0, -1, now);
      x = held.x;
      z = held.z;
      now += 33;
    }
    expect(pip.sz).toBeLessThan(1);
    expect(moveDelayMs(worldUnitsPerSecond(SPECIES.common.speed, 0))).toBeLessThan(
      moveDelayMs(worldUnitsPerSecond(SPECIES.mythic.speed, 0)),
    );
    expectBooks(game);
  });

  it("glides across a cell edge while the sector index waits", () => {
    const game = castGame(0);
    const pip = mintFish(game, "medium", "Pip", "fang");
    game.relocate(pip.id, 0, 0);
    pip.nextMoveAt = 10_000;
    const held = game.commitPose(pip.id, 8.4, 4, 1, 0, 1_000);
    expect(pip.sx).toBe(0);
    expect(pip.sz).toBe(0);
    expect(held.x).toBeCloseTo(8.4);
    expect(held.z).toBeCloseTo(4);
    expect(pip.nextMoveAt).toBe(10_000);
    expectBooks(game);
  });

  it("opens a burst once and crosses the next cell sooner", () => {
    const game = castGame(0);
    const fish = mintFish(game, "medium", "Pip", "swift");
    game.relocate(fish.id, 0, 0);
    fish.nextMoveAt = 0;
    game.commitPose(fish.id, 8.5, 4, 1, 0, 1_000);
    const cruiseWait = fish.nextMoveAt - 1_000;
    game.relocate(fish.id, 0, 0);
    fish.nextMoveAt = 0;
    fish.burstUntil = 0;
    fish.nextBurstAt = 0;
    expect(game.tryBurst(fish.id, 1_000).ok).toBe(true);
    game.commitPose(fish.id, 8.5, 4, 1, 0, 1_000);
    expect(fish.nextMoveAt - 1_000).toBeLessThan(cruiseWait);
    expect(fish.burstUntil).toBe(1_000 + BURST_MS);
    expect(fish.nextBurstAt).toBe(1_000 + BURST_MS + BURST_COOLDOWN_MS);
    expect(BURST_COOLDOWN_MS).toBe(2_000);
    expect(game.tryBurst(fish.id, 1_500).ok).toBe(false);
    expect(game.tryBurst(fish.id, fish.nextBurstAt).ok).toBe(true);
    expectBooks(game);
  });
});

describe("social", () => {
  it("saves a practice profile and friends a sailor by address", () => {
    const game = castGame(0);
    const address = game.profileById(PLAYER_ID)?.address;
    expect(game.setProfile("ab", "Vietnam", "wave", 0).ok).toBe(false);
    expect(game.setProfile("pebble", "Vietnam", "wave", 0).ok).toBe(false);
    expect(game.setProfile("skip", "Atlantis", "wave", 0).ok).toBe(false);
    expect(game.setProfile("skip", "Germany", "wave", 0).ok).toBe(true);
    expect(game.profileById(PLAYER_ID)?.country).toBe("Germany");
    expect(game.fish.some((fish) => fish.ownerId === PLAYER_ID && !fish.burned)).toBe(false);
    expect(game.setProfile("skip", "Korea", "moon", 0).ok).toBe(true);
    expect(game.profileById(PLAYER_ID)?.username).toBe("skip");
    expect(game.displayName({ ownerId: PLAYER_ID, name: "Minnow" })).toBe("skip");
    expect(game.adoptProfile("pebble", "Vietnam", "wave")).toBe(false);
    expect(game.profileById(PLAYER_ID)?.username).toBe("skip");
    expect(game.rememberSailor(PLAYER_ID, "other")).toBe(false);
    expect(game.rememberSailor("g1other", "otter")).toBe(true);
    expect(game.displayName({ ownerId: "g1other", name: "Fish 2" })).toBe("otter");
    expect(game.profileById(PLAYER_ID)?.address).toBe(address);
    expect(game.requestFriend("skip", 0).ok).toBe(false);
    expect(game.requestFriend("g1shoal1pebble", 0)).toMatchObject({ ok: true, detail: "pending" });
    expect(game.friends.find((link) => link.fromId === PLAYER_ID)?.status).toBe("pending");
    const pebble = game.profiles.find((profile) => profile.username === "pebble");
    expect(pebble).toBeTruthy();
    expect(game.isOnline(pebble!.id)).toBe(true);
    const body = game.fish.find((fish) => fish.ownerId === pebble!.id);
    if (!body) throw new Error("missing pebble");
    body.alive = false;
    expect(game.isOnline(pebble!.id)).toBe(false);
    expect(game.requestFriend("current", 0).ok).toBe(true);
    expect(game.friends.find((link) => link.fromId !== PLAYER_ID)?.status).toBe("accepted");
    expectBooks(game);
  });

  it("founds a party with a logo and country, then invites by username", () => {
    const game = castGame(0);
    const pip = mintFish(game, "medium", "Pip", "fang");
    expect(game.inviteToParty("pebble", pip.id, 0).ok).toBe(false);
    expect(game.foundParty("Tide", pip.id, 0, "nope" as CrestId, "Vietnam").ok).toBe(false);
    expect(game.foundParty("Tide", pip.id, 0, "sun", "Vietnam").ok).toBe(true);
    const party = game.parties.get(pip.partyId!);
    expect(party?.crest).toBe("sun");
    expect(party?.country).toBe("Vietnam");
    const pebble = game.fish.find((fish) => fish.name === "Pebble");
    expect(game.inviteToParty("pebble", pip.id, 0).ok).toBe(true);
    expect(pebble?.partyId).toBe(pip.partyId);
    expect(game.tryBite(pip.id, pebble!.id, 0).ok).toBe(false);
    expect(game.say("world", "hello reef", 0).ok).toBe(true);
    expect(game.say("party", "on me", 0).ok).toBe(true);
    expect(game.say("clan", "holding", 0).ok).toBe(false);
    expect(game.enlist("reef", pip.id, 0).ok).toBe(true);
    expect(game.say("clan", "holding", 0).ok).toBe(true);
    expect(game.say("world", "", 0).ok).toBe(false);
    expect(game.chats.some((line) => line.channel === "party" && line.text === "on me")).toBe(true);
    const fresh = new ShoalGame(0);
    expect(fresh.restorePracticeChat([
      { channel: "world", roomId: "world", fromId: PLAYER_ID, text: "still here", at: 1 },
      { channel: "world", roomId: "world", fromId: PLAYER_ID, text: "", at: 1 },
    ])).toBe(1);
    expect(fresh.restorePracticeChat([{ channel: "world", roomId: "world", fromId: PLAYER_ID, text: "again", at: 2 }])).toBe(0);
    expect(fresh.chats.map((line) => line.text)).toEqual(["still here"]);
    expectBooks(game);
  });

  it("locks a lay after 3 matches and hatches a same-size child on settle", () => {
    const game = castGame(0);
    const pip = mintFish(game, "small", "Pip", "swift");
    expect(game.commitLay(pip.id, 0)).toMatchObject({
      ok: false,
      detail: "Finish 3 more matches with Pip before a lay.",
    });
    expect(game.purse(PLAYER_ID).gnot).toBe(2_000 * UGNOT - MINT_FEE_UGNOT);
    finishBout(game, pip);
    finishBout(game, pip);
    expect(game.commitLay(pip.id, 0).detail).toBe("Finish 1 more match with Pip before a lay.");
    finishBout(game, pip);
    expect(pip.bouts).toBe(3);
    const purse = game.purse(PLAYER_ID).gnot;
    const treasury = game.books.upgradeTreasuryGnot;
    const lp = game.books.liquidityGnot;
    const burn = game.books.burnGnot;
    const team = game.books.devGnot;
    expect(game.register(pip.id, STAKE_MIN_UGNOT, 0).ok).toBe(true);
    expect(game.commitLay(pip.id, 0)).toMatchObject({ ok: false, detail: "A fish in a match cannot lay." });
    expect(game.leaveMatch(pip.id, 0).ok).toBe(true);
    setPurse(game, LAY_FEE_UGNOT - 1);
    expect(game.commitLay(pip.id, 0)).toMatchObject({ ok: false, detail: "Not enough USDC in the practice purse." });
    expect(pip.layCommitAt).toBeNull();
    setPurse(game, purse);
    const split = splitMint(LAY_FEE_UGNOT);
    expect(game.commitLay(pip.id, 1_000).ok).toBe(true);
    expect(game.commitLay(pip.id, 1_000)).toMatchObject({ ok: false, detail: "That lay is already locked." });
    expect(pip.layBoutsUsed).toBe(3);
    expect(game.purse(PLAYER_ID).gnot).toBe(purse - LAY_FEE_UGNOT);
    expect(game.books.upgradeTreasuryGnot - treasury).toBe(split.upgradeTreasury);
    expect(game.books.liquidityGnot - lp).toBe(split.lp);
    expect(game.books.burnGnot - burn).toBe(split.burn);
    expect(game.books.devGnot - team).toBe(split.team);
    expect(game.register(pip.id, STAKE_MIN_UGNOT, 1_000)).toMatchObject({
      ok: false,
      detail: "Settle the lay before this fish enters a match.",
    });
    const nib = mintFish(game, "small", "Nib", "swift");
    finishBout(game, nib);
    const beforeUpgrade = game.purse(PLAYER_ID).gnot;
    expect(game.upgrade(pip.id, nib.id, 1_000, 0)).toMatchObject({
      ok: false,
      detail: "Settle the lay before an upgrade.",
    });
    expect(game.purse(PLAYER_ID).gnot).toBe(beforeUpgrade);
    expect(pip.alive).toBe(true);
    expect(game.settleLay(pip.id, 1_000 + LAY_SETTLE_MS - 1)).toMatchObject({
      ok: false,
      detail: "Settle opens after the practice wait.",
    });
    expect(game.owned(PLAYER_ID)).toHaveLength(2);
    const settled = game.settleLay(pip.id, 1_000 + LAY_SETTLE_MS);
    expect(settled.ok).toBe(true);
    if (!settled.ok) throw new Error("settle");
    const child = game.fishById(settled.detail);
    if (!child) throw new Error("missing fry");
    expect(child.name).toBe("Pip fry");
    expect(child.size).toBe(pip.size);
    expect(child.rarity).toBe("common");
    expect(["swift", "fang", "hide"]).toContain(child.trait);
    expect(child.bouts).toBe(0);
    expect(child.layCommitAt).toBeNull();
    expect(pip.layCommitAt).toBeNull();
    expect(pip.alive).toBe(true);
    expect(game.mint("small", "Cod", 1_000 + LAY_SETTLE_MS, "swift")).toMatchObject({
      ok: false,
      detail: "Finish a match with Pip fry before minting another.",
    });
    expect(game.commitLay(pip.id, 2_000)).toMatchObject({
      ok: false,
      detail: "Finish 3 more matches with Pip before a lay.",
    });
    finishBout(game, pip, 2_000);
    finishBout(game, pip, 2_000);
    expect(game.commitLay(pip.id, 2_000).detail).toBe("Finish 1 more match with Pip before a lay.");
    finishBout(game, pip, 2_000);
    expect(game.commitLay(pip.id, 2_000).ok).toBe(true);
    const rival = game.fish.find((fish) => fish.ai);
    expect(game.settleLay(rival!.id, 9_000)).toMatchObject({ ok: false, detail: "That fish has no lay to settle." });
    expectBooks(game);
  });

  it("keeps the practice lay trait when an early settle does not roll", () => {
    const hatch = (early: boolean) => {
      const game = castGame(0);
      const pip = mintFish(game, "small", "Pip", "swift");
      finishBout(game, pip);
      finishBout(game, pip);
      finishBout(game, pip);
      const nib = mintFish(game, "small", "Nib", "swift");
      finishBout(game, nib);
      finishBout(game, nib);
      finishBout(game, nib);
      expect(game.commitLay(pip.id, 0).ok).toBe(true);
      expect(game.commitLay(nib.id, 0).ok).toBe(true);
      if (early) {
        expect(game.settleLay(pip.id, LAY_SETTLE_MS - 1).ok).toBe(false);
      }
      expect(game.settleLay(pip.id, LAY_SETTLE_MS).ok).toBe(true);
      expect(game.settleLay(nib.id, LAY_SETTLE_MS).ok).toBe(true);
      return game.owned(PLAYER_ID).filter((fish) => fish.name.endsWith(" fry")).map((fish) => fish.trait);
    };
    expect(hatch(true)).toEqual(hatch(false));
  });
});

describe("growth", () => {
  it("steps size, then one aspect, and still pays the upgrade fee", () => {
    const game = castGame(0);
    const pip = mintFish(game, "small", "Pip", "fang");
    expect(game.register(pip.id, STAKE_MIN_UGNOT, 0).ok).toBe(true);
    const silt = game.fish.find((fish) => fish.name === "Silt")!;
    const nacre = game.fish.find((fish) => fish.name === "Nacre")!;
    const pebble = game.fish.find((fish) => fish.name === "Pebble")!;
    const kelp = game.fish.find((fish) => fish.name === "Kelp")!;
    const fishBefore = game.fish.length;
    const biteAt = (victim: typeof silt, now: number) => {
      game.relocate(pip.id, victim.sx, victim.sz);
      pip.x = victim.x;
      pip.z = victim.z;
      victim.hp = 1;
      const bite = game.tryBite(pip.id, victim.id, now);
      expect(bite.ok).toBe(true);
      expect(bite.detail).toBe("kill");
      return bite;
    };
    biteAt(silt, 0);
    const downed = game.log.find((line) => line.victimId === silt.id);
    expect(downed?.text).toBe("Pip downed Silt. Killer 8.00 USDC and 10 FISH. Lost 10.00 USDC.");
    expect(downed?.attackerId).toBe(pip.id);
    expect(pip.growth).toBe(2);
    expect(pip.size).toBe("medium");
    expect(pip.rarity).toBe("common");
    expect(pip.poolUgnot).toBe(STAKE_MIN_UGNOT);
    biteAt(nacre, 5_000);
    expect(pip.size).toBe("large");
    expect(pip.growth).toBe(4);
    expect(pip.evolved).toBe(false);
    biteAt(pebble, 10_000);
    expect(pip.growth).toBe(5);
    expect(pip.aspect).toBeNull();
    const purse = game.purse(PLAYER_ID).gnot;
    const killed = biteAt(kelp, 15_000);
    expect(pip.growth).toBe(6);
    expect(pip.size).toBe("large");
    expect(pip.evolved).toBe(true);
    expect(pip.aspect).toBe("uncommon");
    expect(pip.rarity).toBe("common");
    expect(pip.species).toBe("Bubble");
    expect(pip.bite).toBe(31);
    expect(pip.hpMax).toBe(130);
    expect(pip.speed).toBe(88);
    expect(pip.speed / 75).toBeLessThan(1.8);
    expect(game.fish.length).toBe(fishBefore);
    const perKill = buybackAtTwap(splitKill(STAKE_MIN_UGNOT).buyback, GENESIS_FISH).fish + winFishReward(STAKE_MIN_UGNOT, GENESIS_FISH);
    expect(game.books.reserveFish).toBe(GENESIS_FISH - VIEWER_START_FISH - 4 * perKill);
    expect(game.purse(PLAYER_ID).gnot).toBe(purse + killed.report!.gnot.killer);
    expect(game.fx.some((fx) => fx.kind === "evolve" && fx.text === "Tideblade. Tier stays common.")).toBe(true);
    expect(game.fx.some((fx) => fx.kind === "gnot" && fx.text === `+${formatGnot(killed.report!.gnot.killer)}`)).toBe(true);
    expect(game.fx.some((fx) => fx.kind === "gnot" && fx.text === "+0.00")).toBe(false);
    const bouts = pip.bouts;
    expect(game.leaveMatch(pip.id, 15_000 + COMBAT_LOCK_MS).ok).toBe(true);
    expect(pip.bouts).toBe(bouts);
    expect(pip.growth).toBe(6);
    expect(pip.aspect).toBe("uncommon");
    const twin = mintFish(game, "large", "Twin", "fang", 30_000);
    finishBout(game, twin, 30_000);
    expect(twin.size).toBe("large");
    expect(twin.rarity).toBe("common");
    const fee = upgradeTo("uncommon")!.fee;
    setFish(game, fee);
    const beforeFee = game.purse(PLAYER_ID).gnot;
    const beforeFish = game.purse(PLAYER_ID).fish;
    expect(game.upgrade(pip.id, twin.id, 40_000, 0).ok).toBe(true);
    const next = game.owned(PLAYER_ID)[0];
    expect(next.rarity).toBe("uncommon");
    expect(next.evolved).toBe(false);
    expect(next.growth).toBe(0);
    expect(game.purse(PLAYER_ID).gnot).toBe(beforeFee);
    expect(game.purse(PLAYER_ID).fish).toBe(beforeFish - fee);
    expectBooks(game);
  });

  it("heals on a kill roll without moving another purse", () => {
    const game = castGame(0);
    const pip = mintFish(game, "medium", "Pip", "fang");
    expect(game.register(pip.id, STAKE_MIN_UGNOT, 0).ok).toBe(true);
    pip.hp = 40;
    const purse = game.purse(PLAYER_ID).gnot;
    const fishBefore = game.fish.length;
    expect(game.grantKillHeal(pip.id, 0, 0)).toBe(Math.floor((pip.hpMax * 15) / 100));
    expect(pip.hp).toBe(40 + Math.floor((pip.hpMax * 15) / 100));
    expect(game.purse(PLAYER_ID).gnot).toBe(purse);
    expect(game.fish.length).toBe(fishBefore);
    expect(game.grantKillHeal(pip.id, 9_999, 0)).toBe(0);
    const pebble = game.fish.find((fish) => fish.name === "Pebble")!;
    pebble.hp = 10;
    pebble.mustHeal = true;
    expect(game.grantKillHeal(pebble.id, 0, 0)).toBe(0);
    expect(pebble.hp).toBe(10);
    expectBooks(game);
  });

  it("hides a small fish in a cave and lets a large fish collapse it", () => {
    const game = castGame(0);
    const pip = mintFish(game, "small", "Pip", "swift");
    const pebble = game.fish.find((fish) => fish.name === "Pebble")!;
    const brine = game.fish.find((fish) => fish.name === "Brine")!;
    const cave = game.shelters.find((shelter) => shelter.id === "cave-north")!;
    expect(game.register(pip.id, STAKE_MIN_UGNOT, 0).ok).toBe(true);
    pebble.x = cave.x;
    pebble.z = cave.z;
    brine.x = cave.x;
    brine.z = cave.z + 6;
    brine.faceDx = 0;
    brine.faceDz = -1;
    const hp = pebble.hp;
    const before = cave.hp;
    expect(game.tryBite(brine.id, pebble.id, 0).ok).toBe(true);
    expect(pebble.hp).toBe(hp);
    expect(cave.hp).toBeLessThan(before);
    expect(brine.nextBiteAt).toBeGreaterThan(0);
    pip.x = cave.x;
    pip.z = cave.z + 0.4;
    pip.faceDx = 0;
    pip.faceDz = -1;
    const held = cave.hp;
    expect(game.tryBite(pip.id, pebble.id, 0).ok).toBe(true);
    expect(pebble.hp).toBeLessThan(hp);
    expect(cave.hp).toBe(held);
    cave.hp = 1;
    const at = brine.nextBiteAt;
    const blow = game.tryBite(brine.id, pebble.id, at);
    expect(blow.ok).toBe(true);
    expect(cave.hp).toBe(0);
    expect(cave.downUntil).toBe(at + SHELTER_REBUILD_MS);
    expect(pebble.mustHeal).toBe(false);
    game.tick(cave.downUntil);
    expect(cave.hp).toBe(cave.hpMax);
    expect(cave.hpMax).toBe(SHELTER_HP);
    game.relocate(brine.id, 3, -14);
    const heldPose = game.commitPose(brine.id, cave.x, cave.z, 0, -1, cave.downUntil);
    expect(Math.hypot(heldPose.x - cave.x, heldPose.z - cave.z)).toBeGreaterThanOrEqual(cave.inner - 1e-4);
    game.relocate(pebble.id, 3, -14);
    const inside = game.commitPose(pebble.id, cave.x, cave.z, 0, -1, cave.downUntil);
    expect(Math.hypot(inside.x - cave.x, inside.z - cave.z)).toBeLessThan(cave.inner);
    expectBooks(game);
  });

  it("moves the spring and does not heal a downed fish", () => {
    const first = springSlot(0);
    const second = springSlot(20_000);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first!.x !== second!.x || first!.z !== second!.z).toBe(true);
    expect(springSlot(15_000)).toBeNull();
    const game = castGame(0);
    expect(SEA_RADIUS).toBe(360);
    for (const fish of game.fish) {
      for (const rock of ROCKS) {
        expect(Math.hypot(fish.x - rock.x, fish.z - rock.z)).toBeGreaterThan(rock.radius);
      }
      for (const shelter of SHELTERS) {
        expect(Math.hypot(fish.x - shelter.x, fish.z - shelter.z)).toBeGreaterThan(shelter.inner);
      }
    }
    const pip = mintFish(game, "medium", "Pip", "fang");
    expect(game.register(pip.id, STAKE_MIN_UGNOT, 0).ok).toBe(true);
    pip.hp = Math.floor(pip.hpMax / 2);
    pip.x = first!.x;
    pip.z = first!.z;
    const hurt = pip.hp;
    const purse = game.purse(PLAYER_ID).gnot;
    game.tick(0);
    expect(pip.hp).toBeGreaterThan(hurt);
    expect(pip.hp).toBeLessThanOrEqual(pip.hpMax);
    const healed = pip.hp;
    game.tick(1_000);
    expect(pip.hp).toBe(healed);
    expect(game.purse(PLAYER_ID).gnot).toBe(purse);
    const pebble = game.fish.find((fish) => fish.name === "Pebble")!;
    const downed = pebble.hp;
    pebble.mustHeal = true;
    pebble.x = first!.x;
    pebble.z = first!.z;
    game.tick(2_000);
    expect(pebble.hp).toBe(downed);
    game.tick(10_000_000);
    expect(pip.poolUgnot).toBe(STAKE_MIN_UGNOT);
    expectBooks(game);
  });

  it("cruises the reef ring and slides out of every rock", () => {
    const radii = [0, 1, 2, 3, 4].map((seq) => idleCruiseRadius(seq));
    expect(Math.min(...radii)).toBe(88);
    expect(Math.max(...radii)).toBe(152);
    const lee = Math.hypot(96, 8);
    const spur = Math.hypot(-120, 72);
    expect(Math.min(...radii.map((radius) => Math.abs(radius - lee)))).toBeLessThanOrEqual(12);
    expect(Math.min(...radii.map((radius) => Math.abs(radius - spur)))).toBeLessThanOrEqual(12);
    expect(radii.every((radius) => radius < SEA_RADIUS)).toBe(true);
    const game = castGame(0);
    const rival = game.fish.find((fish) => fish.ai);
    expect(rival).toBeTruthy();
    for (const rock of ROCKS) {
      const sector = sectorOf(rock.x, rock.z);
      game.relocate(rival!.id, sector.sx, sector.sz);
      rival!.x = rock.x;
      rival!.z = rock.z;
      const pose = game.commitPose(rival!.id, rock.x, rock.z, 0, -1, 0);
      expect(Math.hypot(pose.x - rock.x, pose.z - rock.z)).toBeGreaterThanOrEqual(rock.radius - 1e-4);
    }
    expectBooks(game);
  });
});

describe("shared sea", () => {
  const SIGNER = "g1n4pl5uc4yt5r96m9w6fmdznx3x0jyg8l6arhmt";
  const OTHER = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";

  function seat(x: number, z: number, hp = 100, seq = 0, alive = true) {
    return {
      address: OTHER,
      onyxId: 3,
      name: "Brine",
      sailor: "brine",
      rarity: "common" as const,
      size: "medium" as const,
      trait: "fang" as const,
      x,
      z,
      fx: 0,
      fz: -1,
      hp,
      hpMax: 100,
      bite: 22,
      alive,
      seq,
    };
  }

  it("shows another wallet, drops them when they leave, and does not pay their USDC", () => {
    const game = new ShoalGame(0);
    expect(game.sharedSea).toBe(false);
    const mine = mintFish(game, "medium", "Minnow", "fang");
    expect(game.register(mine.id, STAKE_MIN_UGNOT, 0).ok).toBe(true);
    game.commitPose(mine.id, mine.x, mine.z, 0, -1, 0);
    expect(mine.yaw).toBeCloseTo(0);
    game.commitPose(mine.id, mine.x, mine.z, -1, 0, 0);
    expect(mine.yaw).toBeCloseTo(Math.PI / 2);
    const pose = game.roomPose(SIGNER);
    expect(pose?.fx).toBeCloseTo(-1);
    expect(pose?.fz).toBeCloseTo(0);
    expect(pose?.country).toBe("VN");
    const purse = game.purse(PLAYER_ID).gnot;
    game.mirrorRoom([seat(mine.x, mine.z)], SIGNER);
    const remote = game.fish.find((fish) => fish.remoteAddress === OTHER);
    expect(remote?.matchId).toBe(SEA_ID);
    expect(remote?.poolUgnot).toBe(0);
    expect(remote?.ai).toBe(false);
    expect(game.shown(remote!)).toBe(true);
    expect(game.fish.filter((fish) => fish.ownerId === OTHER)).toHaveLength(1);
    game.mirrorRoom([], SIGNER);
    expect(remote?.matchId).toBeNull();
    expect(remote?.burned).toBe(false);
    game.mirrorRoom([seat(mine.x, mine.z)], SIGNER);
    game.relocate(mine.id, remote!.sx, remote!.sz);
    const fishBefore = game.purse(PLAYER_ID).fish;
    const killed = down(game, mine.id, remote!.id, 0);
    expect(killed.report.gnot.killer).toBe(0);
    expect(killed.report.fishReward).toBe(0);
    expect(killed.report.buybackFish).toBe(0);
    expect(remote?.mustHeal).toBe(true);
    expect(remote?.matchId).toBeNull();
    expect(remote?.poolUgnot).toBe(0);
    expect(game.purse(PLAYER_ID).gnot).toBe(purse);
    expect(game.purse(PLAYER_ID).fish).toBe(fishBefore);
    const downed = game.log.find((line) => line.victimId === remote!.id);
    expect(downed?.text).toContain("downed");
    expect(downed?.text).not.toContain("FISH");
    expect(game.fx.some((fx) => fx.text.includes("FISH"))).toBe(false);
    const hits = game.takeRoomHits();
    expect(hits.at(-1)).toMatchObject({ address: OTHER, alive: false });
    expect(game.takeRoomHits()).toEqual([]);
    const kills = game.takeRoomKills();
    expect(kills).toHaveLength(1);
    expect(kills[0]).toMatchObject({ gnot: 0, fish: 0, victimAddress: OTHER });
    expect(kills[0].id).toMatch(/^k[a-z0-9]{4,20}$/);
    expect(game.takeRoomKills()).toEqual([]);
    const feed = game.killFeed();
    expect(feed).toHaveLength(1);
    expect(feed[0].id).toBe(kills[0].id);
    expect(feed[0]).toMatchObject({
      attacker: "skipper",
      attackerCountry: "VN",
      victim: game.displayName(remote!),
      victimCountry: "",
      gnot: 0,
      fish: 0,
    });
    expectBooks(game);
  });

  it("lowers this fish from a newer seq and returns the stake when the other browser downs it", () => {
    const game = new ShoalGame(0);
    const mine = mintFish(game, "medium", "Minnow", "fang");
    expect(game.register(mine.id, STAKE_MIN_UGNOT, 0).ok).toBe(true);
    const full = mine.hp;
    game.applyRoomSelf({ ...seat(mine.x, mine.z), address: SIGNER, seq: 1, hp: full }, 10);
    game.applyRoomSelf({ ...seat(mine.x, mine.z), address: SIGNER, seq: 2, hp: full - 8, alive: true }, 20);
    expect(mine.hp).toBe(full - 8);
    game.applyRoomSelf({ ...seat(mine.x, mine.z), address: SIGNER, seq: 3, hp: full, alive: true }, 30);
    expect(mine.hp).toBe(full - 8);
    expect(mine.matchId).toBe(SEA_ID);
    game.applyRoomSelf({ ...seat(mine.x, mine.z), address: SIGNER, seq: 4, hp: 20, alive: false }, 40);
    expect(mine.mustHeal).toBe(true);
    expect(mine.matchId).toBeNull();
    expect(mine.poolUgnot).toBe(0);
    expect(game.activeFishId).toBe(mine.id);
    expect(game.purse(PLAYER_ID).gnot).toBe(2_000 * UGNOT - MINT_FEE_UGNOT);
    expect(game.log[0]?.text).toContain("was downed");
    expect(game.log[0]?.text).toContain("The stake returned to this browser.");
    expect(game.roomPose(SIGNER)).toBeNull();
    expectBooks(game);
  });

  it("keeps the sender's line and shows another sailor's room chat with their country", () => {
    const game = new ShoalGame(0);
    expect(game.say("world", "hello", 5).ok).toBe(true);
    expect(game.receiveRoomChat({
      id: "cabcde1",
      from: SIGNER,
      fromName: "skipper",
      country: "VN",
      text: "hello",
      at: 5,
    }, SIGNER)).toBe(false);
    expect(game.chats).toHaveLength(1);
    expect(game.receiveRoomChat({
      id: "cbrine1",
      from: OTHER,
      fromName: "brine",
      country: "KR",
      text: "north",
      at: 8,
    }, SIGNER)).toBe(true);
    expect(game.profileById(OTHER)?.country).toBe("Korea");
    expect(game.profileById(OTHER)?.username).toBe("brine");
    expect(game.receiveRoomChat({
      id: "carc1",
      from: "0x3cb09e7756199222939df0378e0ae8f8d2360b28",
      fromName: "minnow",
      country: "VN",
      text: "here",
      at: 9,
    }, SIGNER)).toBe(true);
    expect(game.chats.map((line) => line.text)).toEqual(["hello", "north", "here"]);
    expect(game.receiveRoomChat({
      id: "cbrine1",
      from: OTHER,
      fromName: "brine",
      country: "KR",
      text: "north",
      at: 8,
    }, SIGNER)).toBe(false);
    expectBooks(game);
  });

  it("keeps a friend request pending and reuses a chain fish without a second body", () => {
    const game = new ShoalGame(0);
    expect(game.receiveFriendRequest(OTHER, "brine", 0)).toBe("pending");
    expect(game.receiveFriendRequest(OTHER, "brine", 1)).toBe("ignore");
    const link = game.friends.find((item) => item.fromId === OTHER);
    expect(link?.status).toBe("pending");
    expect(link?.toId).toBe(PLAYER_ID);
    expect(game.friends.some((item) => item.status === "accepted")).toBe(false);
    expect(game.requestFriend("brine", 2).detail).toBe("accepted");
    expect(game.receiveFriendAccept(OTHER, "brine", 3)).toBe(false);

    const sent = new ShoalGame(0);
    sent.rememberSailor(OTHER, "brine");
    expect(sent.requestFriend(OTHER, 4).detail).toBe("pending");
    expect(sent.friends.every((item) => item.status === "pending")).toBe(true);
    expect(sent.receiveFriendAccept("not-a-wallet", "brine", 5)).toBe(false);
    expect(sent.receiveFriendAccept(OTHER, "brine", 6)).toBe(true);
    expect(sent.friends.find((item) => item.toId === OTHER)?.status).toBe("accepted");
    const stranger = new ShoalGame(0);
    expect(stranger.receiveFriendAccept(OTHER, "brine", 7)).toBe(false);
    expect(stranger.friends).toHaveLength(0);
    stranger.rememberSailor(OTHER, "brine");
    expect(stranger.requestFriend(OTHER, 8).detail).toBe("pending");
    expect(stranger.receiveFriendDecline(OTHER, "brine", 9)).toBe(true);
    expect(stranger.friends).toHaveLength(0);
    const crossed = new ShoalGame(0);
    crossed.rememberSailor(OTHER, "brine");
    expect(crossed.requestFriend(OTHER, 10).detail).toBe("pending");
    expect(crossed.receiveFriendRequest(OTHER, "brine", 11)).toBe("mutual");
    expect(crossed.friends.find((item) => item.toId === OTHER)?.status).toBe("accepted");
    const sameName = new ShoalGame(0);
    expect(sameName.profileById(PLAYER_ID)?.username).toBe("skipper");
    expect(sameName.receiveFriendRequest(OTHER, "skipper", 12)).toBe("pending");
    expect(sameName.friends.filter((item) => item.status === "accepted")).toHaveLength(0);
    expect(sameName.profileById(OTHER)?.username).not.toBe("skipper");

    const fresh = new ShoalGame(0);
    const reserve = fresh.books.reserveGnot;
    fresh.syncChainRoster(SIGNER, [{
      onyxId: 3,
      owner: OTHER,
      name: "Jenny",
      rarity: "common",
      size: "small",
      trait: "fang",
      poolUgnot: 10 * UGNOT,
      inMatch: true,
      bouts: 0,
      image: "",
    }], 0);
    expect(fresh.books.reserveGnot).toBe(reserve - 10 * UGNOT);
    fresh.mirrorRoom([seat(12, 16)], SIGNER);
    expect(fresh.fish.filter((fish) => fish.ownerId === OTHER)).toHaveLength(1);
    expect(fresh.fish[0].remote).toBe(true);
    expect(fresh.fish[0].x).toBe(12);
    expect(fresh.fish[0].poolUgnot).toBe(0);
    expect(fresh.books.reserveGnot).toBe(reserve);
    expectBooks(fresh);
  });

  it("refuses a bite between two Arc wallets in the same FishParty crew", () => {
    const game = new ShoalGame(0);
    const me = "0x3cb09e7756199222939df0378e0ae8f8d2360b28";
    const other = "0x8eaae9f664214987204616dd8145bacad48044f6";
    const row = (onyxId: number, owner: string) => ({
      onyxId,
      owner,
      name: "minnow",
      rarity: "common" as const,
      size: "small" as const,
      trait: "fang" as const,
      poolUgnot: UGNOT,
      inMatch: true,
      bouts: 0,
      image: "",
    });
    game.syncChainRoster(me, [row(2, me), row(1, other)], 0);
    const own = game.owned(PLAYER_ID).find((fish) => fish.onyxId === 2);
    const theirs = game.fish.find((fish) => fish.onyxId === 1);
    expect(own).toBeTruthy();
    expect(theirs).toBeTruthy();
    if (!own || !theirs) return;
    expect(game.allied(own, theirs)).toBe(false);
    game.seatArcCrew(me, 1, "VN", [me]);
    expect(game.arcCrewView()).toEqual({ id: 1, name: "VN", members: [me] });
    expect(game.allied(own, theirs)).toBe(false);
    game.seatArcCrew(me, 1, "VN", [me, other]);
    expect(own.partyId).toBe("arc-1");
    expect(theirs.partyId).toBe("arc-1");
    expect(game.allied(own, theirs)).toBe(true);
    const hp = theirs.hp;
    expect(game.tryBite(own.id, theirs.id, 0)).toMatchObject({ ok: false, detail: "Allies do not bite each other." });
    expect(theirs.hp).toBe(hp);
    expect(own.nextBiteAt).toBe(0);
    game.syncChainRoster(me, [row(2, me), row(1, other)], 1);
    expect(own.partyId).toBe("arc-1");
    expect(game.allied(own, theirs)).toBe(true);
    game.clearArcCrew();
    expect(game.arcCrewView()).toBeNull();
    expect(own.partyId).toBeNull();
    expect(theirs.partyId).toBeNull();
    expect(game.allied(own, theirs)).toBe(false);
    expectBooks(game);
  });

  it("restores a wallet's friends after a reload and keeps a second load from duplicating them", () => {
    const game = new ShoalGame(0);
    const me = "0x3cb09e7756199222939df0378e0ae8f8d2360b28";
    const other = "0x8eaae9f664214987204616dd8145bacad48044f6";
    game.meetSailor(other, "minnow");
    expect(game.requestFriend(other, 0).detail).toBe("pending");
    expect(game.receiveFriendAccept(other, "minnow", 1)).toBe(true);
    const saved = game.exportFriends();
    expect(saved).toEqual([{ other, username: "minnow", status: "accepted", incoming: false }]);
    const fresh = new ShoalGame(0);
    expect(fresh.restoreFriends(me, saved)).toBe(1);
    expect(fresh.restoreFriends(me, saved)).toBe(0);
    expect(fresh.friends).toHaveLength(1);
    expect(fresh.friends[0]?.status).toBe("accepted");
    expect(fresh.exportFriends()).toEqual(saved);
    const switched = new ShoalGame(0);
    switched.restoreFriends(me, saved);
    switched.restoreFriends(other, []);
    expect(switched.friends).toHaveLength(0);
    expectBooks(game);
    expectBooks(fresh);
    expectBooks(switched);
  });

  it("shows a party invite until this wallet sits in the crew", () => {
    const game = new ShoalGame(0);
    const me = "0x3cb09e7756199222939df0378e0ae8f8d2360b28";
    const other = "0x8eaae9f664214987204616dd8145bacad48044f6";
    game.notePartyInvite(other, "VN");
    expect(game.partyInviteView()).toEqual({ from: other, name: "VN" });
    game.notePartyInvite(other, "VN");
    expect(game.partyInviteView()).toEqual({ from: other, name: "VN" });
    game.seatArcCrew(me, 1, "VN", [me, other]);
    expect(game.partyInviteView()).toBeNull();
    game.notePartyInvite(other, "VN");
    expect(game.partyInviteView()).toBeNull();
    expectBooks(game);
  });
});
