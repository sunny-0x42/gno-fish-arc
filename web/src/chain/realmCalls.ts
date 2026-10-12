/** Pure Adena builders. Practice ids never leave the browser. */
import { MINT_FEE_UGNOT } from "../sim/tokenomics";

export const FISH_PKG = "gno.land/r/g1n4pl5uc4yt5r96m9w6fmdznx3x0jyg8l6arhmt/shoal/fish";
export const PARTY_PKG = "gno.land/r/g1n4pl5uc4yt5r96m9w6fmdznx3x0jyg8l6arhmt/shoal/party";
export const PROFILE_PKG = "gno.land/r/g1n4pl5uc4yt5r96m9w6fmdznx3x0jyg8l6arhmt/shoal/profile";
/** Issued trial FISH coin. The founder shoaltoken package is a different realm and is not issued. */
export const FISH_COIN_PKG = "gno.land/r/g10ragdr3cjqkael8rslpw4y6rlelhev4h0fswcx/fishcoin";
/** Only realm allowed to draw fishcoin. It is not an NFT collection. */
export const FISH_LAB_PKG = "gno.land/r/g10ragdr3cjqkael8rslpw4y6rlelhev4h0fswcx/fishlab";
/** Full sea copy. The chain parked it, so this client must not call it. */
export const FISH_TRY_PKG = "gno.land/r/g10ragdr3cjqkael8rslpw4y6rlelhev4h0fswcx/fishtry";
/** Small trial sea. The live NFT collection stays on FISH_PKG. The sea page does not send these calls. */
export const FISH_BAY_PKG = "gno.land/r/g10ragdr3cjqkael8rslpw4y6rlelhev4h0fswcx/fishbay";
/** FISH ledger drawn only by fishbay. fishcoin stays locked to fishlab. */
export const FISH_MARK_PKG = "gno.land/r/g10ragdr3cjqkael8rslpw4y6rlelhev4h0fswcx/fishmark";
/** fishbay realm address. fishmark.Spender is this address. */
export const FISH_BAY_REALM = "g1mxd8dag6d4pzg3kgkvm5zlm0mswe75zfqch8gf";
/** Two-person trial. The live NFT collection stays on FISH_PKG. The sea page does not send these calls. */
export const FISH_DUEL_PKG = "gno.land/r/g10ragdr3cjqkael8rslpw4y6rlelhev4h0fswcx/fishduel";
/** fishduel realm address. It draws no FISH. */
export const FISH_DUEL_REALM = "g1f6s7za87h3kwr3z6xmk287q2fc8cv38arf3gwu";
/** Trial mint and stake floor. The live collection stays at 150 GNOT mint and 10 GNOT stake. */
export const BAY_FEE_UGNOT = "1000000";
/** fishduel mint and stake floor. The live collection stays at 150 GNOT mint and 10 GNOT stake. */
export const DUEL_FEE_UGNOT = "1000000";

export type RealmCall = {
  pkg: string;
  func: string;
  args: string[];
  sendUgnot: string;
};

export type RealmMsg = {
  type: "/vm.m_call";
  value: {
    caller: string;
    send: { denom: string; amount: string }[];
    pkg_path: string;
    func: string;
    args: string[];
  };
};

const FISH_NEEDS_ID = new Set([
  "Register",
  "Leave",
  "SettleMatch",
  "Turn",
  "Move",
  "Burst",
  "Bite",
  "Heal",
  "RushHeal",
  "Cheer",
  "Claim",
]);

export function chainArmed(flag: string | undefined, chainId: string | undefined): boolean {
  if (flag !== "1" || typeof chainId !== "string") return false;
  return chainId === "onyx-1" || /^[1-9][0-9]*$/.test(chainId);
}

/** Fish calls that take an id stay in the browser unless every argument is a positive decimal. */
export function realmIdArgs(call: RealmCall): boolean {
  if (!FISH_NEEDS_ID.has(call.func)) return true;
  return call.args.every((arg) => /^[1-9][0-9]*$/.test(arg));
}

export function realmMsg(call: RealmCall, caller: string): RealmMsg {
  const send = call.sendUgnot === "0" ? [] : [{ denom: "ugnot", amount: call.sendUgnot }];
  return {
    type: "/vm.m_call",
    value: {
      caller,
      send,
      pkg_path: call.pkg,
      func: call.func,
      args: call.args,
    },
  };
}

export function mintCall(name: string, size: string, trait: string): RealmCall {
  return { pkg: FISH_PKG, func: "Mint", args: [name, size, trait], sendUgnot: String(MINT_FEE_UGNOT) };
}

/** FishNFT mint. sendArc prices this at 5 USDC on fish-arc-5. The chain flips the species and the trait. */
export function collectionMintCall(name: string): RealmCall {
  return { pkg: FISH_PKG, func: "MintCollection", args: [name], sendUgnot: "0" };
}

export function registerCall(id: string, stakeUgnot: string): RealmCall {
  return { pkg: FISH_PKG, func: "Register", args: [id, stakeUgnot], sendUgnot: stakeUgnot };
}

export function leaveCall(id: string): RealmCall {
  return { pkg: FISH_PKG, func: "Leave", args: [id], sendUgnot: "0" };
}

export function turnCall(id: string, dx: number, dz: number): RealmCall {
  return { pkg: FISH_PKG, func: "Turn", args: [id, String(dx), String(dz)], sendUgnot: "0" };
}

export function moveCall(id: string): RealmCall {
  return { pkg: FISH_PKG, func: "Move", args: [id], sendUgnot: "0" };
}

export function burstCall(id: string): RealmCall {
  return { pkg: FISH_PKG, func: "Burst", args: [id], sendUgnot: "0" };
}

export function biteCall(id: string, target: string): RealmCall {
  return { pkg: FISH_PKG, func: "Bite", args: [id, target], sendUgnot: "0" };
}

export function healCall(id: string): RealmCall {
  return { pkg: FISH_PKG, func: "Heal", args: [id], sendUgnot: "0" };
}

export function cheerCall(id: string, ugnot: string): RealmCall {
  return { pkg: FISH_PKG, func: "Cheer", args: [id], sendUgnot: ugnot };
}

export function claimCall(id: string): RealmCall {
  return { pkg: FISH_PKG, func: "Claim", args: [id], sendUgnot: "0" };
}

/** Draws 1 whole FISH per 1 whole GNOT of covered stake from fishcoin. The sea does not send this. */
export function payCoveredCall(coveredUgnot: string): RealmCall {
  return { pkg: FISH_LAB_PKG, func: "PayCovered", args: [coveredUgnot], sendUgnot: "0" };
}

/** Trial bay calls. They are not the shoal/fish collection, and the sea page does not send them. */
export function bayMintCall(name: string): RealmCall {
  return { pkg: FISH_BAY_PKG, func: "Mint", args: [name], sendUgnot: BAY_FEE_UGNOT };
}

export function bayRegisterCall(id: string, stakeUgnot: string): RealmCall {
  return { pkg: FISH_BAY_PKG, func: "Register", args: [id, stakeUgnot], sendUgnot: stakeUgnot };
}

export function bayLeaveCall(id: string): RealmCall {
  return { pkg: FISH_BAY_PKG, func: "Leave", args: [id], sendUgnot: "0" };
}

export function bayBiteCall(id: string, target: string): RealmCall {
  return { pkg: FISH_BAY_PKG, func: "Bite", args: [id, target], sendUgnot: "0" };
}

/** Trial duel calls. They are not the shoal/fish collection, and the sea page does not send them. */
export function duelMintCall(name: string): RealmCall {
  return { pkg: FISH_DUEL_PKG, func: "Mint", args: [name], sendUgnot: DUEL_FEE_UGNOT };
}

export function duelRegisterCall(id: string, stakeUgnot: string, pub: string): RealmCall {
  return { pkg: FISH_DUEL_PKG, func: "Register", args: [id, stakeUgnot, pub], sendUgnot: stakeUgnot };
}

export function duelLeaveCall(id: string): RealmCall {
  return { pkg: FISH_DUEL_PKG, func: "Leave", args: [id], sendUgnot: "0" };
}

export function duelSettleCall(id: string, target: string, pack: string): RealmCall {
  return { pkg: FISH_DUEL_PKG, func: "Settle", args: [id, target, pack], sendUgnot: "0" };
}

export function createPartyCall(name: string): RealmCall {
  return { pkg: PARTY_PKG, func: "Create", args: [name], sendUgnot: "0" };
}

export function inviteCall(who: string): RealmCall {
  return { pkg: PARTY_PKG, func: "Invite", args: [who], sendUgnot: "0" };
}

export function acceptCall(): RealmCall {
  return { pkg: PARTY_PKG, func: "Accept", args: [], sendUgnot: "0" };
}

export function setProfileCall(username: string, country: string, crest: string): RealmCall {
  return { pkg: PROFILE_PKG, func: "SetProfile", args: [username, country, crest], sendUgnot: "0" };
}

/** Sends only when the chain flag is on and every fish argument is a minted id. */
export async function sendRealm(
  call: RealmCall,
  opts: {
    flag: string | undefined;
    chainId: string | undefined;
    caller: string;
    send?: (msg: RealmMsg) => Promise<void>;
  },
): Promise<"local" | "sent"> {
  if (!chainArmed(opts.flag, opts.chainId) || !opts.send) return "local";
  if (!realmIdArgs(call)) return "local";
  await opts.send(realmMsg(call, opts.caller));
  return "sent";
}
