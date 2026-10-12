import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { CHAIN_FISH_ALLOCATION, CHAIN_FISH_SUPPLY } from "../sim/tokenomics";
import { WATCH_ADDRESS } from "../chain/watchDesk";
import { realmWires, systemMap } from "./flowSheet";
import { DeskBoard } from "./Desk";

describe("system map", () => {
  it("keeps the supply, the mint split, and the kill example on the spec", () => {
    const whole = CHAIN_FISH_ALLOCATION.reduce((sum, row) => sum + row.whole, 0);
    const bps = CHAIN_FISH_ALLOCATION.reduce((sum, row) => sum + row.bps, 0);
    expect(whole).toBe(CHAIN_FISH_SUPPLY);
    expect(bps).toBe(10_000);
    const map = systemMap();
    expect(map.mint.map((slice) => slice.amount)).toEqual(["90.00 USDC", "30.00 USDC", "15.00 USDC", "15.00 USDC"]);
    expect(map.lay.map((slice) => slice.amount)).toEqual(["1.20 USDC", "0.40 USDC", "0.20 USDC", "0.20 USDC"]);
    expect(map.kill.map((slice) => slice.amount)).toEqual(["8.00 USDC", "1.00 USDC", "0.30 USDC", "0.30 USDC", "0.40 USDC"]);
    expect(map.buybackFish).toBe("15");
    expect(map.winFish).toBe("10");
    expect(map.partyBonus).toBe("10%");
    expect(map.partyBonusFull).toBe(8);
    expect(map.upgrades.map((step) => step.fee)).toEqual([150, 400, 1000, 2500, 6000]);
    expect(map.rivals.map((row) => row.stake)).toEqual([16, 24, 36, 50, 80, 200, 300, 800, 20, 28, 36, 48, 70, 120]);
    expect(realmWires.filter((wire) => wire.lane === "live").map((wire) => wire.to)).toEqual(["FishDuel", "FishParty", "FishProfile", "FishDuel", "Practice books", "FishEarn"]);
    expect(realmWires.find((wire) => wire.from === "fish" && wire.to === "party")?.call).toContain("SameParty");
    expect(realmWires.filter((wire) => wire.kind === "none").map((wire) => wire.from)).toEqual(["profile", "Market"]);
    const text = JSON.stringify(map).toLowerCase();
    expect(text).not.toMatch(/apy|yield/);
  });

  it("renders the desk as a view-only page for one address", () => {
    const html = renderToStaticMarkup(createElement(DeskBoard, {
      view: { kind: "idle" },
      onConnect: () => undefined,
      onRead: () => undefined,
    }));
    expect(html).toContain("Shoal desk");
    expect(html).toContain("big fish eat little fish");
    expect(html).toContain("Stake USDC, swim with other wallets");
    expect(html).toContain(WATCH_ADDRESS);
    expect(html).toContain("View only");
    expect(html).toContain("sends no chain call");
    expect(html).toContain("Connect to view");
    expect(html).toContain("2,000.00 USDC");
    expect(html).toContain("The sea opens when 1 USDC is staked into the pool");
    expect(html).not.toContain("Swim locks at least 10 USDC");
    expect(html).not.toContain("Practice swim locks no USDC");
    expect(html).toContain("80 / 10 / 3 / 3 / 4");
    expect(html).toContain("150 USDC");
    expect(html).toContain("FishNFT mint is 5 USDC");
    expect(html).toContain("Early community");
    expect(html).toContain("Public sale");
    expect(html).toContain("Public sale is 5% of the supply, 5,000,000 FISH.");
    expect(html).toContain("Team is 5% of the supply, 5,000,000 FISH.");
    expect(html).toContain("How the contracts talk");
    expect(html).toContain(">Client<");
    expect(html).toContain(">Packages<");
    expect(html).toContain(">Money<");
    expect(html).toContain(">Supply<");
    expect(html).toContain("data-realm=\"FishDuel\"");
    expect(html).toContain("data-realm=\"community\"");
    expect(html).toContain("SameParty, PartyOf, MemberAt");
    expect(html).toContain("Party never holds it");
    expect(html).toContain("No call into fish");
    expect(html).toContain("FishEarn pays 1 FISH");
    expect(html).toContain("Live duel fish stay on FishDuel");
    expect(html).toContain("does not send Settle");
    expect(html).toContain("three sealed samples");
    expect(html).toContain("Bites stay in this browser");
    expect(html).toContain("A party adds up to 10% more FISH at 8 members");
    expect(html).toContain("the party holds none of it");
    expect(html).not.toMatch(/<button[^>]*>\s*Mint/);
    expect(html).not.toMatch(/apy|yield/i);
  });

  it("refuses a different Adena account", () => {
    const html = renderToStaticMarkup(createElement(DeskBoard, {
      view: { kind: "denied", address: "g1otherwallet000000000000000000000000000" },
      onConnect: () => undefined,
      onRead: () => undefined,
    }));
    expect(html).toContain("does not open that account");
    expect(html).toContain(WATCH_ADDRESS);
    expect(html).not.toContain("Fish held by this wallet");
  });
});
