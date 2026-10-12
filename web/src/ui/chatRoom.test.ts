import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PLAYER_ID, ShoalGame, VIEWER_ID } from "../sim/game";
import { CornerSocial } from "./CornerSocial";
import type { ShoalSnap } from "./useShoal";
import { flagImageSrc } from "../sim/country";
import { CHAT_RUN_MS, continuesChat, dailyTag, mentionParts, readPracticeChat, unreadCounts, writePracticeChat } from "./chatRoom";

function snapOf(game: ShoalGame): ShoalSnap {
  return {
    fish: game.fish.map((fish) => ({ ...fish })),
    cheers: [],
    claims: [],
    parties: [...game.parties.values()],
    clans: [...game.clans.values()],
    profiles: game.profiles.map((profile) => ({ ...profile })),
    friends: game.friends.map((link) => ({ ...link })),
    invites: [],
    chats: game.chats.map((line) => ({ ...line })),
    watching: false,
    watchStartedAt: null,
    player: { ...game.purse(PLAYER_ID) },
    viewer: { ...game.purse(VIEWER_ID) },
    books: { ...game.books },
    log: [],
    scores: {},
    matches: [],
    activeFishId: game.activeFishId,
    viewMatchId: null,
  };
}

describe("practice chat rooms", () => {
  it("keeps a sailor's tag for one day and changes it the next", () => {
    const day = 24 * 60 * 60 * 1000;
    expect(dailyTag("skipper", 0)).toBe(dailyTag("skipper", 60_000));
    expect(dailyTag("skipper", 0)).not.toBe(dailyTag("skipper", day));
    expect(dailyTag("skipper", 0)).toHaveLength(4);
    expect(dailyTag("pebble", 0)).not.toBe(dailyTag("skipper", 0));
  });

  it("marks a known sailor and leaves an unknown name as text", () => {
    const names = new Set(["pebble"]);
    expect(mentionParts("on @pebble and @nope", names)).toEqual([
      { text: "on ", mention: false },
      { text: "@pebble", mention: true },
      { text: " and ", mention: false },
      { text: "@nope", mention: false },
    ]);
  });

  it("counts lines that arrived while that room was closed", () => {
    const first = unreadCounts([{ channel: "world", roomId: "world" }], {}, null);
    expect(first.unread.world).toBeUndefined();
    expect(first.unread["world:world"]).toBe(0);
    const next = unreadCounts(
      [
        { channel: "world", roomId: "world" },
        { channel: "world", roomId: "world" },
      ],
      first.seen,
      null,
    );
    expect(next.unread["world:world"]).toBe(1);
    const reading = unreadCounts(
      [
        { channel: "world", roomId: "world" },
        { channel: "world", roomId: "world" },
      ],
      next.seen,
      "world:world",
    );
    expect(reading.unread["world:world"]).toBe(0);
  });

  it("keeps a saved room and drops a broken one", () => {
    const raw = writePracticeChat([{ channel: "world", roomId: "world", fromId: "player", text: "hi", at: 1 }]);
    expect(readPracticeChat(raw)).toEqual([{ channel: "world", roomId: "world", fromId: "player", text: "hi", at: 1 }]);
    expect(readPracticeChat('{"v":1,"lines":[{"channel":"nope"}]}')).toEqual([]);
    expect(readPracticeChat("not json")).toEqual([]);
  });

  it("joins a quick follow-up and starts again after a pause or another sailor", () => {
    const first = { fromId: "skipper", at: 0 };
    expect(continuesChat(undefined, first)).toBe(false);
    expect(continuesChat(first, { fromId: "skipper", at: 1_000 })).toBe(true);
    expect(continuesChat(first, { fromId: "pebble", at: 1_000 })).toBe(false);
    expect(continuesChat(first, { fromId: "skipper", at: CHAT_RUN_MS })).toBe(false);
    expect(continuesChat(first, { fromId: "skipper", at: -1 })).toBe(false);
  });

  it("renders the room, the daily tag, and a sailor mention", () => {
    const game = new ShoalGame(0);
    expect(game.say("world", "hello @skipper", 1).ok).toBe(true);
    expect(game.say("world", "still here", 2_000).ok).toBe(true);
    const html = renderToStaticMarkup(createElement(CornerSocial, { game, snap: snapOf(game) }));
    const empty = renderToStaticMarkup(createElement(CornerSocial, { game: new ShoalGame(0), snap: snapOf(new ShoalGame(0)) }));
    expect(empty).toContain("Nobody has said anything yet — say hi.");
    expect(html).not.toContain("A name is a practice label.");
    expect(html).not.toContain("another device does not follow");
    expect(html).not.toContain("· you");
    expect(html).toContain("skipper");
    expect(html).toContain("Vietnam skipper");
    expect(html).toContain(flagImageSrc("VN"));
    expect(html).not.toContain("🇻🇳");
    expect(html).not.toContain("aria-label=\"Country\"");
    expect(html).not.toContain("aria-label=\"Party country\"");
    expect(html).toContain(`#${dailyTag(PLAYER_ID, 1)}`);
    expect(html.match(/chat-tag/g)).toHaveLength(1);
    expect(html).toContain("continues");
    expect(html).toContain("chat-mention");
    expect(html).toContain("is-mine");
    expect(html).not.toContain("is-fresh");
    expect(html).toContain("1 here");
  });

  it("marks a line from the last few seconds and leaves an older line quiet", () => {
    const game = new ShoalGame(0);
    expect(game.say("world", "older note", 1).ok).toBe(true);
    expect(game.say("world", "just in", Date.now()).ok).toBe(true);
    const html = renderToStaticMarkup(createElement(CornerSocial, { game, snap: snapOf(game) }));
    expect(html).toContain("social-chat-line is-mine is-head\"");
    expect(html.indexOf("older note")).toBeLessThan(html.indexOf("is-fresh"));
    expect(html).toContain("is-fresh");
    expect(html.indexOf("is-fresh")).toBeLessThan(html.indexOf("just in"));
  });

  it("keeps the friend list to one empty line until someone is actually there", () => {
    const empty = renderToStaticMarkup(createElement(CornerSocial, { game: new ShoalGame(0), snap: snapOf(new ShoalGame(0)) }));
    expect(empty).toContain("No friends yet.");
    expect(empty).not.toContain("No incoming requests.");
    expect(empty).not.toContain("No sent requests.");
    expect(empty).not.toContain("No accepted friends yet.");
    expect(empty).toContain("Same crew cannot bite.");
    expect(empty).not.toContain("chat-tool");
    expect(empty).not.toContain(">Sea<");
    expect(empty).not.toContain(">Close<");
    expect(empty).not.toContain("They stay in this browser.");
    expect(empty).toContain(">Profile<");
    expect(empty).toContain(">Party<");
    expect(empty).toContain("A friend joins after Accept.");
    expect(empty).not.toContain("does not show that party");

    const seated = new ShoalGame(0);
    const me = "0x3cb09e7756199222939df0378e0ae8f8d2360b28";
    const other = "0x8eaae9f664214987204616dd8145bacad48044f6";
    seated.seatArcCrew(me, 1, "VN", [me, other]);
    const crewSnap = snapOf(seated);
    crewSnap.arcCrew = seated.arcCrewView();
    const crewHtml = renderToStaticMarkup(createElement(CornerSocial, { game: seated, snap: crewSnap }));
    expect(crewHtml).toContain("Party · VN · 2");
    expect(crewHtml).toContain(me);
    expect(crewHtml).toContain(other);
    expect(crewHtml).toContain('aria-label="Party members"');

    const game = new ShoalGame(0);
    game.seedPracticeCast(0);
    const html = renderToStaticMarkup(createElement(CornerSocial, { game, snap: snapOf(game) }));
    expect(html).toContain('aria-label="Incoming requests"');
    expect(html).toContain(">Accept<span");
    expect(html).toContain(">Decline<span");
    expect(html).toContain("friend-list");
    expect(html).not.toContain("No friends yet.");
    expect(html).not.toContain(">incoming<");
  });

  it("offers a party invite on an accepted Arc friend", () => {
    const game = new ShoalGame(0);
    const me = "0x3cb09e7756199222939df0378e0ae8f8d2360b28";
    const other = "0x8eaae9f664214987204616dd8145bacad48044f6";
    game.meetSailor(other, "minnow");
    expect(game.requestFriend(other, 0).detail).toBe("pending");
    expect(game.receiveFriendAccept(other, "minnow", 1)).toBe(true);
    const html = renderToStaticMarkup(createElement(CornerSocial, { game, snap: snapOf(game) }));
    expect(html).toContain('aria-label="Invite minnow to party"');
    expect(html).not.toContain(">in party<");
    game.seatArcCrew(me, 1, "VN", [me, other]);
    const seated = snapOf(game);
    seated.arcCrew = game.arcCrewView();
    const marked = renderToStaticMarkup(createElement(CornerSocial, { game, snap: seated }));
    expect(marked).toContain(">in party<");
    expect(marked).not.toContain('aria-label="Invite minnow to party"');
  });

  it("shows a live party invite on the party summary", () => {
    const game = new ShoalGame(0);
    game.notePartyInvite("0x8eaae9f664214987204616dd8145bacad48044f6", "VN");
    const snap = snapOf(game);
    snap.partyInvite = game.partyInviteView();
    const html = renderToStaticMarkup(createElement(CornerSocial, { game, snap }));
    expect(html).toContain("Party · VN invited you");
    expect(html).toContain("VN invited you. Accept to join the list.");
  });

  it("lists a party member by profile name and fish level", () => {
    const game = new ShoalGame(0);
    const me = "0x3cb09e7756199222939df0378e0ae8f8d2360b28";
    const other = "0x8eaae9f664214987204616dd8145bacad48044f6";
    const row = (onyxId: number, owner: string, size: "small" | "medium") => ({
      onyxId,
      owner,
      name: "minnow",
      rarity: "common" as const,
      size,
      trait: "swift" as const,
      poolUgnot: 1_000_000,
      inMatch: true,
      bouts: 0,
      image: "",
    });
    game.syncChainRoster(me, [row(2, me, "small"), row(1, other, "medium")], 0);
    game.meetSailor(other, "brine");
    game.seatArcCrew(me, 1, "VN", [me, other]);
    const snap = snapOf(game);
    snap.arcCrew = game.arcCrewView();
    const html = renderToStaticMarkup(createElement(CornerSocial, { game, snap }));
    expect(html).toContain(">skipper<");
    expect(html).toContain(">small<");
    expect(html).toContain(">brine<");
    expect(html).toContain(">medium<");
    expect(html).not.toContain(">minnow<");
  });
});
