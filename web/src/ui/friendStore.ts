import type { SavedFriend } from "../sim/social";

const WALLET = /^(?:g1[0-9a-z]{38}|0x[0-9a-f]{40})$/;

export function friendStorageKey(owner: string): string {
  return `shoal.friends.v1.${owner.trim().toLowerCase()}`;
}

export function readStoredFriends(raw: string | null): SavedFriend[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as { v?: unknown; links?: unknown };
    if (data.v !== 1 || !Array.isArray(data.links)) return [];
    const out: SavedFriend[] = [];
    for (const row of data.links) {
      if (!row || typeof row !== "object") continue;
      const item = row as Partial<SavedFriend>;
      const other = String(item.other ?? "").trim().toLowerCase();
      const username = String(item.username ?? "").trim().toLowerCase();
      if (!WALLET.test(other) || !/^[a-z0-9]{3,16}$/.test(username)) continue;
      if (item.status !== "pending" && item.status !== "accepted") continue;
      out.push({ other, username, status: item.status, incoming: Boolean(item.incoming) });
      if (out.length >= 40) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function writeStoredFriends(links: readonly SavedFriend[]): string {
  return JSON.stringify({
    v: 1,
    links: links.slice(0, 40).map((link) => ({
      other: link.other,
      username: link.username,
      status: link.status,
      incoming: link.incoming,
    })),
  });
}
