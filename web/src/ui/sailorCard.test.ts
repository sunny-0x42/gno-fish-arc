import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PLAYER_ID, ShoalGame, VIEWER_ID } from "../sim/game";
import { MintPanel } from "./Panels";
import type { ShoalSnap } from "./useShoal";

function snapOf(game: ShoalGame): ShoalSnap {
  return {
    fish: game.fish.map((fish) => ({ ...fish })),
    cheers: [],
    claims: [],
    parties: [],
    clans: [],
    profiles: game.profiles.map((profile) => ({ ...profile })),
    friends: [],
    invites: [],
    chats: [],
    watching: false,
    watchStartedAt: null,
    player: { ...game.purse(PLAYER_ID) },
    viewer: { ...game.purse(VIEWER_ID) },
    books: { ...game.books },
    log: [],
    scores: {},
    matches: game.matches.map((match) => ({ ...match, fishIds: [...match.fishIds] })),
    activeFishId: null,
    viewMatchId: null,
  };
}

describe("sailor card", () => {
  it("shows the card on Play before any fish is minted", () => {
    const game = new ShoalGame(0);
    const html = renderToStaticMarkup(createElement(MintPanel, {
      game,
      snap: snapOf(game),
      now: 0,
      mode: "play",
      onPlay: () => undefined,
      onWatch: () => undefined,
      onEnter: () => undefined,
      onBack: () => undefined,
    }));
    const card = html.indexOf("A fish is not required");
    const mint = html.indexOf("Mint a fish");
    expect(card).toBeGreaterThan(-1);
    expect(mint).toBeGreaterThan(card);
    expect(html).toContain("You can change the name later. The country follows your network address.");
    expect(html).not.toContain("aria-label=\"Profile logo\"");
    expect(html).not.toContain(">wave<");
    expect(html).not.toContain(">reef<");
    expect(html).toContain("Save profile");
    expect(html).toContain("aria-label=\"Username\"");
    expect(html).not.toContain("aria-label=\"Country\"");
    expect(html).toContain("Reading the country from your network address.");
    expect(html).toContain("Vietnam skipper");
    expect(html).toContain("Mint a fish");
    expect(html).toContain("· 5 USDC");
    expect(html).not.toContain("Mint Shoal fish");
    expect(html).not.toContain("Mint a fish · 1 USDC");
    expect(html).not.toContain("150 USDC");
    expect(html).not.toContain("play-stake");
  });

  it("shows the fish name, a compact model, and an open stake before the roster note", () => {
    const game = new ShoalGame(0);
    const owner = "0x8EaAe9f664214987204616Dd8145BAcad48044F6";
    game.syncChainRoster(owner, [{
      onyxId: 1,
      owner,
      name: "Bubble",
      rarity: "common",
      size: "medium",
      trait: "swift",
      poolUgnot: 0,
      inMatch: false,
      bouts: 0,
      image: "",
      collectionOnly: true,
    }], 0);
    const note = "Arc has 1 minted, 1 in this wallet, 0 in a match. This sea shows 0. 1 stay on the roster until a pool stake.";
    const html = renderToStaticMarkup(createElement(MintPanel, {
      game,
      snap: snapOf(game),
      now: 0,
      mode: "play",
      onPlay: () => undefined,
      onWatch: () => undefined,
      onEnter: () => undefined,
      onBack: () => undefined,
      chainNote: note,
    }));
    const stake = html.indexOf('id="play-stake"');
    const status = html.indexOf("until a pool stake");
    const tagEnd = html.indexOf(">", stake);
    const tagStart = html.lastIndexOf("<button", stake);
    expect(html).toContain("Bubble");
    expect(html).toContain('aria-label="medium common fish 3D preview"');
    expect(html).toContain("fish-card");
    expect(html).toContain("Open a seat, then stake 1.00 USDC");
    expect(html).toContain("then 1.00 USDC into the pool");
    expect(html).toContain('id="play-stake-amount"');
    expect(html).toContain('aria-label="Pool stake in USDC"');
    expect(html).toContain("At least 1 USDC");
    expect(html).not.toContain("this token is not one yet");
    expect(stake).toBeGreaterThan(-1);
    expect(status).toBeGreaterThan(stake);
    expect(html.slice(tagStart, tagEnd)).not.toContain("disabled");
    const id = game.fish[0].id;
    game.bindDuelSeat(id, 1);
    expect(game.fish[0].onyxId).toBe(1);
    expect(game.fish[0].collectionOnly).toBe(false);
    expect(game.fish[0].onyxSwim).not.toBe(true);
  });
});
