import { describe, expect, it } from "vitest";
import { MINT_FEE_UGNOT } from "../sim/tokenomics";
import { leaveCall, mintCall, registerCall, setProfileCall } from "./realmCalls";
import {
  fishNameOk,
  freshTokenId,
  onyxMessage,
  partyNameOk,
  sendOnyx,
  tokenIds,
  type OnyxPayload,
} from "./adenaTx";

const DEV = "g1n4pl5uc4yt5r96m9w6fmdznx3x0jyg8l6arhmt";

describe("onyx adena payload", () => {
  it("sends ugnot as a string and leaves a zero send empty", () => {
    const mint = onyxMessage(mintCall("Minnow", "medium", "fang"), DEV);
    expect(mint.gasWanted).toBe(20_000_000);
    expect(mint.gasFee).toBe(40_000);
    expect(mint.memo).toBe("");
    expect(mint.messages[0]).toEqual({
      type: "/vm.m_call",
      value: {
        caller: DEV,
        send: `${MINT_FEE_UGNOT}ugnot`,
        pkg_path: "gno.land/r/g1n4pl5uc4yt5r96m9w6fmdznx3x0jyg8l6arhmt/shoal/fish",
        func: "Mint",
        args: ["Minnow", "medium", "fang"],
      },
    });
    expect("tx" in mint).toBe(false);
    expect(onyxMessage(leaveCall("4"), DEV).messages[0].value.send).toBe("");
    expect(onyxMessage(setProfileCall("skip", "Vietnam", "wave"), DEV).messages[0].value.send).toBe("");
    const swim = onyxMessage(registerCall("4", "5000000"), DEV);
    expect(swim.messages[0].value.send).toBe("5000000ugnot");
    expect(swim.messages[0].value.args).toEqual(["4", "5000000"]);
  });

  it("parses TokensOf and keeps the new id", () => {
    expect(tokenIds(`("1,2" string)`)).toEqual([1, 2]);
    expect(tokenIds(`("" string)`)).toEqual([]);
    expect(tokenIds("")).toEqual([]);
    expect(tokenIds("1,4")).toEqual([1, 4]);
    expect(freshTokenId(`("1,2" string)`, [1])).toBe(2);
    expect(freshTokenId(`("1" string)`, [1])).toBeNull();
  });

  it("refuses a practice id before Adena sees it", async () => {
    let calls = 0;
    const wallet = {
      DoContract: async (_payload: OnyxPayload) => {
        calls += 1;
        return { status: "success", data: { hash: "abc" } };
      },
    };
    const blocked = await sendOnyx(registerCall("pebble", "5000000"), DEV, wallet);
    expect(blocked.ok).toBe(false);
    expect(calls).toBe(0);
    const off = await sendOnyx(mintCall("Minnow", "small", "swift"), "practice", wallet);
    expect(off.ok).toBe(false);
    expect(calls).toBe(0);
  });

  it("returns the hash Adena reports", async () => {
    const seen: string[] = [];
    const ok = await sendOnyx(mintCall("Minnow", "small", "swift"), DEV, {
      DoContract: async (payload) => {
        seen.push(payload.messages[0].value.send);
        return { status: "success", data: { hash: "abc" } };
      },
    });
    expect(ok).toEqual({ ok: true, hash: "abc" });
    expect(seen).toEqual([`${MINT_FEE_UGNOT}ugnot`]);
    const declined = await sendOnyx(leaveCall("4"), DEV, {
      DoContract: async () => ({ status: "failure", message: "fish: match" }),
    });
    expect(declined).toEqual({ ok: false, detail: "fish: match" });
  });

  it("matches the realm name rules", () => {
    expect(fishNameOk("Minnow 2")).toBe(true);
    expect(fishNameOk("")).toBe(false);
    expect(fishNameOk("a".repeat(21))).toBe(false);
    expect(partyNameOk("Tide Pool")).toBe(true);
    expect(partyNameOk("Tide!")).toBe(false);
  });
});
