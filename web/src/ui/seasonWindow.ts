import { watchAllowed } from "../chain/watchDesk";

/** Earliest Season 0 start. Later edits cannot move the open earlier than this instant. */
export const SEASON0_EARLIEST_UTC = "2026-10-08T07:00:00.000Z";
export const SEASON0_EARLIEST_MS = Date.parse(SEASON0_EARLIEST_UTC);

const SEASON_KEY = "shoal.season0";

export type SeasonWindow = {
  start: number;
  /** Null until the deploy wallet stores an end. */
  end: number | null;
};

type SeasonStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export function isDeployWallet(address: string | null | undefined): boolean {
  return typeof address === "string" && address.trim() !== "" && watchAllowed(address);
}

export function formatSeasonUtc(ms: number): string {
  const when = new Date(ms);
  const date = [
    when.getUTCFullYear(),
    String(when.getUTCMonth() + 1).padStart(2, "0"),
    String(when.getUTCDate()).padStart(2, "0"),
  ].join("-");
  const time = [
    String(when.getUTCHours()).padStart(2, "0"),
    String(when.getUTCMinutes()).padStart(2, "0"),
  ].join(":");
  return `${date} ${time} UTC`;
}

/** A calendar date and a minute, read as UTC. A rolled-over day is rejected. */
export function parseSeasonUtc(date: string, time: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const ms = Date.parse(`${date}T${time}:00.000Z`);
  if (!Number.isSafeInteger(ms)) return null;
  if (formatSeasonUtc(ms) !== `${date} ${time} UTC`) return null;
  return ms;
}

export function utcFields(ms: number): { date: string; time: string } {
  const [date, time] = formatSeasonUtc(ms).split(" ");
  return { date, time };
}

export function seasonWindowError(start: number, end: number): string | null {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return "Use a real UTC date and time.";
  if (start < SEASON0_EARLIEST_MS) return `The earliest start is ${formatSeasonUtc(SEASON0_EARLIEST_MS)}.`;
  if (end <= start) return "End is after the start.";
  return null;
}

export function publishedSeasonWindow(): SeasonWindow {
  return { start: SEASON0_EARLIEST_MS, end: null };
}

function browserStore(): SeasonStore | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function storedWindow(raw: string | null): SeasonWindow | null {
  if (!raw) return null;
  let parsed: { v?: unknown; start?: unknown; end?: unknown };
  try {
    parsed = JSON.parse(raw) as { v?: unknown; start?: unknown; end?: unknown };
  } catch {
    return null;
  }
  if (parsed.v !== 1 || typeof parsed.start !== "number" || !Number.isSafeInteger(parsed.start)) return null;
  if (parsed.start < SEASON0_EARLIEST_MS) return null;
  if (parsed.end === null) return { start: parsed.start, end: null };
  if (typeof parsed.end !== "number" || !Number.isSafeInteger(parsed.end) || parsed.end <= parsed.start) return null;
  return { start: parsed.start, end: parsed.end };
}

/** Published start, unless this browser already stored a later window. */
export function readSeasonWindow(storage: SeasonStore | null = browserStore()): SeasonWindow {
  const published = publishedSeasonWindow();
  if (!storage) return published;
  try {
    return storedWindow(storage.getItem(SEASON_KEY)) ?? published;
  } catch {
    return published;
  }
}

/** Persist a window. Returns null when the dates are refused or the browser cannot store them. */
export function writeSeasonWindow(start: number, end: number, storage: SeasonStore | null = browserStore()): SeasonWindow | null {
  if (seasonWindowError(start, end)) return null;
  if (!storage) return null;
  const next: SeasonWindow = { start, end };
  try {
    storage.setItem(SEASON_KEY, JSON.stringify({ v: 1, start, end }));
  } catch {
    return null;
  }
  return next;
}

export function seasonWindowLine(window: SeasonWindow): string {
  const start = formatSeasonUtc(window.start);
  if (window.end === null) return `Start ${start}. End not set. Times are UTC.`;
  return `Start ${start}. End ${formatSeasonUtc(window.end)}. Times are UTC.`;
}
