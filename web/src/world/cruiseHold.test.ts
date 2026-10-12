import { describe, expect, it } from "vitest";
import { cruiseHold, setCruiseHalted, toggleCruise } from "./cruiseHold";

describe("cruise hold", () => {
  it("stops and swims again", () => {
    setCruiseHalted(false);
    expect(toggleCruise()).toBe(true);
    expect(cruiseHold.halted).toBe(true);
    expect(toggleCruise()).toBe(false);
    expect(cruiseHold.halted).toBe(false);
    setCruiseHalted(false);
  });
});
