import { afterEach, describe, expect, it } from "vitest";
import { chainAddress, clearSession, endChain, onyxSigner, readSession, ugnotOfCoins, withChain, writeSession } from "./session";

const DEV = "g1n4pl5uc4yt5r96m9w6fmdznx3x0jyg8l6arhmt";
const ARC = "0x8EaAe9f664214987204616Dd8145BAcad48044F6";

afterEach(() => {
  endChain();
  clearSession();
});

describe("onyx session", () => {
  it("signs only an Arc address on chain 5042002", () => {
    expect(onyxSigner({ address: ARC, chainId: "5042002" })).toBe(ARC);
    expect(onyxSigner({ address: DEV, chainId: "onyx-1" })).toBeNull();
    expect(onyxSigner({ address: ARC, chainId: "1" })).toBeNull();
    expect(onyxSigner({ address: "not-a-key", chainId: "5042002" })).toBeNull();
    expect(onyxSigner({ address: "", chainId: "5042002" })).toBeNull();
  });

  it("keeps a short practice address off an Onyx invite", () => {
    expect(chainAddress(DEV)).toBe(true);
    expect(chainAddress("g1shoal1skip")).toBe(false);
    expect(chainAddress("pebble")).toBe(false);
  });

  it("reads the session written by the connect button", () => {
    writeSession({ address: ARC, chainId: "5042002", ugnot: 9_000_000 });
    expect(onyxSigner()).toBe(ARC);
    expect(readSession().ugnot).toBe(9_000_000);
    writeSession({ address: ARC, chainId: "pearl" });
    expect(onyxSigner()).toBeNull();
    expect(readSession().ugnot).toBe(9_000_000);
    expect(ugnotOfCoins("12ugnot")).toBe(12);
    expect(ugnotOfCoins("nope")).toBeNull();
  });

  it("lets one call through and tells the next click to wait", async () => {
    const first = withChain(async () => "sent");
    const second = await withChain(async () => "again");
    expect(second).toBe("busy");
    expect(await first).toBe("sent");
  });
});
