export const CRESTS = ["wave", "reef", "moon", "sun", "fang", "shell"] as const;
export type CrestId = (typeof CRESTS)[number];

export type ChatChannel = "world" | "party" | "clan";

/**
 * Sailor card for one address. A fish NFT is not required.
 * SetProfile keeps username, country, and crest. A later fact is a new field and a new read.
 */
export type Profile = {
  id: string;
  username: string;
  /** Practice label. Not a key and not a chain account. */
  address: string;
  country: string;
  crest: CrestId;
};

export type FriendLink = {
  id: string;
  fromId: string;
  toId: string;
  status: "pending" | "accepted";
};

/** One friend row kept in this browser for one wallet. */
export type SavedFriend = {
  other: string;
  username: string;
  status: "pending" | "accepted";
  incoming: boolean;
};

export type PartyInvite = {
  id: string;
  partyId: string;
  fromId: string;
  toId: string;
  status: "accepted";
};

export type ChatLine = {
  id: string;
  channel: ChatChannel;
  roomId: string;
  fromId: string;
  text: string;
  at: number;
};

export function isCrest(value: string): value is CrestId {
  return (CRESTS as readonly string[]).includes(value);
}

export function practiceAddress(username: string): string {
  return `g1shoal1${username}`;
}

export function cleanUsername(value: string): string | null {
  const name = value.trim().toLowerCase();
  if (!/^[a-z0-9]{3,16}$/.test(name)) return null;
  return name;
}
