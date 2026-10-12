import { syncArcParty } from "../chain/partyRoster";
import { acceptCall } from "../chain/realmCalls";
import { queueFriend } from "../chain/seaLink";
import type { ShoalGame } from "../sim/game";
import { openOnyx } from "./adena";

/** Tell one wallet, through the sea room, that this party invited them. */
export function relayPartyInvite(to: string, partyName: string): void {
  queueFriend(to, partyName, "party");
}

/** Accept the chain invite, then tell the crew so their lists refresh on the next sea tick. */
export async function acceptPartyInvite(game: ShoalGame, signer: string): Promise<string> {
  const tx = await openOnyx(acceptCall());
  if (tx === "busy") return "The wallet is already sending a call.";
  if (!tx.ok) return tx.detail;
  const seated = await syncArcParty(game, signer);
  game.clearPartyInvite();
  const me = signer.trim().toLowerCase();
  const name = seated?.name ?? "Party";
  for (const member of seated?.members ?? []) {
    if (member !== me) queueFriend(member, name, "joined");
  }
  return seated
    ? `${name} · ${seated.members.length}`
    : "Accepted on Arc. The list updates when the chain read returns.";
}
