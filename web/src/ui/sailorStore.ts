import { acceptCountry } from "../sim/country";
import { isCrest, type CrestId } from "../sim/social";

export const SAILOR_KEY = "shoal.sailor";

export type StoredSailor = {
  username: string;
  country: string;
  crest: CrestId;
};

export function sailorStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function writeSailor(card: StoredSailor): string {
  return JSON.stringify({ v: 1, username: card.username, country: card.country, crest: card.crest });
}

/** A card this browser already saved. Missing or broken storage stays empty. */
export function readSailor(raw: string | null): StoredSailor | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const row = parsed as { username?: unknown; country?: unknown; crest?: unknown };
  if (typeof row.username !== "string" || typeof row.country !== "string" || typeof row.crest !== "string") return null;
  if (!/^[a-z0-9]{3,16}$/.test(row.username) || !acceptCountry(row.country) || !isCrest(row.crest)) return null;
  return { username: row.username, country: row.country, crest: row.crest };
}

export function storeSailor(card: StoredSailor, store: Storage | null = sailorStorage()): void {
  if (!store) return;
  try {
    store.setItem(SAILOR_KEY, writeSailor(card));
  } catch {
    /* A full browser store still leaves the chain card to be read later. */
  }
}
