import type { ShoalGame } from "../sim/game";
import { openOnyx } from "./adena";

const pending = new Set<string>();
const sent = new Set<string>();

/** Ask the wallet to take FISH after this browser records a kill of another seated fish. */
export async function awardChainKill(game: ShoalGame, attackerId: string, victimId: string): Promise<void> {
  const attacker = game.fishById(attackerId);
  const victim = game.fishById(victimId);
  if (!attacker || !victim || !victim.remoteAddress) return;
  if (!attacker.onyxId || !victim.onyxId) {
    game.announce("Both seated fish need a FishDuel id before FISH can move.");
    return;
  }
  const key = `${attacker.onyxId}:${victim.onyxId}`;
  if (pending.has(key) || sent.has(key)) return;
  pending.add(key);
  try {
    const tx = await openOnyx({
      pkg: "arc",
      func: "Award",
      args: [String(attacker.onyxId), String(victim.onyxId)],
      sendUgnot: "0",
    });
    if (tx === "busy") {
      game.announce("The wallet is already sending a call.");
      return;
    }
    if (!tx.ok) {
      game.announce(tx.detail);
      return;
    }
    sent.add(key);
    game.announce("FISH award sent. 1 FISH per 1 USDC of the smaller stake, once per open bout.");
  } finally {
    pending.delete(key);
  }
}
