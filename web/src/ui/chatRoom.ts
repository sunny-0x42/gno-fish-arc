import { ictDayIndex } from "../sim/tokenomics";
import type { ChatChannel } from "../sim/social";

const KEY = "shoal.practice-chat";
const TAG = "abcdefghijkmnpqrstuvwxyz23456789";

export type StoredChat = {
  channel: ChatChannel;
  roomId: string;
  fromId: string;
  text: string;
  at: number;
};

export type MentionPart = { text: string; mention: boolean };

/** Four letters from the sailor and the day the line was sent. The same sailor gets a new tag the next day. */
export function dailyTag(id: string, now: number): string {
  let hash = ictDayIndex(now) + 1;
  const source = id || "sailor";
  for (let i = 0; i < source.length; i++) hash = Math.imul(hash, 33) + source.charCodeAt(i);
  hash >>>= 0;
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += TAG[hash % TAG.length];
    hash = Math.floor(hash / TAG.length);
  }
  return out;
}

/** A later line from the same sailor inside this window keeps the first header. */
export const CHAT_RUN_MS = 5 * 60 * 1000;

export function continuesChat(
  prev: { fromId: string; at: number } | undefined,
  line: { fromId: string; at: number },
): boolean {
  if (!prev || prev.fromId !== line.fromId) return false;
  const gap = line.at - prev.at;
  return gap >= 0 && gap < CHAT_RUN_MS;
}

/** `@name` is a mention when that sailor is in this browser. */
export function mentionParts(text: string, names: ReadonlySet<string>): MentionPart[] {
  const parts: MentionPart[] = [];
  const pattern = /@[a-z0-9]{3,16}/gi;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ text: text.slice(last, index), mention: false });
    const token = match[0];
    parts.push({ text: token, mention: names.has(token.slice(1).toLowerCase()) });
    last = index + token.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), mention: false });
  if (parts.length === 0) parts.push({ text, mention: false });
  return parts;
}

/** Lines already on screen are seen. A room you are reading stays caught up. */
export function unreadCounts(
  lines: { channel: string; roomId: string }[],
  seen: Record<string, number>,
  activeKey: string | null,
): { unread: Record<string, number>; seen: Record<string, number> } {
  const totals: Record<string, number> = {};
  for (const line of lines) {
    const key = `${line.channel}:${line.roomId}`;
    totals[key] = (totals[key] ?? 0) + 1;
  }
  const nextSeen = { ...seen };
  const unread: Record<string, number> = {};
  for (const key of Object.keys(totals)) {
    if (nextSeen[key] === undefined) nextSeen[key] = totals[key];
    if (activeKey === key) nextSeen[key] = totals[key];
    unread[key] = Math.max(0, totals[key] - (nextSeen[key] ?? 0));
  }
  return { unread, seen: nextSeen };
}

export function readPracticeChat(raw: string | null): StoredChat[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { v?: unknown; lines?: unknown };
    if (parsed.v !== 1 || !Array.isArray(parsed.lines)) return [];
    const out: StoredChat[] = [];
    for (const line of parsed.lines.slice(-80)) {
      if (!line || typeof line !== "object") continue;
      const row = line as Partial<StoredChat>;
      if (row.channel !== "world" && row.channel !== "party" && row.channel !== "clan") continue;
      if (typeof row.roomId !== "string" || typeof row.fromId !== "string" || typeof row.text !== "string") continue;
      if (typeof row.at !== "number" || !Number.isFinite(row.at)) continue;
      out.push({ channel: row.channel, roomId: row.roomId, fromId: row.fromId, text: row.text, at: row.at });
    }
    return out;
  } catch {
    return [];
  }
}

export function writePracticeChat(lines: StoredChat[]): string {
  return JSON.stringify({
    v: 1,
    lines: lines.slice(-80).map((line) => ({
      channel: line.channel,
      roomId: line.roomId,
      fromId: line.fromId,
      text: line.text,
      at: line.at,
    })),
  });
}

export function practiceChatStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export const PRACTICE_CHAT_KEY = KEY;
