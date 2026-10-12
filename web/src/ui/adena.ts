import { type OnyxPayload, type TxResult } from "../chain/adenaTx";
import { ARC_CHAIN_ID, arcBalanceMicro, ensureArcChain, readEthereum, sendArc, firstAddress, walletError, type Eip1193 } from "../chain/arc";
import type { RealmCall } from "../chain/realmCalls";
import { ugnotOfCoins, withChain, writeSession } from "../chain/session";

/** Short g1 address for the top bar. The full address stays on the button title. */
export function shortAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Adena `AddEstablish` succeeded. A refusal stays on the connect button. */
export function established(result: unknown): boolean {
  return Boolean(result) && typeof result === "object" && (result as { status?: unknown }).status === "success";
}

/**
 * Adena returns failure type ALREADY_CONNECTED when this site is already approved.
 * That is a connected wallet, not a refusal.
 */
export function alreadyLinked(result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  const row = result as { type?: unknown; message?: unknown };
  const text = `${String(row.type ?? "")} ${String(row.message ?? "")}`.toLowerCase();
  return text.includes("already_connected") || text.includes("already connected");
}

/** Address from `GetAccount`. Public keys are ignored. */
export function accountAddress(result: unknown): string | null {
  if (!established(result)) return null;
  const data = (result as { data?: { address?: unknown } }).data;
  const address = data && typeof data.address === "string" ? data.address : "";
  if (!/^g1[0-9a-z]{6,}$/.test(address)) return null;
  return address;
}

/** Adena `SwitchNetwork` / `AddNetwork` reply, or a thrown message. */
export type NetworkStep = "ok" | "missing" | "declined";

export const ONYX_NETWORK = {
  chainId: "onyx-1",
  chainName: "Onyx",
  rpcUrl: "https://rpc.onyx.testnets.gno.land:443",
};

type NetworkReply = { status?: unknown; type?: unknown; message?: unknown; code?: unknown };

function replyText(result: unknown): string {
  if (result instanceof Error) return result.message.toLowerCase();
  if (typeof result === "string") return result.toLowerCase();
  if (!result || typeof result !== "object") return "";
  const row = result as NetworkReply;
  return `${row.status ?? ""} ${row.type ?? ""} ${row.message ?? ""}`.toLowerCase();
}

/** Classify one Adena network reply. Already-on-Onyx and already-added count as ok. */
export function networkStep(result: unknown): NetworkStep {
  const text = replyText(result);
  if (text.includes("unadded") || text.includes("not been added") || text.includes("not been initialized") || text.includes("not_initialized")) {
    return "missing";
  }
  const saved = text.includes("already") || text.includes("same") || text.includes("redundant");
  if (!result || typeof result !== "object" || result instanceof Error) return saved ? "ok" : "declined";
  const row = result as NetworkReply;
  if (row.status === "failure") return saved ? "ok" : "declined";
  if (row.status === "success" || row.code === 0 || saved) return "ok";
  return "declined";
}

export type OnyxWallet = {
  AddEstablish?: (name: string) => Promise<unknown>;
  GetAccount?: () => Promise<unknown>;
  AddNetwork?: (network: { chainId: string; chainName: string; rpcUrl: string }) => Promise<unknown>;
  SwitchNetwork?: (chainId: string | { chainId: string }) => Promise<unknown>;
  DoContract?: (payload: OnyxPayload) => Promise<unknown>;
};

async function ask(call: (() => Promise<unknown>) | undefined): Promise<NetworkStep> {
  if (!call) return "missing";
  try {
    return networkStep(await call());
  } catch (err) {
    return networkStep(err instanceof Error ? err : String(err));
  }
}

/**
 * Ask Adena to use onyx-1. Switch first. Add the network only when Adena says it is missing.
 * A refusal stops. This does not send a realm call.
 */
export async function requestOnyx(wallet: OnyxWallet): Promise<"onyx" | "declined"> {
  const first = await ask(wallet.SwitchNetwork ? () => wallet.SwitchNetwork!(ONYX_NETWORK.chainId) : undefined);
  if (first === "ok") return "onyx";
  if (first === "declined") return "declined";
  const added = await ask(wallet.AddNetwork ? () => wallet.AddNetwork!(ONYX_NETWORK) : undefined);
  if (added !== "ok") return "declined";
  const second = await ask(wallet.SwitchNetwork ? () => wallet.SwitchNetwork!(ONYX_NETWORK.chainId) : undefined);
  return second === "ok" ? "onyx" : "declined";
}

/** Address, chain id, and ugnot from `GetAccount`. A missing chain id stays "". */
export function accountView(result: unknown): { address: string; chainId: string; ugnot: number | null } | null {
  const address = accountAddress(result);
  if (!address) return null;
  const data = (result as { data?: { chainId?: unknown; coins?: unknown } }).data;
  const raw = data && data.chainId;
  const chainId = typeof raw === "string" && raw.length > 0 ? raw : "";
  return { address, chainId, ugnot: ugnotOfCoins(data?.coins) };
}

export type OnyxReady = { ok: true; signer: string } | { ok: false; detail: string };

/**
 * Open the Ethereum wallet for this click. Connect, switch to Arc testnet, then the caller signs.
 * A missing wallet or a refusal does not pretend the call was sent.
 */
let connecting: Promise<OnyxReady> | null = null;

export function needsUserGesture(detail: string): boolean {
  return /user gesture|user activation|pending request|already pending|must be triggered/i.test(detail);
}

async function connectArc(_wallet?: OnyxWallet, eth?: Eip1193): Promise<OnyxReady> {
  void _wallet;
  const provider = eth ?? readEthereum();
  if (!provider) return { ok: false, detail: "Install an Ethereum wallet, then try again." };
  let accounts: unknown;
  try {
    accounts = await provider.request({ method: "eth_requestAccounts" });
  } catch (err) {
    return { ok: false, detail: walletError(err) };
  }
  const address = firstAddress(accounts);
  if (!address) return { ok: false, detail: "The wallet did not return an account." };
  const chain = await ensureArcChain(provider);
  if (!chain.ok) return chain;
  const ugnot = await arcBalanceMicro(provider, address);
  writeSession({ address, chainId: ARC_CHAIN_ID, ugnot });
  return { ok: true, signer: address };
}

/**
 * Open the Ethereum wallet, then switch it to Arc testnet.
 * A second caller waits for the prompt already on screen.
 */
export function ensureOnyxSigner(wallet?: OnyxWallet, eth?: Eip1193): Promise<OnyxReady> {
  if (connecting) return connecting;
  connecting = connectArc(wallet, eth).finally(() => {
    connecting = null;
  });
  return connecting;
}

/** Connect and switch, then send mint, register, or leave to FishDuel. Other calls stop here. */
export function openOnyx(call: RealmCall, _wallet?: OnyxWallet, eth?: Eip1193): Promise<TxResult | "busy"> {
  void _wallet;
  const provider = eth ?? (typeof window === "undefined" ? undefined : readEthereum());
  return withChain(async () => {
    const ready = await ensureOnyxSigner(undefined, provider);
    if (!ready.ok) return ready;
    if (!provider) return { ok: false, detail: "Install an Ethereum wallet, then try again." };
    const sent = await sendArc(provider, ready.signer, call);
    const ugnot = await arcBalanceMicro(provider, ready.signer);
    if (ugnot !== null) writeSession({ address: ready.signer, chainId: ARC_CHAIN_ID, ugnot });
    return sent;
  });
}
