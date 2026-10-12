import { describe, expect, it } from "vitest";
import { incomingBlow } from "./hurt";

describe("incoming blow", () => {
  it("reads the newest strike and treats a repeat of the same sentence as a new blow", () => {
    const first = incomingBlow(
      [{ id: "log-2", at: 20, text: "Kelp struck Minnow for 20.", attackerId: "kelp", victimId: "minnow" }],
      "minnow",
      "Minnow",
    );
    const again = incomingBlow(
      [
        { id: "log-4", at: 40, text: "Kelp struck Minnow for 20.", attackerId: "kelp", victimId: "minnow" },
        { id: "log-3", at: 30, text: "Minnow struck Pebble for 14.", attackerId: "minnow", victimId: "pebble" },
        { id: "log-2", at: 20, text: "Kelp struck Minnow for 20.", attackerId: "kelp", victimId: "minnow" },
      ],
      "minnow",
      "Minnow",
    );
    expect(first).toEqual({ id: "log-2", at: 20, text: "Kelp hit you for 20." });
    expect(again?.id).toBe("log-4");
    expect(again?.text).toBe("Kelp hit you for 20.");
    expect(again?.id).not.toBe(first?.id);
  });

  it("reads a killing blow and ignores other fish", () => {
    expect(
      incomingBlow(
        [{ id: "log-9", at: 90, text: "Brine downed Minnow. Killer 1.00 USDC and 0 FISH.", attackerId: "brine", victimId: "minnow" }],
        "minnow",
        "Minnow",
      ),
    ).toEqual({ id: "log-9", at: 90, text: "Brine downed you." });
    expect(
      incomingBlow(
        [{ id: "log-1", at: 1, text: "Minnow struck Kelp for 14.", attackerId: "minnow", victimId: "kelp" }],
        "minnow",
        "Minnow",
      ),
    ).toBeNull();
    expect(
      incomingBlow(
        [{ id: "log-8", at: 8, text: "Minnow struck Minnow for 14.", attackerId: "me", victimId: "other" }],
        "me",
        "Minnow",
      ),
    ).toBeNull();
    expect(
      incomingBlow(
        [{ id: "log-7", at: 7, text: "Minnow struck Minnow for 14.", attackerId: "other", victimId: "me" }],
        "me",
        "Minnow",
      ),
    ).toEqual({ id: "log-7", at: 7, text: "Minnow hit you for 14." });
  });
});
