import { FISH_PKG, realmIdArgs, type RealmCall } from "./realmCalls";

/** Adena gas for a shoal/fish call. Adena simulates far above this and rejects a higher wanted. */
export const ONYX_GAS_WANTED = 20_000_000;
export const ONYX_GAS_FEE = 40_000;

export type OnyxPayload = {
  messages: {
    type: "/vm.m_call";
    value: {
      caller: string;
      send: string;
      pkg_path: string;
      func: string;
      args: string[];
    };
  }[];
  gasFee: number;
  gasWanted: number;
  memo: string;
};

export type OnyxSender = {
  DoContract?: (payload: OnyxPayload) => Promise<unknown>;
};

export type TxResult = { ok: true; hash: string } | { ok: false; detail: string };

/** Adena signs `send` as a coin string. An array, a `tx` wrapper, or max_deposit breaks the doc. */
export function onyxMessage(call: RealmCall, caller: string): OnyxPayload {
  return {
    messages: [
      {
        type: "/vm.m_call",
        value: {
          caller,
          send: call.sendUgnot === "0" ? "" : `${call.sendUgnot}ugnot`,
          pkg_path: call.pkg,
          func: call.func,
          args: call.args.map(String),
        },
      },
    ],
    gasFee: ONYX_GAS_FEE,
    gasWanted: ONYX_GAS_WANTED,
    memo: "",
  };
}

export function fishNameOk(name: string): boolean {
  return name.length >= 1 && name.length <= 20 && /^[A-Za-z0-9 ]+$/.test(name);
}

export function partyNameOk(name: string): boolean {
  return name.length >= 1 && name.length <= 16 && /^[A-Za-z0-9 ]+$/.test(name);
}

/** TokensOf prints a quoted comma list. Ids that are not positive decimals are dropped. */
export function tokenIds(data: string): number[] {
  const quoted = data.match(/"((?:\\.|[^"\\])*)"/);
  const raw = quoted ? quoted[1] : /^[0-9,]+$/.test(data.trim()) ? data.trim() : "";
  if (!raw) return [];
  const ids: number[] = [];
  for (const part of raw.split(",")) {
    if (!/^[1-9][0-9]*$/.test(part)) continue;
    ids.push(Number(part));
  }
  return ids;
}

/** Highest token id in the read that this browser has not attached yet. */
export function freshTokenId(data: string, used: readonly number[]): number | null {
  const held = new Set(used);
  let next = 0;
  for (const id of tokenIds(data)) {
    if (held.has(id)) continue;
    if (id > next) next = id;
  }
  return next > 0 ? next : null;
}

export function txOutcome(result: unknown): TxResult {
  if (!result || typeof result !== "object" || result instanceof Error) {
    const detail = result instanceof Error && result.message ? result.message : "Adena declined the call.";
    return { ok: false, detail };
  }
  const row = result as { status?: unknown; message?: unknown; code?: unknown; data?: { hash?: unknown } };
  const hash = typeof row.data?.hash === "string" ? row.data.hash : "";
  if (row.status === "success" || (row.code === 0 && hash !== "")) return { ok: true, hash };
  const message = typeof row.message === "string" && row.message ? row.message : "Adena declined the call.";
  return { ok: false, detail: message };
}

export async function sendOnyx(call: RealmCall, caller: string, wallet: OnyxSender | undefined): Promise<TxResult> {
  if (!/^g1[0-9a-z]{6,}$/.test(caller)) return { ok: false, detail: "Connect Adena on onyx-1." };
  if (!realmIdArgs(call)) return { ok: false, detail: "This id stays in the browser." };
  if (!wallet?.DoContract) return { ok: false, detail: "Adena cannot send this call." };
  try {
    return txOutcome(await wallet.DoContract(onyxMessage(call, caller)));
  } catch (error) {
    const detail = error instanceof Error && error.message ? error.message : "Adena declined the call.";
    return { ok: false, detail };
  }
}

export function tokensOfExpr(address: string): string {
  return `${FISH_PKG}.TokensOf("${address}")`;
}
