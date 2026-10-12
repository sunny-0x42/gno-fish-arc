/** Arc testnet contracts for Shoal. The sea opens only after a 1 USDC pool stake. */

export const ARC_CHAIN_ID = "5042002";
export const ARC_CHAIN_HEX = "0x4cef52";
export const ARC_NAME = "Arc Testnet";
export const ARC_RPC = "https://rpc.testnet.arc.io";
export const ARC_EXPLORER = "https://explorer.testnet.arc.io";
export const ARC_DUEL = "0x2Cbb115ccb69c8bae2FB2FCdAa68B80dBa0d0670";
export const ARC_PROFILE = "0x6130bC38A58bd658c04152673d50C0339C86D6C3";
export const ARC_PARTY = "0x285F5345AD2f1421F53f29Fa1F3Cd77fef4e63Be";
export const ARC_NFT = "0x02081A2efBb0F14d4DEBfA5aa4D16E62E91373da";
export const ARC_FISH = "0x0441c265496029829Ac79942dC917ECFdAb1d2a3";
export const ARC_EARN = "0x7241E458Ed2ead6156045D61E6283Bda86A39293";
export const ARC_UNIT = 10n ** 18n;
/** fish-arc-5 collection mint. The page sends this to ARC_NFT. */
export const ARC_COLLECTION_WHOLE = 5n;
export const ARC_COLLECTION_MINT = ARC_COLLECTION_WHOLE * ARC_UNIT;
/** 1 USDC, stored the same way formatGnot stores 1 USDC. */
export const ARC_MINT_MICRO = 1_000_000;
/** Collection mint, in the same micro units as ARC_MINT_MICRO. */
export const ARC_COLLECTION_MICRO = 5_000_000;

export const ARC_SEL = {
  minted: "0x4f02c420",
  ownerOf: "0x6352211e",
  nameOf: "0x051a2664",
  inSea: "0xc37c7d47",
  ended: "0x861a3689",
  mint: "0xd85d3d27",
  collectionMint: "0xd85d3d27",
  rarityOf: "0xdd3b5f9a",
  traitOf: "0xeb4d82c8",
  tokensOf: "0x5a3f2672",
  markOf: "0x9dd5c31f",
  poolOf: "0x83966021",
  register: "0xf1c6480d",
  leave: "0x67dfd4c9",
  setProfile: "0x52640314",
  createParty: "0xb6a46b3b",
  invite: "0x4b77c468",
  accept: "0x2852b71c",
  award: "0xce9bafe2",
  balanceOf: "0x70a08231",
} as const;

const TRIAL_ONLY = "This page sends mint, register, leave, profile, party, and award. Other calls stay in the browser.";

export type Eip1193 = {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

export type ArcCall = (data: string) => Promise<string>;

export function isArcAddress(value: string): boolean {
  return /^0x[0-9a-f]{40}$/.test(value.trim().toLowerCase());
}

/** Chain mint names are 1–16 lowercase letters or digits. Other marks are dropped. */
export function arcFishName(raw: string): string | null {
  const name = raw.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16);
  return name.length > 0 ? name : null;
}

/** FishNFT names keep case and spaces. One to twenty letters, digits, or spaces. */
export function collectionNameOk(raw: string): boolean {
  return /^[A-Za-z0-9 ]{1,20}$/.test(raw);
}

export function chainIdOf(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const text = raw.trim().toLowerCase();
  if (/^0x[0-9a-f]+$/.test(text)) return BigInt(text).toString(10);
  if (/^[0-9]+$/.test(text)) return text;
  return "";
}

export function firstAddress(accounts: unknown): string | null {
  if (!Array.isArray(accounts) || typeof accounts[0] !== "string") return null;
  const address = accounts[0].trim();
  return isArcAddress(address) ? address : null;
}

const announced: Eip1193[] = [];
let watching = false;

function usable(value: unknown): value is Eip1193 {
  return Boolean(value) && typeof value === "object" && typeof (value as Eip1193).request === "function";
}

/** MetaMask can inject late, or hide behind EIP-6963 while another wallet owns window.ethereum. */
export function watchEthereum(): void {
  if (watching || typeof window === "undefined") return;
  watching = true;
  window.addEventListener("eip6963:announceProvider", (event) => {
    const provider = (event as CustomEvent<{ provider?: unknown }>).detail?.provider;
    if (usable(provider)) announced.push(provider);
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

export function readEthereum(): Eip1193 | undefined {
  if (typeof window === "undefined") return undefined;
  watchEthereum();
  const eth = (window as Window & { ethereum?: Eip1193 & { providers?: unknown[]; isMetaMask?: boolean } }).ethereum;
  const list: Eip1193[] = [];
  if (eth && Array.isArray(eth.providers)) {
    for (const item of eth.providers) if (usable(item)) list.push(item);
  }
  if (usable(eth)) list.push(eth);
  list.push(...announced);
  const meta = list.find((item) => (item as { isMetaMask?: boolean }).isMetaMask);
  return meta ?? list[0];
}

export function waitForEthereum(ms = 8000): Promise<Eip1193 | null> {
  const found = readEthereum();
  if (found) return Promise.resolve(found);
  if (typeof window === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    let done = false;
    const finish = (provider: Eip1193 | null) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      window.clearInterval(poll);
      window.removeEventListener("ethereum#initialized", look);
      window.removeEventListener("eip6963:announceProvider", look);
      resolve(provider);
    };
    const look = () => {
      const provider = readEthereum();
      if (provider) finish(provider);
    };
    const poll = window.setInterval(look, 100);
    const timer = window.setTimeout(() => finish(readEthereum() ?? null), ms);
    window.addEventListener("ethereum#initialized", look);
    window.addEventListener("eip6963:announceProvider", look);
  });
}

function word(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

export function abiEncodeString(value: string): string {
  return abiEncodeStrings([value]);
}

/** ABI-encode one or more dynamic strings. The head is the offsets. */
export function abiEncodeStrings(values: string[]): string {
  const bodies = values.map((value) => {
    const bytes = new TextEncoder().encode(value);
    let hex = "";
    for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
    const pad = (32 - (bytes.length % 32)) % 32;
    return `${word(BigInt(bytes.length))}${hex}${"00".repeat(pad)}`;
  });
  let head = "";
  let cursor = 32 * values.length;
  for (const body of bodies) {
    head += word(BigInt(cursor));
    cursor += body.length / 2;
  }
  return `0x${head}${bodies.join("")}`;
}

export function mintCalldata(name: string): string {
  return `${ARC_SEL.mint}${abiEncodeString(name).slice(2)}`;
}

export function registerCalldata(id: bigint, stake: bigint, mark: string): string {
  const addr = mark.toLowerCase().replace(/^0x/, "");
  return `${ARC_SEL.register}${word(id)}${word(stake)}${addr.padStart(64, "0")}`;
}

export function leaveCalldata(id: bigint): string {
  return `${ARC_SEL.leave}${word(id)}`;
}

export function uintCall(selector: string, id: bigint): string {
  return `${selector}${word(id)}`;
}

export function addressCall(selector: string, who: string): string {
  return `${selector}${who.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}

export function collectionMintCalldata(name: string): string {
  return `${ARC_SEL.collectionMint}${abiEncodeString(name).slice(2)}`;
}

export function decodeUintArray(data: string): bigint[] | null {
  const hex = data.trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]*$/.test(hex) || hex.length < 128 || hex.length % 2 !== 0) return null;
  const offset = Number(BigInt(`0x${hex.slice(0, 64)}`)) * 2;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset + 64 > hex.length) return null;
  const len = Number(BigInt(`0x${hex.slice(offset, offset + 64)}`));
  if (!Number.isSafeInteger(len) || len < 0 || len > 64) return null;
  const start = offset + 64;
  if (start + len * 64 > hex.length) return null;
  const out: bigint[] = [];
  for (let i = 0; i < len; i += 1) out.push(BigInt(`0x${hex.slice(start + i * 64, start + i * 64 + 64)}`));
  return out;
}

export function decodeUint(data: string): bigint | null {
  const hex = data.trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]*$/.test(hex) || hex.length < 64) return null;
  return BigInt(`0x${hex.slice(-64)}`);
}

export function decodeAddress(data: string): string | null {
  const hex = data.trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]*$/.test(hex) || hex.length < 64) return null;
  return `0x${hex.slice(-64).slice(24)}`;
}

export function decodeBool(data: string): boolean | null {
  const value = decodeUint(data);
  return value === null ? null : value !== 0n;
}

export function decodeString(data: string): string | null {
  const hex = data.trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]*$/.test(hex) || hex.length < 128 || hex.length % 2 !== 0) return null;
  const offset = Number(BigInt(`0x${hex.slice(0, 64)}`)) * 2;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset + 64 > hex.length) return null;
  const len = Number(BigInt(`0x${hex.slice(offset, offset + 64)}`));
  if (!Number.isSafeInteger(len) || len < 0) return null;
  const start = offset + 64;
  const end = start + len * 2;
  if (end > hex.length) return null;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) bytes[i] = Number.parseInt(hex.slice(start + i * 2, start + i * 2 + 2), 16);
  return new TextDecoder().decode(bytes);
}

const USDC_MICRO = 1_000_000n;
const WEI_PER_MICRO = 10n ** 12n;

/**
 * Typed pool stake in purse micro units.
 * At least 1.00 USDC. Hundredths only. The duel floor is 1 USDC and there is no contract ceiling here.
 */
export function poolStakeMicro(raw: string): number | null {
  const text = raw.trim().replace(/,/g, "");
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(text)) return null;
  const [whole, frac = ""] = text.split(".");
  if (whole.length > 1 && whole.startsWith("0")) return null;
  const micro = BigInt(whole) * USDC_MICRO + BigInt(frac.padEnd(2, "0")) * 10_000n;
  if (micro < USDC_MICRO || micro > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(micro);
}

/** Purse micro units to the 18-decimal value FishDuel.register expects. */
export function microToWei(micro: number): bigint | null {
  if (!Number.isSafeInteger(micro) || micro < Number(USDC_MICRO)) return null;
  return BigInt(micro) * WEI_PER_MICRO;
}

/** Native USDC wei to the micro unit the purse labels already print. */
export function weiToMicro(wei: bigint): number | null {
  if (wei < 0n) return null;
  const micro = wei / 10n ** 12n;
  if (micro > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(micro);
}

const ARC_CHAIN_PARAMS = {
  chainId: ARC_CHAIN_HEX,
  chainName: ARC_NAME,
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: [ARC_RPC, "https://rpc.testnet.arc.network"],
  blockExplorerUrls: [ARC_EXPLORER, "https://testnet.arcscan.app"],
};

type WalletFault = { code?: unknown; message?: unknown; data?: { code?: unknown; message?: unknown; originalError?: { code?: unknown; message?: unknown } } };

function faultOf(err: unknown): WalletFault {
  return err && typeof err === "object" ? err as WalletFault : {};
}

export function walletError(err: unknown): string {
  const row = faultOf(err);
  const nested = row.data?.originalError?.message ?? row.data?.message ?? row.message;
  if (typeof nested === "string" && nested.trim()) return nested.trim();
  if (err instanceof Error && err.message) return err.message;
  return "The wallet declined.";
}

function errorCode(err: unknown): number {
  const row = faultOf(err);
  const code = row.code ?? row.data?.originalError?.code ?? row.data?.code;
  return Number(code);
}

function missingChain(err: unknown): boolean {
  if (errorCode(err) === 4902) return true;
  return /unrecognized|unknown chain|not been added|try adding the chain|wallet_addethereumchain/i.test(walletError(err));
}

async function onArc(eth: Eip1193): Promise<boolean> {
  return chainIdOf(await eth.request({ method: "eth_chainId" })) === ARC_CHAIN_ID;
}

async function addArc(eth: Eip1193): Promise<{ ok: true } | { ok: false; detail: string }> {
  try {
    await eth.request({ method: "wallet_addEthereumChain", params: [ARC_CHAIN_PARAMS] });
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ARC_CHAIN_HEX }] });
    if (await onArc(eth)) return { ok: true };
    return { ok: false, detail: "The wallet stayed off Arc testnet." };
  } catch (err) {
    return { ok: false, detail: walletError(err) };
  }
}

/** Switch to Arc testnet. A wallet that does not know the chain gets an add prompt, then a switch. */
export async function ensureArcChain(eth: Eip1193): Promise<{ ok: true } | { ok: false; detail: string }> {
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ARC_CHAIN_HEX }] });
    if (await onArc(eth)) return { ok: true };
  } catch (err) {
    if (!missingChain(err)) return { ok: false, detail: walletError(err) };
  }
  return addArc(eth);
}

export async function arcBalanceMicro(eth: Eip1193, address: string): Promise<number | null> {
  try {
    const raw = await eth.request({ method: "eth_getBalance", params: [address, "latest"] });
    if (typeof raw !== "string" || !/^0x[0-9a-f]+$/i.test(raw)) return null;
    return weiToMicro(BigInt(raw));
  } catch {
    return null;
  }
}

export async function arcCall(data: string, to = ARC_DUEL): Promise<string> {
  const response = await fetch(ARC_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
  });
  if (!response.ok) throw new Error(`Arc RPC ${response.status}`);
  const body = await response.json() as { result?: unknown; error?: { message?: string } };
  if (body.error) throw new Error(body.error.message || "Arc RPC error");
  if (typeof body.result !== "string") throw new Error("Arc call returned no data");
  return body.result;
}

/** `award(uint256,uint256)` on FishEarn. */
export function awardCalldata(id: bigint, target: bigint): string {
  return `${ARC_SEL.award}${id.toString(16).padStart(64, "0")}${target.toString(16).padStart(64, "0")}`;
}

/** FISH balance in 6-decimal units. One FISH is 1_000_000. */
export async function arcFishBalance(who: string): Promise<bigint | null> {
  if (!isArcAddress(who)) return null;
  try {
    const data = `${ARC_SEL.balanceOf}${who.slice(2).toLowerCase().padStart(64, "0")}`;
    const value = decodeUint(await arcCall(data, ARC_FISH));
    return value;
  } catch {
    return null;
  }
}

export async function arcMinted(call: ArcCall = arcCall): Promise<number | null> {
  const value = decodeUint(await call(ARC_SEL.minted));
  if (value === null || value > 10_000n) return null;
  return Number(value);
}

const ZERO_ADDRESS = `0x${"0".repeat(40)}`;

/**
 * FishDuel id this wallet currently has in the sea.
 * `leave` reverts on any other id. A spent seat keeps its number, and that number
 * can match a collection token, so Leave must not reuse the stored id blindly.
 * Throws when the roster cannot be read, so the page does not treat a missed seat as empty.
 */
export async function seatedDuelId(owner: string, call: ArcCall = arcCall): Promise<number | null> {
  if (!isArcAddress(owner)) return null;
  const minted = await arcMinted(call);
  if (minted === null) throw new Error("Arc seat unread");
  if (minted < 1) return null;
  const who = owner.trim().toLowerCase();
  const limit = Math.min(minted, 8);
  for (let id = limit; id >= 1; id -= 1) {
    const [ownerRaw, seaRaw] = await Promise.all([
      call(uintCall(ARC_SEL.ownerOf, BigInt(id))),
      call(uintCall(ARC_SEL.inSea, BigInt(id))),
    ]);
    const holder = decodeAddress(ownerRaw);
    const inSea = decodeBool(seaRaw);
    if (holder === who && inSea === true) return id;
  }
  return null;
}

/** A FishDuel id this wallet can still register. A used seat stays closed after Leave. */
export async function freeDuelSeat(owner: string, call: ArcCall = arcCall): Promise<number | null> {
  if (!isArcAddress(owner)) return null;
  const minted = await arcMinted(call);
  if (minted === null || minted < 1) return null;
  const who = owner.trim().toLowerCase();
  const limit = Math.min(minted, 8);
  for (let id = limit; id >= 1; id -= 1) {
    try {
      const [ownerRaw, seaRaw, endedRaw, markRaw] = await Promise.all([
        call(uintCall(ARC_SEL.ownerOf, BigInt(id))),
        call(uintCall(ARC_SEL.inSea, BigInt(id))),
        call(uintCall(ARC_SEL.ended, BigInt(id))),
        call(uintCall(ARC_SEL.markOf, BigInt(id))),
      ]);
      const holder = decodeAddress(ownerRaw);
      const inSea = decodeBool(seaRaw);
      const ended = decodeBool(endedRaw);
      const mark = decodeAddress(markRaw);
      if (holder === who && inSea === false && ended === false && (mark === null || mark === ZERO_ADDRESS)) return id;
    } catch {
      continue;
    }
  }
  return null;
}

/** True once the transaction is mined successfully. A revert or a timeout is false. */
export async function arcTxOk(hash: string): Promise<boolean> {
  if (!/^0x[0-9a-f]{64}$/i.test(hash)) return false;
  const started = Date.now();
  while (Date.now() - started < 45_000) {
    try {
      const response = await fetch(ARC_RPC, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [hash] }),
      });
      if (response.ok) {
        const body = await response.json() as { result?: { status?: string } | null };
        if (body.result?.status === "0x1") return true;
        if (body.result?.status === "0x0") return false;
      }
    } catch {
      // The next poll retries a dropped response.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

function decimalId(raw: string | undefined): bigint | null {
  if (!raw || !/^[1-9][0-9]*$/.test(raw)) return null;
  return BigInt(raw);
}

export async function sendArc(
  eth: Eip1193,
  from: string,
  call: { func: string; args: string[] },
): Promise<{ ok: true; hash: string } | { ok: false; detail: string }> {
  let data = "";
  let value = 0n;
  let to = ARC_DUEL;
  if (call.func === "Mint") {
    const name = arcFishName(call.args[0] ?? "");
    if (!name) return { ok: false, detail: "Arc mint names need at least one letter or digit, up to 16." };
    data = mintCalldata(name);
    value = ARC_UNIT;
  } else if (call.func === "MintCollection") {
    const fishName = (call.args[0] ?? "").trim();
    if (!collectionNameOk(fishName)) {
      return { ok: false, detail: "A Shoal fish name needs 1 to 20 letters, digits, or spaces." };
    }
    data = collectionMintCalldata(fishName);
    value = ARC_COLLECTION_MINT;
    to = ARC_NFT;
  } else if (call.func === "Register") {
    const id = decimalId(call.args[0]);
    const stake = microToWei(Number(call.args[1]));
    if (id === null) return { ok: false, detail: "This id stays in the browser." };
    if (stake === null) return { ok: false, detail: "The pool stake is at least 1 USDC." };
    if (!isArcAddress(from)) return { ok: false, detail: "Connect a wallet on Arc testnet." };
    data = registerCalldata(id, stake, from);
    value = stake;
  } else if (call.func === "Leave") {
    const id = decimalId(call.args[0]);
    if (id === null) return { ok: false, detail: "This id stays in the browser." };
    data = leaveCalldata(id);
  } else if (call.func === "SetProfile") {
    const username = (call.args[0] ?? "").trim();
    const country = call.args[1] ?? "";
    const crest = call.args[2] ?? "";
    if (username.length < 3 || username.length > 16) {
      return { ok: false, detail: "Username needs 3 to 16 letters or digits." };
    }
    data = `${ARC_SEL.setProfile}${abiEncodeStrings([username, country, crest]).slice(2)}`;
    to = ARC_PROFILE;
  } else if (call.func === "Create") {
    const name = call.args[0] ?? "";
    if (name.length < 1 || name.length > 16) {
      return { ok: false, detail: "Party name needs 1 to 16 letters, digits, or spaces." };
    }
    data = `${ARC_SEL.createParty}${abiEncodeString(name).slice(2)}`;
    to = ARC_PARTY;
  } else if (call.func === "Invite") {
    const who = (call.args[0] ?? "").trim();
    if (!isArcAddress(who)) return { ok: false, detail: "An Arc invite needs a 0x address." };
    if (who.toLowerCase() === from.toLowerCase()) return { ok: false, detail: "That is your own address." };
    data = `${ARC_SEL.invite}${who.toLowerCase().slice(2).padStart(64, "0")}`;
    to = ARC_PARTY;
  } else if (call.func === "Accept") {
    data = ARC_SEL.accept;
    to = ARC_PARTY;
  } else if (call.func === "Award") {
    const id = decimalId(call.args[0]);
    const target = decimalId(call.args[1]);
    if (id === null || target === null || id === target) {
      return { ok: false, detail: "Both seated fish need chain ids." };
    }
    data = awardCalldata(id, target);
    to = ARC_EARN;
  } else {
    return { ok: false, detail: TRIAL_ONLY };
  }
  try {
    const hash = await eth.request({
      method: "eth_sendTransaction",
      params: [{ from, to, data, value: `0x${value.toString(16)}` }],
    });
    if (typeof hash !== "string" || !/^0x[0-9a-f]+$/i.test(hash)) {
      return { ok: false, detail: "The wallet did not return a transaction." };
    }
    return { ok: true, hash };
  } catch (err) {
    return { ok: false, detail: walletError(err) };
  }
}

/** Highest FishDuel id this wallet owns that the browser has not attached. */
export async function freshArcToken(owner: string, used: readonly number[], call: ArcCall = arcCall): Promise<number | null> {
  const minted = await arcMinted(call);
  if (minted === null) return null;
  const held = new Set(used);
  const who = owner.trim().toLowerCase();
  let next = 0;
  const limit = Math.min(minted, 8);
  for (let id = 1; id <= limit; id += 1) {
    if (held.has(id)) continue;
    const addr = decodeAddress(await call(uintCall(ARC_SEL.ownerOf, BigInt(id))));
    if (addr === who && id > next) next = id;
  }
  return next > 0 ? next : null;
}
