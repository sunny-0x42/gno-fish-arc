import { artUrl, onyxEval } from "./onyxStatus";
import { tokenIds } from "./adenaTx";
import { ARC_MINT_MICRO, ARC_NFT, ARC_SEL, addressCall, arcCall, decodeAddress, decodeBool, decodeString, decodeUint, decodeUintArray, isArcAddress, uintCall, weiToMicro, type ArcCall } from "./arc";
import { FISH_PKG } from "./realmCalls";
import { applyChainSailor, rememberSeaSailors } from "./sailorCard";
import { chainAddress } from "./session";
import type { ChainFishRow, ShoalGame } from "../sim/game";
import { isRarity, RARITIES, type Rarity } from "../sim/catalog";
import { isSize, isTrait, type Trait } from "../sim/tokenomics";

/** Public shoal/fish reads per token. Above this, the page keeps the wallet's own ids and the first slice. */
const ROSTER_CAP = 40;

export type QEval = (expr: string) => Promise<{ data: string; log: string }>;

export type RosterRead =
  | { ok: true; minted: number; fish: ChainFishRow[]; capped: boolean }
  | { ok: false; detail: string };

/** First quoted Gno string. Escapes are turned back into characters. */
export function gnoQuoted(data: string): string {
  const quoted = data.match(/"((?:\\.|[^"\\])*)"/);
  if (!quoted) return "";
  return quoted[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

export function gnoInt(data: string): number | null {
  const match = data.match(/-?\d+/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isSafeInteger(value) ? value : null;
}

export function gnoBool(data: string): boolean | null {
  if (/\btrue\b/.test(data)) return true;
  if (/\bfalse\b/.test(data)) return false;
  return null;
}

/** Name inside a shoal/fish TokenURI JSON payload. */
export function tokenName(data: string): string {
  const parsed = tokenJson(data);
  return parsed && typeof parsed.name === "string" ? parsed.name : "";
}

/** HTTPS image inside a shoal/fish TokenURI. Anything else stays blank. */
export function tokenImage(data: string): string {
  const parsed = tokenJson(data);
  return parsed && typeof parsed.image === "string" ? artUrl(parsed.image) : "";
}

function tokenJson(data: string): { name?: unknown; image?: unknown } | null {
  const uri = gnoQuoted(data);
  const start = uri.indexOf("{");
  if (start < 0) return null;
  try {
    return JSON.parse(uri.slice(start)) as { name?: unknown; image?: unknown };
  } catch {
    const name = uri.match(/"name":"([^"]*)"/);
    const image = uri.match(/"image":"([^"]*)"/);
    if (!name && !image) return null;
    return { name: name?.[1] ?? "", image: image?.[1] ?? "" };
  }
}

function panicked(log: string): boolean {
  return log.includes("panic") || log.includes("fish: unknown");
}

function sameWallet(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

const unread = { data: "", log: "unread" };

function enumField<T extends string>(
  row: { data: string; log: string },
  ok: (value: string) => value is T,
  fallback: T,
): T {
  if (panicked(row.log)) return fallback;
  const value = gnoQuoted(row.data);
  return ok(value) ? value : fallback;
}

async function readFish(id: number, evalFn: QEval): Promise<ChainFishRow | null> {
  const pkg = FISH_PKG;
  let owner: { data: string; log: string };
  try {
    owner = await evalFn(`${pkg}.OwnerOf("${id}")`);
  } catch {
    return null;
  }
  if (panicked(owner.log)) return null;
  const who = gnoQuoted(owner.data).trim().toLowerCase();
  if (!chainAddress(who)) return null;
  const [inMatch, pool, size, trait, rarity, bouts, uri] = await Promise.all([
    evalFn(`${pkg}.InMatch(${id})`).catch(() => unread),
    evalFn(`${pkg}.PoolOf(${id})`).catch(() => unread),
    evalFn(`${pkg}.SizeOf(${id})`).catch(() => unread),
    evalFn(`${pkg}.TraitOf(${id})`).catch(() => unread),
    evalFn(`${pkg}.RarityOf(${id})`).catch(() => unread),
    evalFn(`${pkg}.BoutsOf(${id})`).catch(() => unread),
    evalFn(`${pkg}.TokenURI("${id}")`).catch(() => unread),
  ]);
  const swimming = panicked(inMatch.log) ? false : gnoBool(inMatch.data) === true;
  const stakeRaw = panicked(pool.log) ? 0 : gnoInt(pool.data);
  const playedRaw = panicked(bouts.log) ? 0 : gnoInt(bouts.data);
  const stake = stakeRaw === null || stakeRaw < 0 ? 0 : stakeRaw;
  const played = playedRaw === null || playedRaw < 0 ? 0 : playedRaw;
  return {
    onyxId: id,
    owner: who,
    name: panicked(uri.log) ? "" : tokenName(uri.data),
    image: panicked(uri.log) ? "" : tokenImage(uri.data),
    rarity: enumField(rarity, isRarity, "common"),
    size: enumField(size, isSize, "medium"),
    trait: enumField(trait, isTrait, "fang"),
    poolUgnot: stake,
    inMatch: swimming,
    bouts: played,
  };
}

/** shoal/fish rows for the connected wallet and for fish already in a match. */
export async function readSeaRoster(signer: string, evalFn: QEval = onyxEval): Promise<RosterRead> {
  const signerKey = signer.trim().toLowerCase();
  if (!chainAddress(signerKey)) return { ok: false, detail: "Connect a wallet address." };
  const mintedRow = await evalFn(`${FISH_PKG}.Minted()`);
  if (panicked(mintedRow.log)) return { ok: false, detail: "Roster unread. The sea stays empty." };
  const minted = gnoInt(mintedRow.data);
  if (minted === null || minted < 0) return { ok: false, detail: "Roster unread. The sea stays empty." };
  if (minted === 0) return { ok: true, minted: 0, fish: [], capped: false };
  const ownedRow = await evalFn(`${FISH_PKG}.TokensOf("${signerKey}")`);
  const owned = panicked(ownedRow.log) ? [] : tokenIds(ownedRow.data);
  const capped = minted > ROSTER_CAP;
  const ids: number[] = [];
  const limit = Math.min(minted, ROSTER_CAP);
  for (let id = 1; id <= limit; id += 1) ids.push(id);
  for (const id of owned) {
    if (id > minted || ids.includes(id)) continue;
    ids.push(id);
  }
  const rows = await Promise.all(ids.map((id) => readFish(id, evalFn).catch(() => null)));
  const fish = rows.filter((row): row is ChainFishRow => {
    if (!row) return false;
    return row.inMatch || sameWallet(row.owner, signerKey);
  });
  return { ok: true, minted, fish, capped };
}

const ARC_SCAN = 8;

export type WornFish = { rarity: Rarity; trait: Trait };

/** Highest FishNFT tier this wallet holds, and the trait rolled on that fish. */
export async function readBestWorn(owner: string, nftCall: ArcCall): Promise<WornFish | null> {
  const ids = decodeUintArray(await nftCall(addressCall(ARC_SEL.tokensOf, owner)));
  if (!ids || ids.length === 0) return null;
  let rarity: Rarity | null = null;
  let trait: Trait = "swift";
  let rank = -1;
  const cap = Math.min(ids.length, 8);
  for (let i = 0; i < cap; i += 1) {
    const text = decodeString(await nftCall(uintCall(ARC_SEL.rarityOf, ids[i])));
    if (!text || !isRarity(text)) continue;
    const next = RARITIES.indexOf(text);
    if (next > rank) {
      rank = next;
      rarity = text;
      trait = "swift";
      try {
        const rolled = decodeString(await nftCall(uintCall(ARC_SEL.traitOf, ids[i])));
        if (rolled && isTrait(rolled)) trait = rolled;
      } catch {
        trait = "swift";
      }
    }
  }
  return rarity ? { rarity, trait } : null;
}

/** Highest FishNFT tier this wallet holds. A miss stays null so the sea keeps Bubble. */
export async function readBestRarity(owner: string, nftCall: ArcCall): Promise<Rarity | null> {
  const worn = await readBestWorn(owner, nftCall);
  return worn?.rarity ?? null;
}

async function readCount(call: ArcCall): Promise<number | null> {
  try {
    const value = decodeUint(await call(ARC_SEL.minted));
    if (value === null || value > 10_000n) return null;
    return Number(value);
  } catch {
    return null;
  }
}

/** FishDuel seats, plus Shoal collection fish this wallet holds. A collection fish stays docked. */
export async function readArcRoster(signer: string, call: ArcCall = arcCall, nftCall?: ArcCall): Promise<RosterRead> {
  const signerKey = signer.trim().toLowerCase();
  if (!isArcAddress(signerKey)) return { ok: false, detail: "Connect a wallet on Arc testnet." };
  const collection = nftCall ?? (call === arcCall ? (data: string) => arcCall(data, ARC_NFT) : call);
  const duelMinted = await readCount(call);
  const nftMinted = collection === call ? duelMinted : await readCount(collection);
  if (duelMinted === null && nftMinted === null) return { ok: false, detail: "Arc roster unread. The sea stays empty." };
  const duel = duelMinted ?? 0;
  const nft = nftMinted ?? 0;
  if (duel === 0 && nftMinted === null) return { ok: false, detail: "Arc roster unread. The sea stays empty." };
  if (duel === 0 && nft === 0) return { ok: true, minted: 0, fish: [], capped: false };
  const limit = Math.min(duel, ARC_SCAN);
  const fish: ChainFishRow[] = [];
  const worn = new Map<string, WornFish>();
  const wornFor = async (owner: string): Promise<WornFish> => {
    const key = owner.toLowerCase();
    const hit = worn.get(key);
    if (hit) return hit;
    let body: WornFish = { rarity: "common", trait: "swift" };
    try {
      const best = await readBestWorn(key, collection);
      if (best) body = best;
    } catch {
      body = { rarity: "common", trait: "swift" };
    }
    worn.set(key, body);
    return body;
  };
  for (let id = 1; id <= limit; id += 1) {
    try {
      const [ownerRaw, nameRaw, seaRaw, endedRaw] = await Promise.all([
        call(uintCall(ARC_SEL.ownerOf, BigInt(id))),
        call(uintCall(ARC_SEL.nameOf, BigInt(id))),
        call(uintCall(ARC_SEL.inSea, BigInt(id))),
        call(uintCall(ARC_SEL.ended, BigInt(id))),
      ]);
      const owner = decodeAddress(ownerRaw);
      const name = decodeString(nameRaw);
      const inSea = decodeBool(seaRaw);
      const ended = decodeBool(endedRaw);
      if (!owner || owner === `0x${"0".repeat(40)}` || name === null || inSea === null || ended === null) continue;
      if (!inSea && owner !== signerKey) continue;
      const look = await wornFor(owner);
      let poolUgnot = 0;
      if (inSea) {
        poolUgnot = ARC_MINT_MICRO;
        try {
          const raw = decodeUint(await call(uintCall(ARC_SEL.poolOf, BigInt(id))));
          const micro = raw === null ? null : weiToMicro(raw);
          if (micro !== null && micro >= ARC_MINT_MICRO) poolUgnot = micro;
        } catch {
          poolUgnot = ARC_MINT_MICRO;
        }
      }
      fish.push({
        onyxId: id,
        owner,
        name: name || `fish${id}`,
        rarity: look.rarity,
        size: "medium",
        trait: look.trait,
        poolUgnot,
        inMatch: inSea,
        bouts: ended ? 1 : 0,
        image: "",
        collectionOnly: false,
      });
    } catch {
      continue;
    }
  }
  let listed = 0;
  if (nft > 0) {
    try {
      const ids = decodeUintArray(await collection(addressCall(ARC_SEL.tokensOf, signerKey))) ?? [];
      listed = ids.length;
      const cap = Math.min(ids.length, ARC_SCAN);
      for (let i = 0; i < cap; i += 1) {
        const id = ids[i];
        const n = Number(id);
        if (!Number.isSafeInteger(n) || n < 1 || fish.some((row) => row.onyxId === n)) continue;
        try {
          const [ownerRaw, nameRaw, rarityRaw, traitRaw] = await Promise.all([
            collection(uintCall(ARC_SEL.ownerOf, id)),
            collection(uintCall(ARC_SEL.nameOf, id)),
            collection(uintCall(ARC_SEL.rarityOf, id)),
            collection(uintCall(ARC_SEL.traitOf, id)),
          ]);
          const owner = decodeAddress(ownerRaw);
          const name = decodeString(nameRaw);
          const rarityText = decodeString(rarityRaw);
          const traitText = decodeString(traitRaw);
          if (!owner || owner !== signerKey || name === null) continue;
          fish.push({
            onyxId: n,
            owner,
            name: name || `fish${n}`,
            rarity: rarityText && isRarity(rarityText) ? rarityText : "common",
            size: "medium",
            trait: traitText && isTrait(traitText) ? traitText : "swift",
            poolUgnot: 0,
            inMatch: false,
            bouts: 0,
            image: "",
            collectionOnly: true,
          });
        } catch {
          continue;
        }
      }
    } catch {
      if (fish.length === 0) return { ok: false, detail: "Arc roster unread. The sea stays empty." };
    }
  }
  const minted = Math.max(duel, nft);
  return { ok: true, minted, fish, capped: duel > limit || listed > ARC_SCAN };
}

async function loadArcSea(game: ShoalGame, signer: string, now: number, call: ArcCall, nftCall?: ArcCall): Promise<string> {
  let read: RosterRead;
  try {
    read = await readArcRoster(signer, call, nftCall);
  } catch {
    return "Arc roster unread. The sea stays empty.";
  }
  if (!read.ok) return read.detail;
  const synced = game.syncChainRoster(signer, read.fish, now);
  if (read.minted === 0) return "No fish have been minted on Arc. The sea stays empty.";
  const signerKey = signer.trim().toLowerCase();
  const walletFish = read.fish.filter((fish) => sameWallet(fish.owner, signerKey)).length;
  const swimming = read.fish.filter((fish) => fish.inMatch).length;
  const docked = read.fish.filter((fish) => sameWallet(fish.owner, signerKey) && !fish.inMatch).length;
  const cap = read.capped ? " Showing the first 8 fish plus this wallet." : "";
  const short = synced.skipped > 0 ? ` ${synced.skipped} could not be mirrored.` : "";
  const roster = docked > 0 ? ` ${docked} stay on the roster until a pool stake.` : "";
  return `Arc has ${read.minted} minted, ${walletFish} in this wallet, ${swimming} in a match. This sea shows ${synced.seated}. A reload reads these fish from Arc. Position and HP stay in this browser. Bites stay in this browser.${roster}${cap}${short}`;
}

/** Pull the chain roster into the sea. An Arc address reads the Shoal collection and FishDuel. A g1 address keeps the Onyx read used by tests. */
export async function loadChainSea(
  game: ShoalGame,
  signer: string,
  now = Date.now(),
  evalFn: QEval = onyxEval,
  arcFn: ArcCall = arcCall,
  nftFn?: ArcCall,
): Promise<string> {
  if (isArcAddress(signer)) return loadArcSea(game, signer, now, arcFn, nftFn);
  let read: RosterRead;
  try {
    read = await readSeaRoster(signer, evalFn);
  } catch {
    return "Roster unread. The sea stays empty.";
  }
  if (!read.ok) return read.detail;
  const synced = game.syncChainRoster(signer, read.fish, now);
  const signerKey = signer.trim().toLowerCase();
  const owners = read.fish.map((fish) => fish.owner).filter((owner) => owner.trim().toLowerCase() !== signerKey);
  await Promise.all([
    applyChainSailor(game, signerKey, evalFn),
    rememberSeaSailors(game, owners, evalFn),
  ]);
  if (read.minted === 0) return "No fish have been minted. The sea stays empty.";
  const walletFish = read.fish.filter((fish) => sameWallet(fish.owner, signer)).length;
  const swimming = read.fish.filter((fish) => fish.inMatch).length;
  const docked = read.fish.filter((fish) => sameWallet(fish.owner, signer) && !fish.inMatch).length;
  const cap = read.capped ? " Showing the first 40 fish plus this wallet." : "";
  const short = synced.skipped > 0 ? ` ${synced.skipped} could not be mirrored.` : "";
  const roster = docked > 0 ? ` ${docked} stay on the roster until a pool stake.` : "";
  return `The roster has ${read.minted} minted, ${walletFish} in this wallet, ${swimming} in a match. This sea shows ${synced.seated}. A reload reads these fish again. Position and HP stay in this browser. Bites stay in this browser.${roster}${cap}${short}`;
}
