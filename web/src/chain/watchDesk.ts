import { tokenIds } from "./adenaTx";
import { FISH_PKG, PARTY_PKG, PROFILE_PKG } from "./realmCalls";
import { gnoBool, gnoInt, gnoQuoted, tokenName, type QEval } from "./seaRoster";
import { onyxEval } from "./onyxStatus";

/** The only account this desk will open. Chain reads use this address and no other. */
export const WATCH_ADDRESS = "g1n4pl5uc4yt5r96m9w6fmdznx3x0jyg8l6arhmt";

const FISH_CAP = 12;

export function watchAllowed(address: string): boolean {
  return address.trim().toLowerCase() === WATCH_ADDRESS;
}

export type EvalRow = { data: string; log: string };

export type WatchFish = {
  id: number;
  name: string;
  rarity: string;
  poolUgnot: number | null;
  inMatch: boolean | null;
};

export type WatchSnap = {
  minted: number | null;
  mintPriceUgnot: number | null;
  supply: number | null;
  royaltyBps: number | null;
  held: number | null;
  username: string;
  country: string;
  partyId: number | null;
  partyName: string;
  members: number | null;
  fish: WatchFish[];
};

const blank: EvalRow = { data: "", log: "panic: unread" };

function failed(row: EvalRow): boolean {
  return row.log.includes("panic");
}

function num(row: EvalRow): number | null {
  if (failed(row)) return null;
  const value = gnoInt(row.data);
  return value === null || value < 0 ? null : value;
}

function text(row: EvalRow): string {
  if (failed(row)) return "";
  return gnoQuoted(row.data);
}

/** Turn qeval rows into the desk figures. A panic stays unread instead of a zero. */
export function parseWatch(input: {
  minted: EvalRow;
  mintPrice: EvalRow;
  supply: EvalRow;
  royalty: EvalRow;
  held: EvalRow;
  username: EvalRow;
  country: EvalRow;
  party: EvalRow;
  partyName: EvalRow;
  members: EvalRow;
  fish: { id: number; uri: EvalRow; rarity: EvalRow; pool: EvalRow; match: EvalRow }[];
}): WatchSnap {
  const partyId = num(input.party);
  const seated = partyId !== null && partyId > 0;
  return {
    minted: num(input.minted),
    mintPriceUgnot: num(input.mintPrice),
    supply: num(input.supply),
    royaltyBps: num(input.royalty),
    held: num(input.held),
    username: text(input.username),
    country: text(input.country),
    partyId,
    partyName: seated ? text(input.partyName) : "",
    members: seated ? num(input.members) : null,
    fish: input.fish.map((row) => ({
      id: row.id,
      name: failed(row.uri) ? "" : tokenName(row.uri.data),
      rarity: text(row.rarity),
      poolUgnot: num(row.pool),
      inMatch: failed(row.match) ? null : gnoBool(row.match.data),
    })),
  };
}

async function ask(evalFn: QEval, expr: string): Promise<EvalRow> {
  try {
    return await evalFn(expr);
  } catch {
    return blank;
  }
}

/** Public qeval reads for the watch address. This does not build a transaction. */
export async function loadWatch(evalFn: QEval = onyxEval): Promise<WatchSnap> {
  const who = WATCH_ADDRESS;
  const fishPkg = FISH_PKG;
  const [minted, mintPrice, supply, royalty, held, tokens, username, country, party] = await Promise.all([
    ask(evalFn, `${fishPkg}.Minted()`),
    ask(evalFn, `${fishPkg}.MintPrice()`),
    ask(evalFn, `${fishPkg}.TotalSupply()`),
    ask(evalFn, `${fishPkg}.RoyaltyBps()`),
    ask(evalFn, `${fishPkg}.BalanceOf("${who}")`),
    ask(evalFn, `${fishPkg}.TokensOf("${who}")`),
    ask(evalFn, `${PROFILE_PKG}.UsernameOf("${who}")`),
    ask(evalFn, `${PROFILE_PKG}.CountryOf("${who}")`),
    ask(evalFn, `${PARTY_PKG}.PartyOf("${who}")`),
  ]);
  const partyId = num(party);
  const [partyName, members] = partyId !== null && partyId > 0
    ? await Promise.all([
      ask(evalFn, `${PARTY_PKG}.NameOf(${partyId})`),
      ask(evalFn, `${PARTY_PKG}.MemberCount(${partyId})`),
    ])
    : [blank, blank];
  const ids = failed(tokens) ? [] : tokenIds(tokens.data).slice(0, FISH_CAP);
  const fish = await Promise.all(ids.map(async (id) => {
    const [uri, rarity, pool, match] = await Promise.all([
      ask(evalFn, `${fishPkg}.TokenURI("${id}")`),
      ask(evalFn, `${fishPkg}.RarityOf(${id})`),
      ask(evalFn, `${fishPkg}.PoolOf(${id})`),
      ask(evalFn, `${fishPkg}.InMatch(${id})`),
    ]);
    return { id, uri, rarity, pool, match };
  }));
  return parseWatch({
    minted, mintPrice, supply, royalty, held, username, country, party, partyName, members, fish,
  });
}
