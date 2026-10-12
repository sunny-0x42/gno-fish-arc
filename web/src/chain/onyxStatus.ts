import { ARC_NFT, arcCall, arcMinted } from "./arc";
import { FISH_BAY_PKG, FISH_COIN_PKG, FISH_DUEL_PKG, FISH_LAB_PKG, FISH_MARK_PKG } from "./realmCalls";

export const ONYX_RPC = "https://rpc.onyx.testnets.gno.land:443";
export const ONYX_CHAIN_ID = "onyx-1";

export type OnyxFishStatus =
  | { kind: "reading" }
  | { kind: "uninit" }
  | { kind: "live"; name: string; minted: number; portrait: string }
  | { kind: "unread" };

export function chainLine(status: OnyxFishStatus): string {
  if (status.kind === "live") {
    return `Arc testnet · ${status.name} · ${status.minted} minted. Stake 1 USDC to enter the sea.`;
  }
  if (status.kind === "uninit") {
    return "The collection is not open yet. Stake 1 USDC to enter the sea.";
  }
  if (status.kind === "unread") {
    return "Arc status unread. Stake 1 USDC to enter the sea.";
  }
  return "Stake 1 USDC to enter the sea.";
}

/** Classifies a vm/qeval pair. Name panics with fish: init before Init. */
export function classifyFish(nameData: string, nameLog: string, mintedData: string): OnyxFishStatus {
  if (nameLog.includes("fish: init")) return { kind: "uninit" };
  const name = quotedName(nameData);
  const minted = leadingInt(mintedData);
  if (!name || minted === null) return { kind: "unread" };
  return { kind: "live", name, minted, portrait: "" };
}

/** One https URL, short enough for SetArt, with no metadata separators. */
export function artUrl(value: string): string {
  if (!value.startsWith("https://") || value.length > 160 || value.includes("|") || value.includes('"') || value.includes("\\") || value.includes("\n")) return "";
  return value;
}

/** A Portrait() qeval is shown only when it is one https URL. */
export function safePortrait(data: string): string {
  return artUrl(quotedName(data));
}

let loaded: Promise<OnyxFishStatus> | null = null;

export function loadOnyxFish(): Promise<OnyxFishStatus> {
  if (!loaded) {
    loaded = arcMinted((data) => arcCall(data, ARC_NFT))
      .then((minted): OnyxFishStatus => (minted === null
        ? { kind: "unread" }
        : { kind: "live", name: "FISH", minted, portrait: "" }))
      .catch(() => ({ kind: "unread" as const }));
  }
  return loaded;
}

function quotedName(data: string): string {
  const quoted = data.match(/"((?:\\.|[^"\\])*)"/);
  if (quoted) return quoted[1];
  const bare = data.match(/^\(\s*([A-Za-z0-9 ]+)\s+string\)$/);
  return bare ? bare[1] : "";
}

export type TrialRead = { sealed: boolean; strike: number | null };

/** fishcoin Sealed() and fishlab Strike(69, 88). A log means the read failed. */
export function trialFacts(sealedData: string, sealedLog: string, strikeData: string): TrialRead {
  if (sealedLog.trim()) return { sealed: false, strike: null };
  const sealed = /\(\s*true\s+bool\)/.test(sealedData);
  const strike = leadingInt(strikeData);
  return { sealed, strike };
}

export function trialLine(read: TrialRead): string {
  if (read.sealed && read.strike === 36) {
    return "Damage on 69 and 88 is 36. This page does not send an upgrade payment.";
  }
  if (read.sealed) {
    return "The strike read did not return the expected damage. This page does not send an upgrade payment.";
  }
  return "Arc status unread. This page does not send an upgrade payment.";
}

export type BayRead = { strike: number | null; spender: string; realm: string };

/** fishbay Strike(69, 88), fishmark Spender(), and fishbay Realm(). A log means the read failed. */
export function bayFacts(
  strikeData: string,
  strikeLog: string,
  spenderData: string,
  spenderLog: string,
  realmData: string,
  realmLog: string,
): BayRead {
  if (strikeLog.trim() || spenderLog.trim() || realmLog.trim()) return { strike: null, spender: "", realm: "" };
  return {
    strike: leadingInt(strikeData),
    spender: quotedName(spenderData),
    realm: quotedName(realmData),
  };
}

export function bayLine(read: BayRead): string {
  if (read.strike === 36 && read.spender !== "" && read.spender === read.realm) {
    return "Bite damage on 69 and 88 is 36. The spender matches the recorded address. Bites stay in this browser.";
  }
  if (read.strike === 36) {
    return "Bite damage on 69 and 88 is 36. The spender does not match the recorded address. Bites stay in this browser.";
  }
  return "Sea status unread. Bites stay in this browser.";
}

export type DuelRead = { version: string; strike: number | null; open: boolean | null };

/** fishduel Version(), Strike(69, 88), and BoutOpen(). A log means the read failed. */
export function duelFacts(
  versionData: string,
  versionLog: string,
  strikeData: string,
  strikeLog: string,
  openData: string,
  openLog: string,
): DuelRead {
  if (versionLog.trim() || strikeLog.trim() || openLog.trim()) return { version: "", strike: null, open: null };
  return {
    version: quotedName(versionData),
    strike: leadingInt(strikeData),
    open: boolOf(openData),
  };
}

export function duelLine(read: DuelRead): string {
  if (read.version === "fishduel-1" && read.strike === 36 && read.open === false) {
    return "The duel record is fishduel-1. Damage on 69 and 88 is 36. The bout is closed. This page does not send Settle.";
  }
  if (read.version === "fishduel-1" && read.strike === 36 && read.open === true) {
    return "The duel record is fishduel-1. Damage on 69 and 88 is 36. A bout is open. This page does not send Settle.";
  }
  if (read.version === "fishduel-1" && read.strike === 36) {
    return "The duel record is fishduel-1. Damage on 69 and 88 is 36. This page does not send Settle.";
  }
  return "Duel status unread. This page does not send Settle.";
}

export function trialStatus(coin: TrialRead, bay: BayRead, duel: DuelRead): string {
  return `${trialLine(coin)} ${bayLine(bay)} ${duelLine(duel)}`;
}

export function unreadTrialLine(): string {
  return trialStatus(
    { sealed: false, strike: null },
    { strike: null, spender: "", realm: "" },
    { version: "", strike: null, open: null },
  );
}

let trialLoaded: Promise<string> | null = null;

export function loadTrial(): Promise<string> {
  if (!trialLoaded) {
    trialLoaded = readTrial().catch(() => unreadTrialLine());
  }
  return trialLoaded;
}

async function readTrial(): Promise<string> {
  const sealed = await onyxEval(`${FISH_COIN_PKG}.Sealed()`);
  const strike = await onyxEval(`${FISH_LAB_PKG}.Strike(69, 88)`);
  const bayStrike = await onyxEval(`${FISH_BAY_PKG}.Strike(69, 88)`);
  const spender = await onyxEval(`${FISH_MARK_PKG}.Spender()`);
  const realm = await onyxEval(`${FISH_BAY_PKG}.Realm()`);
  const duelVersion = await onyxEval(`${FISH_DUEL_PKG}.Version()`);
  const duelStrike = await onyxEval(`${FISH_DUEL_PKG}.Strike(69, 88)`);
  const duelOpen = await onyxEval(`${FISH_DUEL_PKG}.BoutOpen()`);
  return trialStatus(
    trialFacts(sealed.data, sealed.log, strike.data),
    bayFacts(bayStrike.data, bayStrike.log, spender.data, spender.log, realm.data, realm.log),
    duelFacts(duelVersion.data, duelVersion.log, duelStrike.data, duelStrike.log, duelOpen.data, duelOpen.log),
  );
}

function boolOf(data: string): boolean | null {
  if (/\(\s*true\s+bool\)/.test(data)) return true;
  if (/\(\s*false\s+bool\)/.test(data)) return false;
  return null;
}

function leadingInt(data: string): number | null {
  const match = data.match(/-?\d+/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
}

export async function onyxEval(expr: string): Promise<{ data: string; log: string }> {
  const hex = Array.from(new TextEncoder().encode(expr), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const url = `${ONYX_RPC}/abci_query?path=${encodeURIComponent('"vm/qeval"')}&data=0x${hex}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("rpc");
  const body = (await response.json()) as {
    result?: { response?: { ResponseBase?: { Data?: string; Log?: string } } };
  };
  const raw = body.result?.response?.ResponseBase?.Data ?? "";
  const log = body.result?.response?.ResponseBase?.Log ?? "";
  return { data: raw ? decodeB64(raw) : "", log };
}

function decodeB64(data: string): string {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
