import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { clearSession, writeSession } from "../chain/session";
import { WATCH_ADDRESS } from "../chain/watchDesk";
import { PLAYER_ID, ShoalGame, VIEWER_ID } from "../sim/game";
import { Gate } from "./Panels";
import { SeaBook } from "./MatchHud";
import { SeasonBoard } from "./SeasonBoard";
import {
  SEASON0_PLACES,
  SEASON0_POOL,
  SEASON0_PRIZES,
  season0Board,
  season0Prize,
  season0You,
  season0YouLine,
} from "./seasonPrize";
import {
  formatSeasonUtc,
  isDeployWallet,
  parseSeasonUtc,
  readSeasonWindow,
  seasonWindowError,
  seasonWindowLine,
  writeSeasonWindow,
  SEASON0_EARLIEST_MS,
} from "./seasonWindow";
import type { ShoalSnap } from "./useShoal";

const fish = (id: string, ownerId: string) => ({ id, ownerId });

function snapOf(game: ShoalGame, scores: ShoalSnap["scores"] = {}): ShoalSnap {
  return {
    fish: game.fish.map((item) => ({ ...item })),
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
    scores,
    matches: [],
    activeFishId: game.activeFishId,
    viewMatchId: game.viewMatchId,
  };
}

describe("season 0 prizes", () => {
  it("pays 20 places and the prizes add to 100,000", () => {
    expect(SEASON0_PRIZES).toHaveLength(SEASON0_PLACES);
    expect(SEASON0_PRIZES.reduce((sum, prize) => sum + prize, 0)).toBe(SEASON0_POOL);
    expect(SEASON0_PRIZES.every((prize, index) => Number.isInteger(prize) && prize > 0 && (index === 0 || prize < SEASON0_PRIZES[index - 1]))).toBe(true);
    expect(season0Prize(1)).toBe(16_000);
    expect(season0Prize(20)).toBe(1_000);
    expect(season0Prize(0)).toBe(0);
    expect(season0Prize(21)).toBe(0);
  });

  it("ranks sailors by kills, then fewer downs, and leaves a kill-less sailor off the prize", () => {
    const profiles = [
      { id: "player", username: "skipper" },
      { id: "otter", username: "otter" },
      { id: "brine", username: "brine" },
    ];
    const roster = [
      fish("a", "player"),
      fish("b", "player"),
      fish("c", "otter"),
      fish("d", "brine"),
      fish("e", "quiet"),
    ];
    const scores = {
      a: { kills: 1, downs: 4 },
      b: { kills: 2, downs: 0 },
      c: { kills: 3, downs: 2 },
      d: { kills: 3, downs: 1 },
      e: { kills: 0, downs: 9 },
    };
    const rows = season0Board(roster, scores, profiles, "player");
    expect(rows).toHaveLength(20);
    expect(rows.slice(0, 3).map((row) => [row.place, row.name, row.kills, row.prize, row.yours])).toEqual([
      [1, "brine", 3, 16_000, false],
      [2, "otter", 3, 12_500, false],
      [3, "skipper", 3, 10_000, true],
    ]);
    expect(rows[3]).toMatchObject({ place: 4, name: "Open", prize: 8_000, open: true, yours: false });
    expect(rows.map((row) => row.prize).reduce((sum, prize) => sum + prize, 0)).toBe(SEASON0_POOL);
    expect(rows.some((row) => row.name === "Unnamed sailor" || row.name === "quiet")).toBe(false);
    const you = season0You(roster, scores, profiles, "player");
    expect(you).toMatchObject({ name: "skipper", kills: 3, downs: 4, place: 3, prize: 10_000 });
    expect(season0YouLine(you)).toBe("You are 3rd in this browser with 3 kills. 10,000 FISH is a draft figure and is not paid.");
  });

  it("keeps a sailor outside the top 20 off the prize", () => {
    const roster = Array.from({ length: 21 }, (_, index) => fish(`f${index}`, `o${index}`));
    const scores = Object.fromEntries(roster.map((item, index) => [item.id, { kills: index === 20 ? 1 : 30 - index, downs: 0 }]));
    const profiles = roster.map((item, index) => ({ id: item.ownerId, username: `sail${index}` }));
    const rows = season0Board(roster, scores, profiles, "o20");
    expect(rows.every((row) => !row.yours)).toBe(true);
    expect(rows[19].name).toBe("sail19");
    const you = season0You(roster, scores, profiles, "o20");
    expect(you.place).toBe(21);
    expect(you.prize).toBe(0);
    expect(season0YouLine(you)).toBe("You are 21st in this browser with 1 kill. The prize stops at 20.");
    expect(season0YouLine(season0You([], {}, [{ id: "player", username: "reef" }], "player"))).toBe(
      "You have no kills in this browser yet. A place on this list opens when a kill lands.",
    );
  });
});

describe("season 0 board", () => {
  afterEach(() => clearSession());

  it("shows the reserved prize and does not offer a withdrawal", () => {
    const game = new ShoalGame(0);
    const html = renderToStaticMarkup(createElement(SeasonBoard, { snap: snapOf(game) }));
    expect(html).toContain("Season 0 — Beta");
    expect(html).toContain("100,000 FISH");
    expect(html).toContain("for the top 20 sailors");
    expect(html).toContain("not a board across wallets");
    expect(html).toContain("cannot be withdrawn from the FISH token");
    expect(html).toContain("cannot be withdrawn");
    expect(html).toContain("not minted as a payout");
    expect(html).toContain("This table is a draft and FISH is not paid.");
    expect(html).toContain(">Open<");
    expect(html).toContain(">16,000<");
    expect(html).toContain(">1,000<");
    expect(html).toContain("You have no kills in this browser yet.");
    expect(html).toContain("Start 2026-10-08 07:00 UTC. End not set. Times are UTC.");
    expect(html).toContain("Saving that window does not send a chain call.");
    expect(html).not.toContain("Save window");
    expect(html).not.toMatch(/apy|yield/i);
    expect(html).not.toMatch(/<button[^>]*>\s*Claim/);
  });

  it("sits on the gate and in the sea book without replacing the practice board", () => {
    const game = new ShoalGame(0);
    const snap = snapOf(game);
    const gate = renderToStaticMarkup(createElement(Gate, {
      snap,
      mode: "gate",
      onPlay: () => undefined,
      onWatch: () => undefined,
    }));
    expect(gate).toContain("Choose Play or Watch.");
    expect(gate).toContain("Season 0 — Beta");
    expect(gate).toContain("100,000 FISH");
    const book = renderToStaticMarkup(createElement(SeaBook, { snap, fishId: null }));
    expect(book).toContain(">Board<");
    expect(book).toContain(">Season<");
    expect(book).toContain("aria-controls=\"sea-season\"");
    expect(book).not.toContain("100,000 FISH");
  });

  it("keeps the season window off a session that is not the deploy wallet", () => {
    const game = new ShoalGame(0);
    const snap = snapOf(game);
    writeSession({ address: WATCH_ADDRESS, chainId: "onyx-1", ugnot: null });
    const deploy = renderToStaticMarkup(createElement(SeasonBoard, { snap }));
    expect(deploy).not.toContain("Save window");
    expect(deploy).toContain("Start 2026-10-08 07:00 UTC. End not set. Times are UTC.");
    clearSession();
    writeSession({ address: "g1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", chainId: "onyx-1", ugnot: null });
    const other = renderToStaticMarkup(createElement(SeasonBoard, { snap }));
    expect(other).not.toContain("Save window");
    expect(other).toContain("Start 2026-10-08 07:00 UTC. End not set. Times are UTC.");
  });
});

describe("season 0 window", () => {
  afterEach(() => clearSession());

  function memory() {
    const box = new Map<string, string>();
    return {
      getItem: (key: string) => box.get(key) ?? null,
      setItem: (key: string, value: string) => { box.set(key, value); },
    };
  }

  it("keeps the open at 07:00 UTC and rejects an earlier start", () => {
    expect(formatSeasonUtc(SEASON0_EARLIEST_MS)).toBe("2026-10-08 07:00 UTC");
    expect(parseSeasonUtc("2026-10-08", "07:00")).toBe(SEASON0_EARLIEST_MS);
    expect(parseSeasonUtc("2026-02-31", "07:00")).toBeNull();
    expect(seasonWindowError(SEASON0_EARLIEST_MS - 60_000, SEASON0_EARLIEST_MS + 3_600_000)).toBe(
      "The earliest start is 2026-10-08 07:00 UTC.",
    );
    expect(seasonWindowError(SEASON0_EARLIEST_MS, SEASON0_EARLIEST_MS)).toBe("End is after the start.");
    expect(seasonWindowLine({ start: SEASON0_EARLIEST_MS, end: null })).toBe(
      "Start 2026-10-08 07:00 UTC. End not set. Times are UTC.",
    );
    const end = SEASON0_EARLIEST_MS + 86_400_000;
    expect(seasonWindowLine({ start: SEASON0_EARLIEST_MS, end })).toBe(
      "Start 2026-10-08 07:00 UTC. End 2026-10-09 07:00 UTC. Times are UTC.",
    );
    expect(isDeployWallet(WATCH_ADDRESS)).toBe(true);
    expect(isDeployWallet(` ${WATCH_ADDRESS.toUpperCase()} `)).toBe(true);
    expect(isDeployWallet("g1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBe(false);
    expect(isDeployWallet(null)).toBe(false);
    const store = memory();
    expect(readSeasonWindow(store)).toEqual({ start: SEASON0_EARLIEST_MS, end: null });
    expect(writeSeasonWindow(SEASON0_EARLIEST_MS - 1, end, store)).toBeNull();
    expect(writeSeasonWindow(SEASON0_EARLIEST_MS, end, store)).toEqual({ start: SEASON0_EARLIEST_MS, end });
    expect(readSeasonWindow(store)).toEqual({ start: SEASON0_EARLIEST_MS, end });
    store.setItem("shoal.season0", "{\"v\":1,\"start\":1,\"end\":2}");
    expect(readSeasonWindow(store)).toEqual({ start: SEASON0_EARLIEST_MS, end: null });
  });
});
