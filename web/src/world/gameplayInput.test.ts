import { describe, expect, it } from "vitest";
import { allowsGameplayKey, allowsStopKey, INTERACTIVE_TARGET } from "./gameplayInput";

describe("gameplay keyboard ownership", () => {
  it("reserves native disclosures and editable controls for UI interaction", () => {
    expect(INTERACTIVE_TARGET.split(", ")).toContain("summary");
    expect(INTERACTIVE_TARGET).toContain('[contenteditable]:not([contenteditable="false"])');
  });
  it("only accepts shortcuts during active play outside interactive UI", () => {
    expect(allowsGameplayKey("play", true, false, false)).toBe(true);
    for (const mode of ["overview", "watch"]) expect(allowsGameplayKey(mode, true, false, false)).toBe(false);
    expect(allowsGameplayKey("play", false, false, false)).toBe(false);
    expect(allowsGameplayKey("play", true, true, false)).toBe(false);
    expect(allowsGameplayKey("play", true, false, true)).toBe(false);
  });

  it("lets X stop while a button is focused, and blocks typing and overlays", () => {
    expect(allowsStopKey("play", true, false, false)).toBe(true);
    expect(allowsStopKey("play", true, true, false)).toBe(false);
    expect(allowsStopKey("play", true, false, true)).toBe(false);
    expect(allowsStopKey("watch", true, false, false)).toBe(false);
    expect(allowsStopKey("play", false, false, false)).toBe(false);
  });
});
