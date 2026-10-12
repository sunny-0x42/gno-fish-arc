import { useEffect, useState } from "react";
import { ARC_CHAIN_ID, isArcAddress } from "./arc";

/** A gno.land address. Arc sessions use a 0x account instead. */
export const G1_ADDRESS = /^g1[0-9a-z]{6,}$/;

/** A gno.land account is 40 characters. Practice addresses such as g1shoal1… are shorter. */
export function chainAddress(value: string): boolean {
  return /^g1[0-9a-z]{38}$/.test(value.trim());
}

export type WalletSession = {
  address: string;
  chainId: string;
  /** Ugnot reported by Adena. Null until GetAccount returns a coins string. */
  ugnot?: number | null;
};

/** Sum of ugnot amounts in an Adena coins string. Other denoms are ignored. */
export function ugnotOfCoins(coins: unknown): number | null {
  if (typeof coins !== "string" || coins.trim() === "") return null;
  let total = 0;
  let found = false;
  for (const part of coins.split(",")) {
    const match = part.trim().match(/^(\d+)ugnot$/);
    if (!match) continue;
    const value = Number(match[1]);
    if (!Number.isSafeInteger(value)) return null;
    total += value;
    found = true;
  }
  return found && Number.isSafeInteger(total) ? total : null;
}

const empty: WalletSession = { address: "", chainId: "", ugnot: null };
let session: WalletSession = empty;
let chainBusy = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function readSession(): WalletSession {
  return session;
}

export function chainIsBusy(): boolean {
  return chainBusy;
}

export function writeSession(next: WalletSession): void {
  const ugnot = next.ugnot !== undefined ? next.ugnot : session.address === next.address ? (session.ugnot ?? null) : null;
  if (session.address === next.address && session.chainId === next.chainId && (session.ugnot ?? null) === ugnot) return;
  session = { address: next.address, chainId: next.chainId, ugnot };
  emit();
}

export function clearSession(): void {
  writeSession(empty);
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Signer only while this page's wallet is an Arc testnet address. */
export function onyxSigner(current: WalletSession = session): string | null {
  if (current.chainId !== ARC_CHAIN_ID) return null;
  const address = current.address.trim();
  if (!isArcAddress(address)) return null;
  return address;
}

export function beginChain(): boolean {
  if (chainBusy) return false;
  chainBusy = true;
  emit();
  return true;
}

export function endChain(): void {
  if (!chainBusy) return;
  chainBusy = false;
  emit();
}

/** One Adena prompt at a time. A second click hears "busy" and sends nothing. */
export async function withChain<T>(run: () => Promise<T>): Promise<T | "busy"> {
  if (!beginChain()) return "busy";
  try {
    return await run();
  } finally {
    endChain();
  }
}

export function useOnyxWallet(): { address: string; chainId: string; signer: string | null; busy: boolean; ugnot: number | null } {
  const [current, setCurrent] = useState(readSession);
  const [busy, setBusy] = useState(chainIsBusy);
  useEffect(() => subscribeSession(() => {
    setCurrent(readSession());
    setBusy(chainIsBusy());
  }), []);
  return {
    address: current.address,
    chainId: current.chainId,
    signer: onyxSigner(current),
    busy,
    ugnot: typeof current.ugnot === "number" ? current.ugnot : null,
  };
}
