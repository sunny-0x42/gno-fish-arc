import { PLAYER_ID, VIEWER_ID } from "../sim/game";
import type { ShoalSnap } from "./useShoal";

/** Match membership, not merely an alive NFT, determines who is in the sea. */
export function seaFish(snap: Pick<ShoalSnap, "fish" | "matches">) {
  return snap.fish.filter((fish) => fish.alive && !fish.burned &&
    snap.matches.some((match) => match.id === fish.matchId && match.status === "live"));
}

export function hasLivePlayer(snap: Pick<ShoalSnap, "fish" | "matches" | "activeFishId">) {
  return seaFish(snap).some((fish) => fish.id === snap.activeFishId);
}

export function canCheerFish(fish: ShoalSnap["fish"][number] | null | undefined) {
  return Boolean(fish && fish.ownerId !== PLAYER_ID && fish.ownerId !== VIEWER_ID);
}
