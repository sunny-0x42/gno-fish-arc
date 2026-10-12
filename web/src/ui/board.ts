import { UGNOT } from "../sim/catalog";
import { formatFish, formatGnot } from "../sim/format";
import type { FishNft, ScoreLine } from "../sim/game";

/** Practice bites credit the fish that landed the kill. Assists stay 0. */
export const PRACTICE_ASSISTS = 0;

const KILL_PAY = /Killer ([0-9][0-9,]*(?:\.[0-9]+)?) USDC/;
const KILL_NOTICE = /^(.+) downed (.+)\. Killer ([0-9][0-9,]*(?:\.[0-9]+)?) USDC(?: and ([0-9][0-9,]*) FISH)?\.(?: Lost ([0-9][0-9,]*(?:\.[0-9]+)?) USDC\.)?/;

/** The USDC label already printed on a kill line. Null when the line is not a payout. */
export function killerGnotLabel(text: string): string | null {
  const found = KILL_PAY.exec(text);
  return found ? found[1] : null;
}

export type KillerPayout = {
  id: string;
  gnot: string;
  fish: string;
};

/** Newest kill payout for this fish. A later strike line does not hide it. */
export function killerPayout(
  log: { id: string; at: number; text: string; attackerId?: string }[],
  fishId: string,
  since: number,
): KillerPayout | null {
  if (!fishId) return null;
  for (const item of log) {
    if (item.at < since || item.attackerId !== fishId) continue;
    const notice = killNotice(item.text);
    if (!notice) continue;
    return { id: item.id, gnot: notice.amount, fish: notice.fish ?? "0" };
  }
  return null;
}

export type KillNotice = {
  attacker: string;
  victim: string;
  amount: string;
  fish: string | null;
  /** Covered stake taken from the fish that was downed. */
  lost: string | null;
};

/** Names, the killer share, and the stake the downed fish lost. */
export function killNotice(text: string): KillNotice | null {
  const found = KILL_NOTICE.exec(text);
  if (!found) return null;
  return { attacker: found[1], victim: found[2], amount: found[3], fish: found[4] ?? null, lost: found[5] ?? null };
}

export type FightLedger = {
  /** Ugnot the fish received as killer. */
  wonGnot: number;
  wonFish: number;
  /** Ugnot stake taken when this fish was downed. */
  lostGnot: number;
};

type LedgerLine = { at: number; text: string; attackerId?: string; victimId?: string };

function gnotLabelUgnot(label: string): number {
  const [whole, frac = ""] = label.replace(/,/g, "").split(".");
  const cents = `${frac}00`.slice(0, 2);
  const amount = Number(whole) * UGNOT + Number(cents) * 10_000;
  return Number.isSafeInteger(amount) ? amount : 0;
}

function fishLabel(label: string): number {
  const amount = Number(label.replace(/,/g, ""));
  return Number.isSafeInteger(amount) ? amount : 0;
}

/** Sum of this fish's kill rewards and the stake it lost, from lines still in the log. */
export function fightLedger(log: LedgerLine[], fishId: string, since: number): FightLedger {
  const totals: FightLedger = { wonGnot: 0, wonFish: 0, lostGnot: 0 };
  if (!fishId) return totals;
  for (const item of log) {
    if (item.at < since) continue;
    const notice = killNotice(item.text);
    if (!notice) continue;
    if (item.attackerId === fishId) {
      totals.wonGnot += gnotLabelUgnot(notice.amount);
      totals.wonFish += fishLabel(notice.fish ?? "0");
    }
    if (item.victimId === fishId && notice.lost) totals.lostGnot += gnotLabelUgnot(notice.lost);
  }
  return totals;
}

export function fightCreditLines(ledger: FightLedger): { won: string | null; lost: string | null } {
  const won = ledger.wonGnot > 0 || ledger.wonFish > 0
    ? `+${formatGnot(ledger.wonGnot)} USDC · +${formatFish(ledger.wonFish)} FISH`
    : null;
  const lost = ledger.lostGnot > 0 ? `-${formatGnot(ledger.lostGnot)} USDC · 0 FISH` : null;
  return { won, lost };
}

export type BoardRow = {
  id: string;
  name: string;
  kills: number;
  downs: number;
  assists: number;
  poolUgnot: number;
  yours: boolean;
};

type BoardFish = Pick<FishNft, "id" | "name" | "burned" | "poolUgnot">;

export function boardRows(fish: BoardFish[], scores: Record<string, ScoreLine>, youId: string | null): BoardRow[] {
  const rows: BoardRow[] = [];
  for (const item of fish) {
    if (item.burned) continue;
    const score = scores[item.id];
    rows.push({
      id: item.id,
      name: item.name,
      kills: score?.kills ?? 0,
      downs: score?.downs ?? 0,
      assists: PRACTICE_ASSISTS,
      poolUgnot: item.poolUgnot,
      yours: item.id === youId,
    });
  }
  rows.sort((a, b) => b.kills - a.kills || a.downs - b.downs || b.poolUgnot - a.poolUgnot || a.name.localeCompare(b.name));
  return rows.slice(0, 6);
}

export type PoolChip = {
  id: string;
  name: string;
  poolUgnot: number;
  yours: boolean;
};

type PoolFish = Pick<FishNft, "id" | "name" | "burned" | "alive" | "matchId" | "poolUgnot">;

/** Stakes locked on fish that are still in the sea. A left fish and a burned fish stay out. */
export function seaPools(fish: PoolFish[], youId: string | null): { total: number; chips: PoolChip[] } {
  const chips: PoolChip[] = [];
  let total = 0;
  for (const item of fish) {
    if (item.burned || !item.alive || !item.matchId || item.poolUgnot <= 0) continue;
    total += item.poolUgnot;
    chips.push({
      id: item.id,
      name: item.name,
      poolUgnot: item.poolUgnot,
      yours: item.id === youId,
    });
  }
  chips.sort((a, b) => b.poolUgnot - a.poolUgnot || a.name.localeCompare(b.name));
  return { total, chips };
}
