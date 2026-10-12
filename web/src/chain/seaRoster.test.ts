import { describe, expect, it } from "vitest";
import { abiEncodeString, addressCall, ARC_SEL, uintCall } from "./arc";
import { FISH_PKG } from "./realmCalls";
import { gnoBool, gnoInt, gnoQuoted, loadChainSea, readSeaRoster, tokenImage, tokenName, type QEval } from "./seaRoster";
import { ShoalGame } from "../sim/game";
import { GENESIS_GNOT, UGNOT } from "../sim/catalog";

const DEV = "g1n4pl5uc4yt5r96m9w6fmdznx3x0jyg8l6arhmt";
const OTHER = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";

const URI = `("data:application/json;charset=utf-8,{\\"name\\":\\"Minnow\\",\\"description\\":\\"Shoal fish\\"}" string)`;

function fake(extra: Record<string, { data: string; log: string }> = {}): QEval {
  return async (expr: string) => {
    if (extra[expr]) return extra[expr];
    if (expr.endsWith(".Minted()")) return { data: "(1 int)", log: "" };
    if (expr.includes(".TokensOf(")) return { data: '("1" string)', log: "" };
    if (expr.includes('.OwnerOf("1")')) return { data: `("${DEV}" .uverse.address)\n(undefined)`, log: "" };
    if (expr.includes(".InMatch(1)")) return { data: "(true bool)", log: "" };
    if (expr.includes(".PoolOf(1)")) return { data: "(5000000 int64)", log: "" };
    if (expr.includes(".SizeOf(1)")) return { data: '("medium" string)', log: "" };
    if (expr.includes(".TraitOf(1)")) return { data: '("fang" string)', log: "" };
    if (expr.includes(".RarityOf(1)")) return { data: '("common" string)', log: "" };
    if (expr.includes(".BoutsOf(1)")) return { data: "(0 int)", log: "" };
    if (expr.includes('.TokenURI("1")')) return { data: URI, log: "" };
    return { data: "", log: "panic: missing" };
  };
}

describe("onyx roster parse", () => {
  it("reads quoted strings, ints, bools, and the token name", () => {
    expect(gnoQuoted(`("${DEV}" .uverse.address)`)).toBe(DEV);
    expect(gnoInt("(5000000 int64)")).toBe(5_000_000);
    expect(gnoBool("(true bool)")).toBe(true);
    expect(gnoBool("(false bool)")).toBe(false);
    expect(tokenName(URI)).toBe("Minnow");
    const art = "https://gateway.pinata.cloud/ipfs/bafybeid6uahelm3h2oo7rs4z6cgdyrpkueuvcychwuz5fw5tf7mj6hggli";
    const withArt = `("data:application/json;charset=utf-8,{\\"name\\":\\"Minnow\\",\\"image\\":\\"${art}\\"}" string)`;
    expect(tokenImage(withArt)).toBe(art);
    expect(tokenImage(URI)).toBe("");
    expect(tokenImage(`("{\\"image\\":\\"http://shoal.example/a.png\\"}" string)`)).toBe("");
    expect(tokenImage(`("{\\"image\\":\\"https://shoal.example/a|b.png\\"}" string)`)).toBe("");
  });

  it("keeps an in-match fish and drops a burned id", async () => {
    const read = await readSeaRoster(DEV, fake({
      [`${FISH_PKG}.Minted()`]: { data: "(2 int)", log: "" },
      [`${FISH_PKG}.OwnerOf("2")`]: { data: "", log: "panic: fish: unknown" },
    }));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.minted).toBe(2);
    expect(read.fish).toHaveLength(1);
    expect(read.fish[0]).toMatchObject({ onyxId: 1, owner: DEV, name: "Minnow", inMatch: true, poolUgnot: 5 * UGNOT });
  });

  it("mirrors that fish once and does not mark it ai", async () => {
    const game = new ShoalGame(0);
    const detail = await loadChainSea(game, DEV, 0, fake());
    expect(game.fish).toHaveLength(1);
    expect(game.fish[0].ai).toBe(false);
    expect(game.fish[0].ownerId).toBe("player");
    expect(game.fish[0].matchId).toBe("sea");
    expect(game.fish[0].onyxSwim).toBe(true);
    expect(game.fish[0].image).toBe("");
    expect(game.living().some((fish) => fish.ai)).toBe(false);
    expect(detail).toContain("1 minted");
    expect(detail).toContain("1 in this wallet");
    const again = await loadChainSea(game, DEV, 0, fake());
    expect(game.fish).toHaveLength(1);
    expect(again).toContain("1 minted");
    expect(game.supply().gnot).toBe(GENESIS_GNOT);
  });

  it("shows another wallet's swimmer and keeps a docked fish off the sea", async () => {
    const game = new ShoalGame(0);
    const evalFn = fake({
      [`${FISH_PKG}.TokensOf("${OTHER}")`]: { data: '("")', log: "" },
      [`${FISH_PKG}.OwnerOf("1")`]: { data: `("${DEV}" .uverse.address)\n(undefined)`, log: "" },
      [`${FISH_PKG}.InMatch(1)`]: { data: "(false bool)", log: "" },
      [`${FISH_PKG}.PoolOf(1)`]: { data: "(0 int64)", log: "" },
    });
    await loadChainSea(game, OTHER, 0, evalFn);
    expect(game.fish).toHaveLength(0);
    const swimming = fake({
      [`${FISH_PKG}.TokensOf("${OTHER}")`]: { data: '("")', log: "" },
    });
    await loadChainSea(game, OTHER, 0, swimming);
    expect(game.fish).toHaveLength(1);
    expect(game.fish[0].ownerId).toBe(DEV);
    expect(game.fish[0].ai).toBe(false);
    expect(game.fish[0].matchId).toBe("sea");
  });

  it("keeps the https image from TokenURI on the mirrored fish", async () => {
    const art = "https://gateway.pinata.cloud/ipfs/bafybeid6uahelm3h2oo7rs4z6cgdyrpkueuvcychwuz5fw5tf7mj6hggli";
    const game = new ShoalGame(0);
    await loadChainSea(game, DEV, 0, fake({
      [`${FISH_PKG}.TokenURI("1")`]: {
        data: `("data:application/json;charset=utf-8,{\\"name\\":\\"Minnow\\",\\"image\\":\\"${art}\\"}" string)`,
        log: "",
      },
    }));
    expect(game.fish[0].image).toBe(art);
  });

  it("keeps a docked wallet fish when the token image cannot be read", async () => {
    const game = new ShoalGame(0);
    const detail = await loadChainSea(game, DEV, 0, fake({
      [`${FISH_PKG}.InMatch(1)`]: { data: "(false bool)", log: "" },
      [`${FISH_PKG}.PoolOf(1)`]: { data: "(0 int64)", log: "" },
      [`${FISH_PKG}.TokenURI("1")`]: { data: "", log: "panic: fish: uri" },
      [`${FISH_PKG}.OwnerOf("1")`]: { data: `("${DEV.toUpperCase()}" .uverse.address)\n(undefined)`, log: "" },
    }));
    expect(game.fish).toHaveLength(1);
    expect(game.fish[0].onyxId).toBe(1);
    expect(game.fish[0].ownerId).toBe("player");
    expect(game.fish[0].name).toBe("Fish 1");
    expect(game.fish[0].matchId).toBeNull();
    expect(detail).toContain("1 in this wallet");
    expect(detail).toContain("until a pool stake");
  });
});

describe("arc roster", () => {
  const owner = "0x8eaae9f664214987204616dd8145bacad48044f6";

  function word(value: bigint): string {
    return `0x${value.toString(16).padStart(64, "0")}`;
  }

  it("mirrors a seated FishDuel fish for an Arc wallet", async () => {
    const game = new ShoalGame(0);
    const call = async (data: string) => {
      if (data === ARC_SEL.minted) return word(1n);
      if (data === uintCall(ARC_SEL.ownerOf, 1n)) return word(BigInt(owner));
      if (data === uintCall(ARC_SEL.nameOf, 1n)) return abiEncodeString("minnow");
      if (data === uintCall(ARC_SEL.inSea, 1n)) return word(1n);
      if (data === uintCall(ARC_SEL.ended, 1n)) return word(0n);
      throw new Error(data);
    };
    const detail = await loadChainSea(game, owner, 0, async () => ({ data: "", log: "should not read onyx" }), call);
    expect(detail).toContain("Arc has 1 minted");
    expect(game.fish).toHaveLength(1);
    expect(game.fish[0].ownerId).toBe("player");
    expect(game.fish[0].name).toBe("minnow");
    expect(game.fish[0].onyxId).toBe(1);
    expect(game.fish[0].matchId).toBe("sea");
    expect(game.fish[0].ai).toBe(false);
    expect(game.fish[0].rarity).toBe("common");
    expect(game.fish[0].species).toBe("Bubble");
    expect(game.fish[0].collectionOnly).not.toBe(true);
  });

  it("wears the collection rarity so the sea mounts that compressed model", async () => {
    const game = new ShoalGame(0);
    const rare = async (data: string) => {
      if (data === ARC_SEL.minted) return word(1n);
      if (data === uintCall(ARC_SEL.ownerOf, 1n)) return word(BigInt(owner));
      if (data === uintCall(ARC_SEL.nameOf, 1n)) return abiEncodeString("minnow");
      if (data === uintCall(ARC_SEL.inSea, 1n)) return word(1n);
      if (data === uintCall(ARC_SEL.ended, 1n)) return word(0n);
      if (data === addressCall(ARC_SEL.tokensOf, owner)) {
        const pad = (value: bigint) => value.toString(16).padStart(64, "0");
        return `0x${pad(32n)}${pad(1n)}${pad(1n)}`;
      }
      if (data === uintCall(ARC_SEL.rarityOf, 1n)) return abiEncodeString("rare");
      if (data === uintCall(ARC_SEL.traitOf, 1n)) return abiEncodeString("hide");
      throw new Error(data);
    };
    await loadChainSea(game, owner, 0, async () => ({ data: "", log: "should not read onyx" }), rare);
    expect(game.fish[0].rarity).toBe("rare");
    expect(game.fish[0].species).toBe("Abysswing");
    expect(game.fish[0].trait).toBe("hide");
    expect(game.fish[0].size).toBe("medium");
    expect(game.fish[0].aspect).toBeNull();
    expect(game.fish[0].image).toBe("");
  });

  it("puts the other seated wallet at home and leaves the sea free of machine fish", async () => {
    const deployer = owner;
    const other = "0x3cb09e7756199222939df0378e0ae8f8d2360b28";
    const game = new ShoalGame(0);
    const call = async (data: string) => {
      if (data === ARC_SEL.minted) return word(2n);
      if (data === uintCall(ARC_SEL.ownerOf, 1n)) return word(BigInt(deployer));
      if (data === uintCall(ARC_SEL.ownerOf, 2n)) return word(BigInt(other));
      if (data === uintCall(ARC_SEL.nameOf, 1n) || data === uintCall(ARC_SEL.nameOf, 2n)) return abiEncodeString("minnow");
      if (data === uintCall(ARC_SEL.inSea, 1n) || data === uintCall(ARC_SEL.inSea, 2n)) return word(1n);
      if (data === uintCall(ARC_SEL.ended, 1n) || data === uintCall(ARC_SEL.ended, 2n)) return word(0n);
      throw new Error(data);
    };
    await loadChainSea(game, other, 0, async () => ({ data: "", log: "should not read onyx" }), call);
    const mine = game.owned("player");
    expect(mine).toHaveLength(1);
    expect(mine[0].onyxId).toBe(2);
    expect(mine[0].sx).toBe(0);
    expect(mine[0].sz).toBe(1);
    expect(mine[0].matchId).toBe("sea");
    expect(mine[0].poolUgnot).toBe(UGNOT);
    expect(game.fish.find((fish) => fish.onyxId === 1)?.ownerId).toBe(deployer);
    expect(game.startMatch(mine[0].id, 0).ok).toBe(true);
    expect(game.activeFishId).toBe(mine[0].id);
    expect(game.living().some((fish) => fish.ai)).toBe(false);
    expect(game.supply().gnot).toBe(GENESIS_GNOT);
  });

  it("shows a Shoal collection fish when FishDuel has not minted", async () => {
    const game = new ShoalGame(0);
    const duel = async (data: string) => {
      if (data === ARC_SEL.minted) return word(0n);
      throw new Error(data);
    };
    const nft = async (data: string) => {
      if (data === ARC_SEL.minted) return word(1n);
      if (data === addressCall(ARC_SEL.tokensOf, owner)) {
        const pad = (value: bigint) => value.toString(16).padStart(64, "0");
        return `0x${pad(32n)}${pad(1n)}${pad(1n)}`;
      }
      if (data === uintCall(ARC_SEL.ownerOf, 1n)) return word(BigInt(owner));
      if (data === uintCall(ARC_SEL.nameOf, 1n)) return abiEncodeString("Bubble");
      if (data === uintCall(ARC_SEL.rarityOf, 1n)) return abiEncodeString("common");
      if (data === uintCall(ARC_SEL.traitOf, 1n)) return abiEncodeString("swift");
      throw new Error(data);
    };
    const detail = await loadChainSea(game, owner, 0, async () => ({ data: "", log: "should not read onyx" }), duel, nft);
    expect(detail).not.toContain("No fish have been minted");
    expect(detail).toContain("Arc has 1 minted");
    expect(detail).toContain("1 in this wallet");
    expect(detail).toContain("until a pool stake");
    expect(game.fish).toHaveLength(1);
    expect(game.fish[0].ownerId).toBe("player");
    expect(game.fish[0].name).toBe("Bubble");
    expect(game.fish[0].onyxId).toBe(1);
    expect(game.fish[0].matchId).toBeNull();
    expect(game.fish[0].poolUgnot).toBe(0);
    expect(game.fish[0].onyxSwim).toBe(false);
    expect(game.fish[0].collectionOnly).toBe(true);
    expect(game.fish[0].rarity).toBe("common");
    expect(game.fish[0].species).toBe("Bubble");
    expect(game.fish[0].trait).toBe("swift");
    expect(game.fish[0].size).toBe("medium");
    expect(game.fish[0].ai).toBe(false);
  });

  it("moves the sea to a newly connected wallet even during a swim", () => {
    const other = "0x3cb09e7756199222939df0378e0ae8f8d2360b28";
    const game = new ShoalGame(0);
    const row = (id: number, who: string) => ({
      onyxId: id,
      owner: who,
      name: "minnow",
      rarity: "common" as const,
      size: "small" as const,
      trait: "swift" as const,
      poolUgnot: UGNOT,
      inMatch: true,
      bouts: 0,
      image: "",
    });
    game.syncChainRoster(owner, [row(1, owner), row(2, other)], 0);
    const first = game.owned("player")[0];
    expect(first.onyxId).toBe(1);
    game.activeFishId = first.id;
    first.lastCombatAt = 10;
    game.syncChainRoster(other, [row(1, owner), row(2, other)], 0);
    const mine = game.owned("player");
    expect(mine.map((fish) => fish.onyxId)).toEqual([2]);
    expect(mine[0].sx).toBe(0);
    expect(mine[0].sz).toBe(1);
    expect(game.fish.find((fish) => fish.onyxId === 1)?.ownerId).toBe(owner);
    expect(game.activeFishId).toBeNull();
    expect(game.supply().gnot).toBe(GENESIS_GNOT);
  });
});
