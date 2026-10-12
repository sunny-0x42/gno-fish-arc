import { describe, expect, it } from "vitest";
import { mintCall } from "../chain/realmCalls";
import { clearSession } from "../chain/session";
import type { Eip1193 } from "../chain/arc";
import { accountAddress, accountView, alreadyLinked, ensureOnyxSigner, established, ONYX_NETWORK, openOnyx, requestOnyx, shortAddress, type OnyxWallet } from "./adena";

const sample = "g1fnakf9vrd6uqn8qdmp88yam4p0ngy572answ9f";

describe("adena account", () => {
  it("shortens a g1 address and keeps a short one whole", () => {
    expect(shortAddress(sample)).toBe("g1fnak…sw9f");
    expect(shortAddress("g1short")).toBe("g1short");
  });

  it("reads only a successful g1 account", () => {
    expect(accountAddress({ status: "success", data: { address: sample, public_key: { value: "secret" } } })).toBe(sample);
    expect(accountAddress({ status: "failure", data: { address: sample } })).toBeNull();
    expect(accountAddress({ status: "success", data: { address: "cosmos1abc" } })).toBeNull();
    expect(accountAddress(null)).toBeNull();
  });

  it("pairs a g1 address with chain id and drops a bad account", () => {
    expect(accountView({ status: "success", data: { address: sample, chainId: "test3", public_key: { value: "secret" } } })).toEqual({
      address: sample,
      chainId: "test3",
      ugnot: null,
    });
    expect(accountView({ status: "success", data: { address: sample, coins: "7000000ugnot" } })).toEqual({
      address: sample,
      chainId: "",
      ugnot: 7_000_000,
    });
    expect(accountView({ status: "success", data: { address: sample, coins: "1000ugnot,5uatom" } })).toEqual({
      address: sample,
      chainId: "",
      ugnot: 1000,
    });
    expect(accountView({ status: "success", data: { address: sample } })).toEqual({ address: sample, chainId: "", ugnot: null });
    expect(accountView({ status: "success", data: { address: sample, chainId: "" } })).toEqual({ address: sample, chainId: "", ugnot: null });
    expect(accountView({ status: "success", data: { address: sample, chainId: 3 } })).toEqual({ address: sample, chainId: "", ugnot: null });
    expect(accountView({ status: "failure", data: { address: sample, chainId: "test3" } })).toBeNull();
    expect(accountView({ status: "success", data: { address: "cosmos1abc", chainId: "test3" } })).toBeNull();
    expect(accountView(null)).toBeNull();
  });

  it("asks Adena for onyx-1 and adds the network only when it is missing", async () => {
    const ready: string[] = [];
    const onOnyx: OnyxWallet = {
      SwitchNetwork: async (chainId) => {
        ready.push(typeof chainId === "string" ? chainId : chainId.chainId);
        return { status: "success", code: 0, type: "SWITCH_NETWORK_SUCCESS" };
      },
    };
    expect(await requestOnyx(onOnyx)).toBe("onyx");
    expect(ready).toEqual([ONYX_NETWORK.chainId]);

    const refused: string[] = [];
    const declined: OnyxWallet = {
      SwitchNetwork: async () => {
        refused.push("switch");
        return { status: "failure", type: "SWITCH_NETWORK_REJECTED" };
      },
      AddNetwork: async () => {
        refused.push("add");
        return { status: "success" };
      },
    };
    expect(await requestOnyx(declined)).toBe("declined");
    expect(refused).toEqual(["switch"]);

    const steps: string[] = [];
    const missing: OnyxWallet = {
      SwitchNetwork: async () => {
        steps.push("switch");
        if (steps.length === 1) return { status: "failure", type: "UNADDED_NETWORK", message: "The network has not been added on Adena." };
        return { status: "success", code: 0 };
      },
      AddNetwork: async (network) => {
        steps.push(network.chainId);
        return { status: "failure", type: "NETWORK_ALREADY_EXISTS", message: "The network already exists." };
      },
    };
    expect(await requestOnyx(missing)).toBe("onyx");
    expect(steps).toEqual(["switch", ONYX_NETWORK.chainId, "switch"]);
  });

  it("treats only status success as an established connection", () => {
    expect(established({ status: "success", code: 0 })).toBe(true);
    expect(established({ status: "failure" })).toBe(false);
    expect(established(undefined)).toBe(false);
  });

  const ARC = "0x8EaAe9f664214987204616Dd8145BAcad48044F6";

  function arcWallet(onSend: (method: string) => void): Eip1193 {
    return {
      request: async ({ method }) => {
        onSend(method);
        if (method === "eth_requestAccounts") return [ARC];
        if (method === "eth_chainId") return "0x4cef52";
        if (method === "eth_getBalance") return "0xde0b6b3a7640000";
        if (method === "wallet_switchEthereumChain") return null;
        if (method === "eth_sendTransaction") return "0xabc";
        throw new Error(method);
      },
    };
  }

  it("asks the wallet to connect on Arc and then sends mint", async () => {
    clearSession();
    const steps: string[] = [];
    const eth = arcWallet((method) => steps.push(method));
    const tx = await openOnyx(mintCall("Minnow", "small", "fang"), undefined, eth);
    expect(tx).toEqual({ ok: true, hash: "0xabc" });
    expect(steps).toContain("eth_requestAccounts");
    expect(steps).toContain("wallet_switchEthereumChain");
    expect(steps).toContain("eth_sendTransaction");
    clearSession();
  });

  it("reads the account when the site is already approved", async () => {
    clearSession();
    expect(alreadyLinked({ status: "failure", type: "ALREADY_CONNECTED", message: "The account is already connected to this website." })).toBe(true);
    expect(alreadyLinked({ status: "failure" })).toBe(false);
    const eth = arcWallet(() => undefined);
    expect(await ensureOnyxSigner(undefined, eth)).toEqual({ ok: true, signer: ARC });
    clearSession();
  });

  it("does not sign when the wallet refuses to connect", async () => {
    clearSession();
    const steps: string[] = [];
    const eth: Eip1193 = {
      request: async () => {
        steps.push("request");
        throw new Error("User rejected the request.");
      },
    };
    expect(await ensureOnyxSigner()).toEqual({ ok: false, detail: "Install an Ethereum wallet, then try again." });
    expect(await openOnyx(mintCall("Minnow", "small", "fang"), undefined, eth)).toEqual({
      ok: false,
      detail: "User rejected the request.",
    });
    expect(steps).toEqual(["request"]);
    clearSession();
  });
});
