import { formatFish } from "../sim/format";

/** A slice of the 43,000,000 season allocation. Not a mint, and not the practice purse. */
export const SEASON0_POOL = 100_000;
export const SEASON0_PLACES = 20;

/**
 * Whole FISH for places 1 through 20.
 * Strictly decreasing. The sum is SEASON0_POOL.
 */
export const SEASON0_PRIZES: readonly number[] = [
  16_000, 12_500, 10_000, 8_000, 7_000,
  6_000, 5_500, 5_000, 4_500, 4_000,
  3_500, 3_000, 2_800, 2_500, 2_200,
  2_000, 1_800, 1_500, 1_200, 1_000,
];

export function season0Prize(place: number): number {
  if (!Number.isInteger(place) || place < 1 || place > SEASON0_PLACES) return 0;
  return SEASON0_PRIZES[place - 1];
}

export type SeasonFish = { id: string; ownerId: string };
export type SeasonProfile = { id: string; username: string };
export type SeasonScore = { kills: number; downs: number };

export type SeasonSailor = {
  ownerId: string;
  name: string;
  kills: number;
  downs: number;
  yours: boolean;
};

export type SeasonRow = {
  place: number;
  ownerId: string | null;
  name: string;
  kills: number;
  downs: number;
  prize: number;
  yours: boolean;
  open: boolean;
};

export type SeasonYou = {
  name: string;
  kills: number;
  downs: number;
  /** 1-based place among sailors with a kill. Null when this sailor has none. */
  place: number | null;
  prize: number;
};

function whole(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.trunc(amount);
}

function sailorName(ownerId: string, profiles: readonly SeasonProfile[]): string {
  const username = profiles.find((item) => item.id === ownerId)?.username?.trim() ?? "";
  return username || "Unnamed sailor";
}

/** One row per owner. Kills and downs add across that owner's fish, including a downed fish. */
export function seasonSailors(
  fish: readonly SeasonFish[],
  scores: Record<string, SeasonScore>,
  profiles: readonly SeasonProfile[],
  youId: string,
): SeasonSailor[] {
  const rows = new Map<string, SeasonSailor>();
  for (const item of fish) {
    const ownerId = item.ownerId.trim();
    if (!ownerId) continue;
    let row = rows.get(ownerId);
    if (!row) {
      row = { ownerId, name: sailorName(ownerId, profiles), kills: 0, downs: 0, yours: ownerId === youId };
      rows.set(ownerId, row);
    }
    const score = scores[item.id];
    if (!score) continue;
    row.kills += whole(score.kills);
    row.downs += whole(score.downs);
  }
  return [...rows.values()];
}

function byPlace(a: SeasonSailor, b: SeasonSailor): number {
  return b.kills - a.kills || a.downs - b.downs || a.name.localeCompare(b.name) || a.ownerId.localeCompare(b.ownerId);
}

/** Sailors with at least one kill, highest place first. */
export function seasonRanked(
  fish: readonly SeasonFish[],
  scores: Record<string, SeasonScore>,
  profiles: readonly SeasonProfile[],
  youId: string,
): SeasonSailor[] {
  return seasonSailors(fish, scores, profiles, youId).filter((row) => row.kills > 0).sort(byPlace);
}

/** Twenty places. An empty place stays open and still shows its prize. */
export function season0Board(
  fish: readonly SeasonFish[],
  scores: Record<string, SeasonScore>,
  profiles: readonly SeasonProfile[],
  youId: string,
): SeasonRow[] {
  const ranked = seasonRanked(fish, scores, profiles, youId);
  const rows: SeasonRow[] = [];
  for (let place = 1; place <= SEASON0_PLACES; place += 1) {
    const sailor = ranked[place - 1];
    const prize = season0Prize(place);
    if (!sailor) {
      rows.push({ place, ownerId: null, name: "Open", kills: 0, downs: 0, prize, yours: false, open: true });
      continue;
    }
    rows.push({
      place,
      ownerId: sailor.ownerId,
      name: sailor.name,
      kills: sailor.kills,
      downs: sailor.downs,
      prize,
      yours: sailor.yours,
      open: false,
    });
  }
  return rows;
}

export function season0You(
  fish: readonly SeasonFish[],
  scores: Record<string, SeasonScore>,
  profiles: readonly SeasonProfile[],
  youId: string,
): SeasonYou {
  const mine = seasonSailors(fish, scores, profiles, youId).find((row) => row.yours);
  const name = mine?.name ?? sailorName(youId, profiles);
  const kills = mine?.kills ?? 0;
  const downs = mine?.downs ?? 0;
  if (kills < 1) return { name, kills, downs, place: null, prize: 0 };
  const place = seasonRanked(fish, scores, profiles, youId).findIndex((row) => row.yours) + 1;
  return { name, kills, downs, place, prize: season0Prize(place) };
}

function ordinal(place: number): string {
  const mod100 = place % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${place}th`;
  switch (place % 10) {
    case 1: return `${place}st`;
    case 2: return `${place}nd`;
    case 3: return `${place}rd`;
    default: return `${place}th`;
  }
}

export function season0YouLine(you: SeasonYou): string {
  const kills = `${you.kills} ${you.kills === 1 ? "kill" : "kills"}`;
  if (you.place === null) {
    return "You have no kills in this browser yet. A place on this list opens when a kill lands.";
  }
  if (you.place > SEASON0_PLACES) {
    return `You are ${ordinal(you.place)} in this browser with ${kills}. The prize stops at 20.`;
  }
  return `You are ${ordinal(you.place)} in this browser with ${kills}. ${formatFish(you.prize)} FISH is a draft figure and is not paid.`;
}
