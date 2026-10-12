import { describe, expect, it } from "vitest";
import { ShoalGame } from "../sim/game";
import { PROFILE_PKG } from "./realmCalls";
import { applyChainSailor, chainCardFrom, rememberSeaSailors } from "./sailorCard";

const DEV = "g1n4pl5uc4yt5r96m9w6fmdznx3x0jyg8l6arhmt";

describe("chain sailor card", () => {
  it("reads a card and ignores an empty username", () => {
    expect(chainCardFrom(
      { data: '("reef" string)', log: "" },
      { data: '("Vietnam" string)', log: "" },
      { data: '("shell" string)', log: "" },
    )).toEqual({ username: "reef", country: "Vietnam", crest: "shell" });
    expect(chainCardFrom({ data: '("" string)', log: "" }, { data: "", log: "" }, { data: "", log: "" })).toBeNull();
    expect(chainCardFrom({ data: "", log: "panic: profile" }, { data: "", log: "" }, { data: "", log: "" })).toBeNull();
  });

  it("copies the chain username over skipper and remembers another sailor", async () => {
    const game = new ShoalGame(0);
    const evalFn = async (expr: string) => {
      if (expr === `${PROFILE_PKG}.UsernameOf("${DEV}")`) return { data: '("reef" string)', log: "" };
      if (expr === `${PROFILE_PKG}.CountryOf("${DEV}")`) return { data: '("Korea" string)', log: "" };
      if (expr === `${PROFILE_PKG}.CrestOf("${DEV}")`) return { data: '("moon" string)', log: "" };
      if (expr === `${PROFILE_PKG}.UsernameOf("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5")`) return { data: '("brine" string)', log: "" };
      return { data: "", log: "panic: missing" };
    };
    expect(await applyChainSailor(game, DEV, evalFn)).toBe(true);
    expect(game.profileById("player")?.username).toBe("reef");
    expect(game.profileById("player")?.country).toBe("Korea");
    expect(await rememberSeaSailors(game, ["g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5", DEV], evalFn)).toBe(1);
    expect(game.displayName({ ownerId: "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5", name: "Minnow" })).toBe("brine");
    expect(game.displayName({ ownerId: "player", name: "Minnow" })).toBe("reef");
  });
});
