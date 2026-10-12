import { useEffect, useState } from "react";
import {
  PLAYER_ID,
  VIEWER_ID,
  type Books,
  type Cheer,
  type Claim,
  type FishNft,
  type ChatLine,
  type FriendLink,
  type Group,
  type LogLine,
  type PartyInvite,
  type Profile,
  type Match,
  type ScoreLine,
  type ShoalGame,
  type Wallet,
} from "../sim/game";

export type ShoalSnap = {
  fish: FishNft[];
  cheers: Cheer[];
  claims: Claim[];
  parties: Group[];
  clans: Group[];
  profiles: Profile[];
  friends: FriendLink[];
  invites: PartyInvite[];
  chats: ChatLine[];
  watching: boolean;
  watchStartedAt: number | null;
  player: Wallet;
  viewer: Wallet;
  books: Books;
  log: LogLine[];
  scores: Record<string, ScoreLine>;
  matches: Match[];
  activeFishId: string | null;
  viewMatchId: string | null;
  arcCrew?: { id: number; name: string; members: string[] } | null;
  partyInvite?: { from: string; name: string } | null;
};

function take(game: ShoalGame): ShoalSnap {
  return {
    fish: game.fish.map((fish) => ({ ...fish })),
    cheers: game.cheers.map((cheer) => ({ ...cheer })),
    claims: game.claims.map((claim) => ({ ...claim })),
    parties: [...game.parties.values()].map((group) => ({ ...group })),
    clans: [...game.clans.values()].map((group) => ({ ...group })),
    profiles: game.profiles.map((profile) => ({ ...profile })),
    friends: game.friends.map((link) => ({ ...link })),
    invites: game.invites.map((invite) => ({ ...invite })),
    chats: game.chats.map((line) => ({ ...line })),
    watching: game.watching.has(VIEWER_ID),
    watchStartedAt: game.watchStartedAt(VIEWER_ID),
    player: { ...game.purse(PLAYER_ID) },
    viewer: { ...game.purse(VIEWER_ID) },
    books: { ...game.books },
    log: game.log.map((line) => ({ ...line })),
    scores: Object.fromEntries([...game.scores.entries()].map(([id, row]) => [id, { kills: row.kills, downs: row.downs }])),
    matches: game.matches.map((match) => ({ ...match, fishIds: [...match.fishIds] })),
    activeFishId: game.activeFishId,
    viewMatchId: game.viewMatchId,
    arcCrew: game.arcCrewView(),
    partyInvite: game.partyInviteView(),
  };
}

export function useShoal(game: ShoalGame): ShoalSnap {
  const [snap, setSnap] = useState(() => take(game));
  useEffect(() => game.subscribe(() => setSnap(take(game))), [game]);
  return snap;
}

export function useClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, []);
  return now;
}
