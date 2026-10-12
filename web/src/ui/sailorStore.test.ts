import { describe, expect, it } from "vitest";
import { ShoalGame } from "../sim/game";
import { readSailor, writeSailor } from "./sailorStore";

describe("saved sailor card", () => {
  it("keeps a saved card and drops a broken one", () => {
    const raw = writeSailor({ username: "reef", country: "Vietnam", crest: "shell" });
    expect(readSailor(raw)).toEqual({ username: "reef", country: "Vietnam", crest: "shell" });
    expect(readSailor(null)).toBeNull();
    expect(readSailor("not json")).toBeNull();
    expect(readSailor(writeSailor({ username: "no", country: "Vietnam", crest: "wave" }))).toBeNull();
    expect(readSailor('{"username":"reef","country":"Atlantis","crest":"wave"}')).toBeNull();
  });

  it("replaces skipper when the browser still has the card", () => {
    const game = new ShoalGame(0);
    const saved = readSailor(writeSailor({ username: "reef", country: "Korea", crest: "moon" }));
    expect(saved).toBeTruthy();
    expect(game.adoptProfile(saved!.username, saved!.country, saved!.crest)).toBe(true);
    expect(game.profileById("player")?.username).toBe("reef");
    expect(game.displayName({ ownerId: "player", name: "Minnow" })).toBe("reef");
  });
});
