import { ARC_PARTY, ARC_PROFILE, arcCall, decodeAddress, decodeString, decodeUint, isArcAddress, uintCall } from "./arc";
import type { ShoalGame } from "../sim/game";

const PARTY_SEL = {
  partyOf: "0x2cea2d3b",
  nameOf: "0x051a2664",
  memberCount: "0x6e8165e8",
  memberAt: "0xd0fb813b",
} as const;

const USERNAME_SEL = "0x7898acef";

export type ArcCrew = { id: number; name: string; members: string[] };

export type PartyCall = (data: string) => Promise<string>;

function pad(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

function partyOfCall(who: string): string {
  return `${PARTY_SEL.partyOf}${who.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}

function memberAtCall(id: bigint, index: bigint): string {
  return `${PARTY_SEL.memberAt}${pad(id)}${pad(index)}`;
}

const partyRpc: PartyCall = (data) => arcCall(data, ARC_PARTY);
const profileRpc: PartyCall = (data) => arcCall(data, ARC_PROFILE);

/** Sailor-card username on FishProfile. Empty and unreadable cards are null. */
export async function readArcUsername(who: string, call: PartyCall = profileRpc): Promise<string | null> {
  const signer = who.trim().toLowerCase();
  if (!isArcAddress(signer)) return null;
  const data = `${USERNAME_SEL}${signer.replace(/^0x/, "").padStart(64, "0")}`;
  const name = decodeString(await call(data))?.trim().toLowerCase() ?? "";
  return /^[a-z0-9]{3,16}$/.test(name) ? name : null;
}

/** The crew this wallet sits in. Null means the wallet has no seat. */
export async function readArcCrew(who: string, call: PartyCall = partyRpc): Promise<ArcCrew | null> {
  const signer = who.trim().toLowerCase();
  if (!isArcAddress(signer)) return null;
  const idRaw = decodeUint(await call(partyOfCall(signer)));
  if (idRaw === null || idRaw === 0n || idRaw > 1_000_000n) return null;
  const id = Number(idRaw);
  const name = decodeString(await call(uintCall(PARTY_SEL.nameOf, idRaw))) || `Party ${id}`;
  const countRaw = decodeUint(await call(uintCall(PARTY_SEL.memberCount, idRaw)));
  const count = countRaw === null ? 0 : Math.min(Number(countRaw), 32);
  const members: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const addr = decodeAddress(await call(memberAtCall(idRaw, BigInt(index))));
    if (!addr || addr === `0x${"0".repeat(40)}` || members.includes(addr)) continue;
    members.push(addr);
  }
  if (!members.includes(signer)) members.unshift(signer);
  return { id, name, members };
}

/** Copy the Arc crew onto this browser. A wallet with no seat clears the previous Arc crew. */
export async function syncArcParty(game: ShoalGame, signer: string, call: PartyCall = partyRpc): Promise<ArcCrew | null> {
  let crew: ArcCrew | null;
  try {
    crew = await readArcCrew(signer, call);
  } catch {
    return null;
  }
  if (!crew) game.clearArcCrew();
  else game.seatArcCrew(signer, crew.id, crew.name, crew.members);
  return crew;
}
