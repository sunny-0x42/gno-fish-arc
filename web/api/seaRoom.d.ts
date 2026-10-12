export type SeaPose = {
  address: string;
  onyxId: number;
  name: string;
  sailor: string;
  country?: string;
  rarity: string;
  size: string;
  trait: string;
  x: number;
  z: number;
  fx: number;
  fz: number;
  hp: number;
  hpMax: number;
  bite: number;
  alive: boolean;
  seq: number;
};

export type SeaHit = {
  address: string;
  hp: number;
  alive: boolean;
};

export type SeaFriend = {
  id: string;
  from: string;
  fromName: string;
  to: string;
  at: number;
  kind: "request" | "accept" | "decline" | "party" | "joined";
};

export type SeaChatIn = {
  id: string;
  text: string;
  country?: string;
  fromName?: string;
  at?: number;
};

export type SeaChat = {
  id: string;
  from: string;
  fromName: string;
  country: string;
  text: string;
  at: number;
};

export type SeaKillIn = {
  id: string;
  attacker: string;
  attackerCountry?: string;
  victim: string;
  victimCountry?: string;
  victimAddress?: string;
  gnot: number;
  fish: number;
  at?: number;
};

export type SeaKill = {
  id: string;
  attacker: string;
  attackerCountry: string;
  victim: string;
  victimCountry: string;
  gnot: number;
  fish: number;
  at: number;
};

export type SeaRoomState = {
  seats: (SeaPose & { seen: number; boot?: string })[];
  closed?: { address: string; boot: string; at: number }[];
  friends: SeaFriend[];
  friendSeq: number;
  chats: SeaChat[];
  kills: SeaKill[];
};

export type SeaExchange = {
  seats: SeaPose[];
  friends: SeaFriend[];
  chats: SeaChat[];
  kills: SeaKill[];
};

export class SeaRoom {
  exchange(
    now: number,
    me: string,
    pose: SeaPose | null,
    hits: SeaHit[],
    friends: { to: string; fromName: string; kind?: string }[],
    chats?: SeaChatIn[],
    kills?: SeaKillIn[],
    boot?: string,
    bye?: boolean,
  ): SeaExchange | null;
  toJSON(): SeaRoomState;
  static fromJSON(raw: unknown): SeaRoom;
}
