import { describe, expect, it } from "vitest";
import { boardRows, fightCreditLines, fightLedger, killerGnotLabel, killerPayout, killNotice, seaPools } from "./board";

const fish = (
  id: string,
  name: string,
  poolUgnot: number,
  extra: { burned?: boolean; alive?: boolean; matchId?: string | null } = {},
) => ({
  id,
  name,
  poolUgnot,
  burned: extra.burned ?? false,
  alive: extra.alive ?? true,
  matchId: extra.matchId === undefined ? "sea" : extra.matchId,
});

describe("practice board", () => {
  it("ranks kills, then fewer downs, then the locked pool", () => {
    const rows = boardRows(
      [fish("a", "Pip", 5), fish("b", "Pebble", 80), fish("c", "Silt", 1), fish("d", "Gone", 9, { burned: true })],
      { a: { kills: 2, downs: 1 }, b: { kills: 2, downs: 0 }, c: { kills: 0, downs: 3 } },
      "a",
    );
    expect(rows.map((row) => row.name)).toEqual(["Pebble", "Pip", "Silt"]);
    expect(rows.every((row) => row.assists === 0)).toBe(true);
    expect(rows[1].yours).toBe(true);
  });

  it("reads the killer USDC label and ignores a plain bite line", () => {
    expect(killerGnotLabel("Pip downed Pebble. Killer 4.00 USDC.")).toBe("4.00");
    expect(killerGnotLabel("Pip downed Pebble. Killer 4.00 USDC and 8 FISH.")).toBe("4.00");
    expect(killerGnotLabel("Pip downed Pebble. Killer 1,500.00 USDC.")).toBe("1,500.00");
    expect(killerGnotLabel("Pip struck Pebble for 12.")).toBeNull();
  });

  it("reads who downed whom from the same killer sentence", () => {
    expect(killNotice("Pip downed Pebble. Killer 4.00 USDC.")).toEqual({
      attacker: "Pip",
      victim: "Pebble",
      amount: "4.00",
      fish: null,
      lost: null,
    });
    expect(killNotice("Brine downed Minnow. Killer 1,500.00 USDC.")).toEqual({
      attacker: "Brine",
      victim: "Minnow",
      amount: "1,500.00",
      fish: null,
      lost: null,
    });
    expect(killNotice("Pip struck Pebble for 12.")).toBeNull();
    expect(killNotice("Brine downed Minnow. Killer 1.00 USDC and 0 FISH.")).toEqual({
      attacker: "Brine",
      victim: "Minnow",
      amount: "1.00",
      fish: "0",
      lost: null,
    });
    expect(killNotice("Pip downed Pebble. Killer 8.00 USDC and 10 FISH. Lost 10.00 USDC. Party bonus 1 FISH across 2.")).toEqual({
      attacker: "Pip",
      victim: "Pebble",
      amount: "8.00",
      fish: "10",
      lost: "10.00",
    });
  });

  it("keeps the payout when a newer strike line is first", () => {
    const log = [
      { id: "strike", at: 30, text: "Pip struck Kelp for 12.", attackerId: "pip" },
      { id: "kill", at: 20, text: "Pip downed Pebble. Killer 4.00 USDC.", attackerId: "pip" },
      { id: "other", at: 40, text: "Kelp downed Silt. Killer 8.00 USDC.", attackerId: "kelp" },
    ];
    expect(killerPayout(log, "pip", 0)).toEqual({ id: "kill", gnot: "4.00", fish: "0" });
    expect(killerPayout(log, "pip", 21)).toBeNull();
    expect(killerPayout(log, "", 0)).toBeNull();
  });

  it("adds a kill reward and the stake lost on the same fish", () => {
    const log = [
      { at: 30, text: "Kelp downed Pip. Killer 4.00 USDC and 5 FISH. Lost 10.00 USDC.", attackerId: "kelp", victimId: "pip" },
      { at: 20, text: "Pip downed Pebble. Killer 8.00 USDC and 10 FISH. Lost 16.00 USDC.", attackerId: "pip", victimId: "pebble" },
      { at: 10, text: "Pip downed Silt. Killer 1,500.00 USDC and 1,000 FISH. Lost 2,000.00 USDC.", attackerId: "pip", victimId: "silt" },
    ];
    const ledger = fightLedger(log, "pip", 15);
    expect(ledger).toEqual({ wonGnot: 8_000_000, wonFish: 10, lostGnot: 10_000_000 });
    expect(fightCreditLines(ledger)).toEqual({
      won: "+8.00 USDC · +10 FISH",
      lost: "-10.00 USDC · 0 FISH",
    });
    expect(fightCreditLines(fightLedger(log, "pip", 0)).won).toBe("+1,508.00 USDC · +1,010 FISH");
  });

  it("sums only stakes still locked in the sea", () => {
    const pools = seaPools(
      [
        fish("a", "Pip", 5_000_000),
        fish("b", "Pebble", 8_000_000),
        fish("c", "Ash", 3_000_000, { matchId: null }),
        fish("d", "Gone", 9_000_000, { burned: true }),
        fish("e", "Still", 0),
      ],
      "a",
    );
    expect(pools.total).toBe(13_000_000);
    expect(pools.chips.map((chip) => chip.name)).toEqual(["Pebble", "Pip"]);
    expect(pools.chips[1].yours).toBe(true);
  });
});
