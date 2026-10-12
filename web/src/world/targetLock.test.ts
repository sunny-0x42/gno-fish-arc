import { afterEach, describe, expect, it } from "vitest";
import { clearTargetLock, lockTarget, readTargetLock } from "./targetLock";

describe("target lock", () => {
  afterEach(() => clearTargetLock());

  it("keeps the bitten fish and refreshes the hold", () => {
    lockTarget("pebble", 1_000, 4);
    lockTarget("pebble", 5_000, 4);
    expect(readTargetLock()).toEqual({ id: "pebble", until: 5_000, damage: 4 });
  });

  it("switches when a different fish is bitten", () => {
    lockTarget("pebble", 5_000, 4);
    lockTarget("brine", 6_000, 2);
    expect(readTargetLock()).toEqual({ id: "brine", until: 6_000, damage: 2 });
  });
});
