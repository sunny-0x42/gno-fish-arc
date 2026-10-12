import type { SeaChat, SeaChatIn, SeaFriend, SeaHit, SeaKill, SeaKillIn, SeaPose } from "./seaRoom";

/** Browser side of `/api/sea`. A failed post leaves the local swim alone. */

const QUEUE_MAX = 8;
/** A gno.land account, or an Arc 0x account. The room does not move USDC. */
const ADDRESS = /^(?:g1[0-9a-z]{38}|0x[0-9a-f]{40})$/;

let seats: SeaPose[] = [];
let boot = makeBoot();
let friendQueue: { to: string; fromName: string; kind: "request" | "accept" | "decline" | "party" | "joined" }[] = [];
let chatQueue: SeaChatIn[] = [];
const appliedFriends = new Set<string>();
const appliedChats = new Set<string>();

export function lastSeats(): readonly SeaPose[] {
  return seats;
}

/** A restored page is a new sitting, so a close from the frozen tab cannot block it. */
export function rotateSeaBoot(): void {
  boot = makeBoot();
}

/** Tell the room this tab is gone. A late pose from the same tab cannot put the fish back. */
export function leaveSea(address: string): void {
  const self = address.trim().toLowerCase();
  if (!ADDRESS.test(self)) return;
  const body = JSON.stringify({ address: self, boot, bye: true, pose: null, hits: [], friends: [], chats: [], kills: [] });
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const sent = navigator.sendBeacon("/api/sea", new Blob([body], { type: "application/json" }));
      if (sent) return;
    }
  } catch {
    // The keepalive post below still runs when the beacon rejects the body.
  }
  void fetch("/api/sea", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
    cache: "no-store",
  }).catch(() => undefined);
}

export function queueFriend(to: string, fromName: string, kind: "request" | "accept" | "decline" | "party" | "joined" = "request"): void {
  friendQueue.push({ to, fromName, kind });
  if (friendQueue.length > QUEUE_MAX) friendQueue.splice(0, friendQueue.length - QUEUE_MAX);
}

export function queueChat(text: string, country: string, at: number, fromName: string): void {
  const clean = text.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 140);
  if (!clean) return;
  const id = `c${Date.now().toString(36)}${chatQueue.length.toString(36)}`.slice(0, 21);
  chatQueue.push({ id, text: clean, country, at, fromName: fromName.slice(0, 16) });
  if (chatQueue.length > QUEUE_MAX) chatQueue.splice(0, chatQueue.length - QUEUE_MAX);
}

export function takeChatQueue(): SeaChatIn[] {
  const lines = chatQueue;
  chatQueue = [];
  return lines;
}

export function restoreChatQueue(lines: SeaChatIn[]): void {
  const seen = new Set(chatQueue.map((line) => line.id));
  chatQueue = lines.filter((line) => !seen.has(line.id)).concat(chatQueue).slice(0, QUEUE_MAX);
}

/** True the first time this note is applied in this tab. */
export function takeFriendNote(id: string): boolean {
  return takeOnce(appliedFriends, id);
}

/** True the first time this room line is applied in this tab. */
export function takeChatNote(id: string): boolean {
  return takeOnce(appliedChats, id);
}

export async function syncSea(
  address: string,
  pose: SeaPose | null,
  hits: SeaHit[],
  chats: SeaChatIn[] = [],
  kills: SeaKillIn[] = [],
): Promise<{
  ok: boolean;
  seats: SeaPose[];
  friends: SeaFriend[];
  chats: SeaChat[];
  kills: SeaKill[];
}> {
  const friends = friendQueue;
  friendQueue = [];
  try {
    const response = await fetch("/api/sea", {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ address, boot, bye: false, pose, hits, friends, chats, kills }),
    });
    if (!response.ok) {
      restoreFriends(friends);
      return { ok: false, seats: [], friends: [], chats: [], kills: [] };
    }
    const data = await response.json() as { seats?: SeaPose[]; friends?: SeaFriend[]; chats?: SeaChat[]; kills?: SeaKill[] };
    seats = Array.isArray(data.seats) ? data.seats : [];
    return {
      ok: true,
      seats,
      friends: Array.isArray(data.friends) ? data.friends : [],
      chats: Array.isArray(data.chats) ? data.chats : [],
      kills: Array.isArray(data.kills) ? data.kills : [],
    };
  } catch {
    restoreFriends(friends);
    return { ok: false, seats: [], friends: [], chats: [], kills: [] };
  }
}

function restoreFriends(friends: { to: string; fromName: string; kind: "request" | "accept" | "decline" | "party" | "joined" }[]): void {
  friendQueue = friends.concat(friendQueue).slice(0, QUEUE_MAX);
}

function makeBoot(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function takeOnce(seen: Set<string>, id: string): boolean {
  if (seen.has(id)) return false;
  seen.add(id);
  if (seen.size > 200) {
    const keep = [...seen].slice(-100);
    seen.clear();
    for (const item of keep) seen.add(item);
  }
  return true;
}
