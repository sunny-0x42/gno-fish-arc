import { describe, expect, it } from "vitest";
import {
  abiEncodeString,
  addressCall,
  ARC_EARN,
  ARC_NFT,
  awardCalldata,
  arcFishName,
  chainIdOf,
  ARC_COLLECTION_MINT,
  collectionMintCalldata,
  collectionNameOk,
  decodeAddress,
  decodeBool,
  decodeString,
  decodeUint,
  decodeUintArray,
  ARC_SEL,
  arcTxOk,
  freeDuelSeat,
  seatedDuelId,
  uintCall,
  ensureArcChain,
  leaveCalldata,
  mintCalldata,
  registerCalldata,
  sendArc,
  microToWei,
  poolStakeMicro,
  weiToMicro,
  type Eip1193,
} from "./arc";

const MARK = "0x8EaAe9f664214987204616Dd8145BAcad48044F6";
const MINT_MINNOW = "0xd85d3d27000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000066d696e6e6f770000000000000000000000000000000000000000000000000000";
const REGISTER = "0xf1c6480d00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000008eaae9f664214987204616dd8145bacad48044f6";
const LEAVE = "0x67dfd4c90000000000000000000000000000000000000000000000000000000000000004";

function word(value: bigint): string {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

describe("free duel seat", () => {
  const owner = MARK;

  function seatCall(minted: bigint, rows: Record<number, { owner: string; sea: boolean; ended: boolean; marked: boolean }>) {
    return async (data: string) => {
      if (data === ARC_SEL.minted) return word(minted);
      const id = Number(BigInt(`0x${data.slice(10)}`));
      const row = rows[id];
      if (!row) throw new Error(data);
      const sel = data.slice(0, 10);
      if (sel === ARC_SEL.ownerOf) return word(BigInt(row.owner));
      if (sel === ARC_SEL.inSea) return word(row.sea ? 1n : 0n);
      if (sel === ARC_SEL.ended) return word(row.ended ? 1n : 0n);
      if (sel === ARC_SEL.markOf) return word(row.marked ? BigInt(owner) : 0n);
      throw new Error(data);
    };
  }

  it("returns an owned seat that is still unmarked", async () => {
    const call = seatCall(2n, {
      1: { owner, sea: false, ended: false, marked: true },
      2: { owner, sea: false, ended: false, marked: false },
    });
    expect(await freeDuelSeat(owner, call)).toBe(2);
    expect(uintCall(ARC_SEL.markOf, 2n).startsWith(ARC_SEL.markOf)).toBe(true);
  });

  it("skips a seat that is already in the sea or ended", async () => {
    const call = seatCall(2n, {
      1: { owner, sea: false, ended: false, marked: false },
      2: { owner, sea: true, ended: false, marked: false },
    });
    expect(await freeDuelSeat(owner, call)).toBe(1);
    const ended = seatCall(1n, {
      1: { owner, sea: false, ended: true, marked: false },
    });
    expect(await freeDuelSeat(owner, ended)).toBeNull();
  });

  it("picks the seat that is actually in the sea", async () => {
    const spent = seatCall(2n, {
      1: { owner, sea: false, ended: false, marked: true },
      2: { owner, sea: true, ended: false, marked: true },
    });
    expect(await seatedDuelId(owner, spent)).toBe(2);
    const older = seatCall(2n, {
      1: { owner, sea: true, ended: false, marked: true },
      2: { owner, sea: false, ended: false, marked: false },
    });
    expect(await seatedDuelId(owner, older)).toBe(1);
    const clear = seatCall(2n, {
      1: { owner, sea: false, ended: false, marked: true },
      2: { owner, sea: false, ended: false, marked: true },
    });
    expect(await seatedDuelId(owner, clear)).toBeNull();
    expect(await seatedDuelId("not-a-wallet", clear)).toBeNull();
    const unread = async () => "0x";
    await expect(seatedDuelId(owner, unread)).rejects.toThrow("Arc seat unread");
  });

  it("returns null when FishDuel has not minted", async () => {
    const call = async (data: string) => {
      if (data === ARC_SEL.minted) return word(0n);
      throw new Error(data);
    };
    expect(await freeDuelSeat(owner, call)).toBeNull();
    expect(await freeDuelSeat("not-a-wallet", call)).toBeNull();
    expect(await arcTxOk("nope")).toBe(false);
  });
});

describe("pool stake amount", () => {
  it("accepts at least 1 USDC and sends that value with register", async () => {
    expect(poolStakeMicro("1")).toBe(1_000_000);
    expect(poolStakeMicro("2.50")).toBe(2_500_000);
    expect(poolStakeMicro("0.50")).toBeNull();
    expect(poolStakeMicro("01")).toBeNull();
    expect(microToWei(2_500_000)).toBe(25n * 10n ** 17n);
    const seen: { method: string; params?: unknown }[] = [];
    const eth: Eip1193 = {
      request: async (args) => {
        seen.push(args);
        if (args.method === "eth_sendTransaction") return "0xabc";
        throw new Error(args.method);
      },
    };
    expect(await sendArc(eth, MARK, { func: "Register", args: ["1", "2500000"] })).toEqual({ ok: true, hash: "0xabc" });
    const tx = (seen[0].params as [{ data: string; value: string }])[0];
    expect(tx.value).toBe(`0x${(25n * 10n ** 17n).toString(16)}`);
    expect(tx.data).toBe(registerCalldata(1n, 25n * 10n ** 17n, MARK));
    expect(await sendArc(eth, MARK, { func: "Register", args: ["1", "1"] })).toEqual({
      ok: false,
      detail: "The pool stake is at least 1 USDC.",
    });
  });
});

describe("arc calldata", () => {
  it("matches FishDuel mint, register, and leave encoding", () => {
    expect(arcFishName("Minnow")).toBe("minnow");
    expect(arcFishName("Common Minnow!!")).toBe("commonminnow");
    expect(arcFishName("!!!")).toBeNull();
    expect(mintCalldata("minnow")).toBe(MINT_MINNOW);
    expect(registerCalldata(1n, 10n ** 18n, MARK)).toBe(REGISTER);
    expect(leaveCalldata(4n)).toBe(LEAVE);
    expect(decodeString(abiEncodeString("minnow"))).toBe("minnow");
    expect(decodeAddress(REGISTER)).toBe(MARK.toLowerCase());
    expect(decodeUint(`0x${(10n ** 18n).toString(16).padStart(64, "0")}`)).toBe(10n ** 18n);
    expect(decodeBool(`0x${"0".repeat(63)}1`)).toBe(true);
    expect(decodeBool(`0x${"0".repeat(64)}`)).toBe(false);
    expect(weiToMicro(10n ** 18n)).toBe(1_000_000);
    expect(chainIdOf("0x4cef52")).toBe("5042002");
    expect(collectionNameOk("Blue Fin")).toBe(true);
    expect(collectionNameOk("nope!")).toBe(false);
    const collection = collectionMintCalldata("Blue Fin");
    expect(collection.startsWith("0xd85d3d27")).toBe(true);
    expect(decodeString(`0x${collection.slice(10)}`)).toBe("Blue Fin");
    expect(decodeUintArray(`0x${"0".repeat(62)}20${"0".repeat(63)}1${"0".repeat(63)}1`)).toEqual([1n]);
    expect(addressCall("0x5a3f2672", MARK).endsWith(MARK.slice(2).toLowerCase())).toBe(true);
  });

  it("sends 1 USDC for mint and refuses every other call", async () => {
    const seen: { method: string; params?: unknown }[] = [];
    const eth: Eip1193 = {
      request: async (args) => {
        seen.push(args);
        if (args.method === "eth_sendTransaction") return "0xabc";
        throw new Error(args.method);
      },
    };
    expect(await sendArc(eth, MARK, { func: "Mint", args: ["Minnow"] })).toEqual({ ok: true, hash: "0xabc" });
    const tx = (seen[0].params as [{ data: string; value: string; to: string }])[0];
    expect(tx.data).toBe(MINT_MINNOW);
    expect(tx.value).toBe("0xde0b6b3a7640000");
    expect(tx.to).toBe("0x2Cbb115ccb69c8bae2FB2FCdAa68B80dBa0d0670");
    const skipped = await sendArc(eth, MARK, { func: "Bite", args: ["1", "2"] });
    expect(skipped).toEqual({ ok: false, detail: "This page sends mint, register, leave, profile, party, and award. Other calls stay in the browser." });
    expect(seen).toHaveLength(1);
    seen.length = 0;
    expect(await sendArc(eth, MARK, { func: "MintCollection", args: ["Blue Fin"] })).toEqual({ ok: true, hash: "0xabc" });
    const minted = (seen[0].params as [{ data: string; value: string; to: string }])[0];
    expect(minted.to).toBe(ARC_NFT);
    expect(minted.value).toBe(`0x${ARC_COLLECTION_MINT.toString(16)}`);
    expect(ARC_COLLECTION_MINT).toBe(5n * 10n ** 18n);
    expect(minted.data.startsWith("0xd85d3d27")).toBe(true);
    expect(decodeString(`0x${minted.data.slice(10)}`)).toBe("Blue Fin");
    seen.length = 0;
    expect(await sendArc(eth, MARK, { func: "Award", args: ["1", "2"] })).toEqual({ ok: true, hash: "0xabc" });
    const award = (seen[0].params as [{ data: string; value: string; to: string }])[0];
    expect(award.to).toBe(ARC_EARN);
    expect(award.value).toBe("0x0");
    expect(award.data).toBe(awardCalldata(1n, 2n));
    expect(award.data.startsWith("0xce9bafe2")).toBe(true);
    expect(await sendArc(eth, MARK, { func: "Award", args: ["1", "1"] })).toEqual({
      ok: false,
      detail: "Both seated fish need chain ids.",
    });
  });

  it("sends profile and party with no USDC", async () => {
    const seen: { to?: string; data?: string; value?: string }[] = [];
    const eth: Eip1193 = {
      request: async (args) => {
        const tx = (args.params as [{ to: string; data: string; value: string }])[0];
        seen.push(tx);
        return "0xabc";
      },
    };
    expect(await sendArc(eth, MARK, { func: "SetProfile", args: ["skipper", "Vietnam", "wave"] })).toEqual({ ok: true, hash: "0xabc" });
    expect(seen[0]).toEqual({
      from: MARK,
      to: "0x6130bC38A58bd658c04152673d50C0339C86D6C3",
      data: "0x52640314000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000000000000000000000000000000000000000007736b6970706572000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000007566965746e616d0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000047761766500000000000000000000000000000000000000000000000000000000",
      value: "0x0",
    });
    expect(await sendArc(eth, MARK, { func: "Create", args: ["Tide Pool"] })).toEqual({ ok: true, hash: "0xabc" });
    expect(seen[1].to).toBe("0x285F5345AD2f1421F53f29Fa1F3Cd77fef4e63Be");
    expect(seen[1].data).toBe("0xb6a46b3b000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000095469646520506f6f6c0000000000000000000000000000000000000000000000");
    expect(seen[1].value).toBe("0x0");
    expect(await sendArc(eth, MARK, { func: "Invite", args: ["g1n4pl5uc4yt5r96m9w6fmdznx3x0jyg8l6arhmt"] })).toEqual({
      ok: false,
      detail: "An Arc invite needs a 0x address.",
    });
    expect(await sendArc(eth, MARK, { func: "Invite", args: ["0xA7832aDE808De32006120237c5eE8d326612fac8"] })).toEqual({ ok: true, hash: "0xabc" });
    expect(seen[2].data).toBe("0x4b77c468000000000000000000000000a7832ade808de32006120237c5ee8d326612fac8");
    expect(await sendArc(eth, MARK, { func: "Accept", args: [] })).toEqual({ ok: true, hash: "0xabc" });
    expect(seen[3]).toMatchObject({ to: "0x285F5345AD2f1421F53f29Fa1F3Cd77fef4e63Be", data: "0x2852b71c", value: "0x0" });
  });

  it("adds Arc testnet only when the wallet does not know the chain", async () => {
    const steps: string[] = [];
    let added = false;
    const eth: Eip1193 = {
      request: async (args) => {
        steps.push(args.method);
        if (args.method === "wallet_switchEthereumChain" && !added) {
          const err = new Error("Unrecognized chain");
          (err as Error & { code: number }).code = 4902;
          throw err;
        }
        if (args.method === "wallet_addEthereumChain") {
          added = true;
          return null;
        }
        if (args.method === "eth_chainId") return "0x4cef52";
        return null;
      },
    };
    expect(await ensureArcChain(eth)).toEqual({ ok: true });
    expect(steps).toEqual(["wallet_switchEthereumChain", "wallet_addEthereumChain", "wallet_switchEthereumChain", "eth_chainId"]);
  });

  it("adds Arc when the wallet returns a plain 4902 or stays on the old chain", async () => {
    const plain: string[] = [];
    const plainEth: Eip1193 = {
      request: async (args) => {
        plain.push(args.method);
        if (args.method === "wallet_switchEthereumChain" && plain.length === 1) {
          throw { code: 4902, message: "Unrecognized chain ID. Try adding the chain using wallet_addEthereumChain first." };
        }
        if (args.method === "eth_chainId") return "0x4cef52";
        return null;
      },
    };
    expect(await ensureArcChain(plainEth)).toEqual({ ok: true });
    expect(plain).toEqual(["wallet_switchEthereumChain", "wallet_addEthereumChain", "wallet_switchEthereumChain", "eth_chainId"]);

    let added = false;
    const stuck: string[] = [];
    const stuckEth: Eip1193 = {
      request: async (args) => {
        stuck.push(args.method);
        if (args.method === "wallet_addEthereumChain") added = true;
        if (args.method === "eth_chainId") return added ? "0x4cef52" : "0x1";
        return null;
      },
    };
    expect(await ensureArcChain(stuckEth)).toEqual({ ok: true });
    expect(stuck[0]).toBe("wallet_switchEthereumChain");
    expect(stuck).toContain("wallet_addEthereumChain");
  });
});
