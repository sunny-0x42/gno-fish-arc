import { describe, expect, it } from "vitest";
import seaPanels from "../ui/Panels.tsx?raw";
import { MINT_FEE_UGNOT } from "../sim/tokenomics";
import { bayBiteCall, bayLeaveCall, bayMintCall, bayRegisterCall, biteCall, chainArmed, duelLeaveCall, duelMintCall, duelRegisterCall, duelSettleCall, FISH_BAY_PKG, FISH_DUEL_PKG, FISH_DUEL_REALM, FISH_LAB_PKG, FISH_MARK_PKG, FISH_PKG, FISH_TRY_PKG, mintCall, payCoveredCall, registerCall, sendRealm, setProfileCall, turnCall } from "./realmCalls";

describe("realm calls", () => {
  it("builds a mint and a turn without a wallet", () => {
    expect(mintCall("Minnow", "small", "swift")).toEqual({
      pkg: "gno.land/r/g1n4pl5uc4yt5r96m9w6fmdznx3x0jyg8l6arhmt/shoal/fish",
      func: "Mint",
      args: ["Minnow", "small", "swift"],
      sendUgnot: String(MINT_FEE_UGNOT),
    });
    expect(turnCall("4", 0, -1).args).toEqual(["4", "0", "-1"]);
    expect(setProfileCall("skip", "Vietnam", "wave")).toEqual({
      pkg: "gno.land/r/g1n4pl5uc4yt5r96m9w6fmdznx3x0jyg8l6arhmt/shoal/profile",
      func: "SetProfile",
      args: ["skip", "Vietnam", "wave"],
      sendUgnot: "0",
    });
    expect(chainArmed("1", "12")).toBe(true);
    expect(chainArmed("1", "onyx-1")).toBe(true);
    expect(chainArmed("1", "gnoland-1")).toBe(false);
    expect(chainArmed("1", "pebble")).toBe(false);
    expect(chainArmed(undefined, "12")).toBe(false);
    expect(mintCall("Minnow", "small", "swift").pkg).toBe(FISH_PKG);
    expect(biteCall("1", "2").pkg).toBe(FISH_PKG);
    expect(payCoveredCall("16000000")).toEqual({
      pkg: FISH_LAB_PKG,
      func: "PayCovered",
      args: ["16000000"],
      sendUgnot: "0",
    });
    expect(FISH_PKG).not.toBe(FISH_LAB_PKG);
    expect(FISH_TRY_PKG.endsWith("/fishtry")).toBe(true);
    expect(payCoveredCall("16000000").pkg).not.toBe(FISH_TRY_PKG);
    expect(bayMintCall("pebble")).toEqual({
      pkg: FISH_BAY_PKG,
      func: "Mint",
      args: ["pebble"],
      sendUgnot: "1000000",
    });
    expect(bayRegisterCall("1", "1000000")).toEqual({
      pkg: FISH_BAY_PKG,
      func: "Register",
      args: ["1", "1000000"],
      sendUgnot: "1000000",
    });
    expect(bayLeaveCall("2")).toEqual({ pkg: FISH_BAY_PKG, func: "Leave", args: ["2"], sendUgnot: "0" });
    expect(bayBiteCall("1", "2")).toEqual({ pkg: FISH_BAY_PKG, func: "Bite", args: ["1", "2"], sendUgnot: "0" });
    expect(bayBiteCall("1", "2").pkg).not.toBe(biteCall("1", "2").pkg);
    expect(bayMintCall("pebble").pkg).not.toBe(mintCall("Minnow", "small", "swift").pkg);
    expect(FISH_BAY_PKG.endsWith("/fishbay")).toBe(true);
    expect(FISH_MARK_PKG.endsWith("/fishmark")).toBe(true);
    expect(FISH_BAY_PKG).not.toBe(FISH_PKG);
    expect(duelMintCall("pebble")).toEqual({
      pkg: FISH_DUEL_PKG,
      func: "Mint",
      args: ["pebble"],
      sendUgnot: "1000000",
    });
    expect(duelRegisterCall("2", "1000000", "ab")).toEqual({
      pkg: FISH_DUEL_PKG,
      func: "Register",
      args: ["2", "1000000", "ab"],
      sendUgnot: "1000000",
    });
    expect(duelLeaveCall("2")).toEqual({ pkg: FISH_DUEL_PKG, func: "Leave", args: ["2"], sendUgnot: "0" });
    expect(duelSettleCall("2", "1", "pack")).toEqual({
      pkg: FISH_DUEL_PKG,
      func: "Settle",
      args: ["2", "1", "pack"],
      sendUgnot: "0",
    });
    expect(duelSettleCall("2", "1", "pack").pkg).not.toBe(FISH_PKG);
    expect(duelMintCall("pebble").pkg).not.toBe(mintCall("Minnow", "small", "swift").pkg);
    expect(FISH_DUEL_PKG.endsWith("/fishduel")).toBe(true);
    expect(FISH_DUEL_REALM).toBe("g1f6s7za87h3kwr3z6xmk287q2fc8cv38arf3gwu");
    expect(seaPanels).toContain("collectionMintCall");
    expect(seaPanels).not.toContain("mintCall(");
    expect(seaPanels).not.toContain("duelSettleCall");
    expect(seaPanels).not.toContain("FISH_DUEL_PKG");
  });

  it("keeps a practice id in the browser", async () => {
    let sent = 0;
    const result = await sendRealm(biteCall("pebble", "silt"), {
      flag: "1",
      chainId: "12",
      caller: "g1abc",
      send: async () => {
        sent += 1;
      },
    });
    expect(result).toBe("local");
    expect(sent).toBe(0);
  });

  it("sends a numeric token only when the chain flag is on", async () => {
    const seen: string[] = [];
    const off = await sendRealm(registerCall("3", "5000000"), {
      flag: undefined,
      chainId: "3",
      caller: "g1abc",
      send: async (msg) => {
        seen.push(msg.value.func);
      },
    });
    const on = await sendRealm(registerCall("3", "5000000"), {
      flag: "1",
      chainId: "3",
      caller: "g1abc",
      send: async (msg) => {
        seen.push(msg.value.func);
        expect(msg.type).toBe("/vm.m_call");
        expect(msg.value.pkg_path).toBe("gno.land/r/g1n4pl5uc4yt5r96m9w6fmdznx3x0jyg8l6arhmt/shoal/fish");
        expect(msg.value.args).toEqual(["3", "5000000"]);
        expect(msg.value.send).toEqual([{ denom: "ugnot", amount: "5000000" }]);
      },
    });
    expect(off).toBe("local");
    expect(on).toBe("sent");
    expect(seen).toEqual(["Register"]);
  });
});
