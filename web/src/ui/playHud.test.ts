import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SeaKill } from "../chain/seaRoom";
import { clearSession, writeSession } from "../chain/session";
import { UGNOT } from "../sim/catalog";
import { PLAYER_ID, ShoalGame, VIEWER_ID } from "../sim/game";
import { STAKE_MIN_UGNOT } from "../sim/tokenomics";
import { mergeKillFeed, SeaTicker } from "./MatchHud";
import { PlayHud } from "./Panels";
import type { ShoalSnap } from "./useShoal";

function snapOf(game: ShoalGame): ShoalSnap {
  return {
    fish: game.fish.map((fish) => ({ ...fish })),
    cheers: [],
    claims: [],
    parties: [...game.parties.values()].map((group) => ({ ...group })),
    clans: [...game.clans.values()].map((group) => ({ ...group })),
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
    activeFishId: game.activeFishId,
    viewMatchId: game.viewMatchId,
  };
}

describe("play hud", () => {
  it("keeps the sea card to name, health, and balances, and offers W A S D", () => {
    const game = new ShoalGame(0);
    expect(game.mint("small", "Minnow", 0, "fang").ok).toBe(true);
    expect(game.setProfile("sailor", "Vietnam", "wave", 0).ok).toBe(true);
    const fish = game.owned(PLAYER_ID)[0];
    expect(game.register(fish.id, STAKE_MIN_UGNOT, 0).ok).toBe(true);
    writeSession({ address: `g1${"a".repeat(38)}`, chainId: "onyx-1", ugnot: 123 * UGNOT });
    const html = renderToStaticMarkup(createElement(PlayHud, {
      game,
      snap: snapOf(game),
      now: 0,
      onMint: () => undefined,
      onLeave: () => undefined,
    }));
    clearSession();
    expect(html).not.toContain("Practice wallet");
    expect(html).not.toContain("Locked stake");
    expect(html).not.toContain("Growth");
    expect(html).not.toContain("2,000.00");
    expect(html).not.toContain("1,990.00");
    expect(html).not.toContain("FISH");
    expect(html).toContain("Wallet 123.00 USDC");
    expect(html).not.toContain("Connected wallets share this sea");
    expect(html).toContain("sailor");
    expect(html).toContain("https://flagcdn.com/w40/vn.png");
    expect(html).not.toContain(">Minnow<");
    expect(html).toContain('aria-label="Move forward"');
    expect(html).toContain('aria-label="Turn left"');
    expect(html).toContain('aria-label="Move back"');
    expect(html).toContain('aria-label="Turn right"');
    expect(html).toContain(">W<");
    expect(html).toContain(">A<");
    expect(html).toContain(">S<");
    expect(html).toContain(">D<");
  });

  it("prints the USDC and FISH from a kill, and the stake lost when downed", () => {
    const game = new ShoalGame(0);
    expect(game.mint("small", "Minnow", 0, "fang").ok).toBe(true);
    const fish = game.owned(PLAYER_ID)[0];
    expect(game.register(fish.id, STAKE_MIN_UGNOT, 0).ok).toBe(true);
    const live = snapOf(game);
    live.log = [{
      id: "log-win",
      at: 1e15,
      text: "Minnow downed Pebble. Killer 8.00 USDC and 10 FISH. Lost 16.00 USDC.",
      attackerId: fish.id,
      victimId: "pebble",
    }];
    const liveHtml = renderToStaticMarkup(createElement(PlayHud, {
      game,
      snap: live,
      now: 0,
      onMint: () => undefined,
      onLeave: () => undefined,
    }));
    expect(liveHtml).toContain("+8.00 USDC · +10 FISH");
    expect(liveHtml).not.toContain("-16.00");

    fish.matchId = null;
    fish.mustHeal = true;
    const down = snapOf(game);
    down.log = [{
      id: "log-loss",
      at: 1e15,
      text: "Pebble downed Minnow. Killer 8.00 USDC and 10 FISH. Lost 10.00 USDC.",
      attackerId: "pebble",
      victimId: fish.id,
    }];
    const downHtml = renderToStaticMarkup(createElement(PlayHud, {
      game,
      snap: down,
      now: 0,
      onMint: () => undefined,
      onLeave: () => undefined,
    }));
    expect(downHtml).toContain("-10.00 USDC · 0 FISH");
    expect(downHtml).toContain("needs a heal");
  });
});

describe("sea ticker", () => {
  const line = (id: string, at: number, attacker: string): SeaKill => ({
    id,
    at,
    attacker,
    attackerCountry: attacker === "skipper" ? "VN" : "KR",
    victim: "brine",
    victimCountry: "KR",
    gnot: 0,
    fish: 10,
  });

  it("draws the newest kill on screen twice, with flag pictures", () => {
    const html = renderToStaticMarkup(createElement(SeaTicker, { kills: [line("kabc1234", 2, "skipper")] }));
    expect(html.match(/sea-ticker-copy/g)?.length).toBe(2);
    expect(html).toContain("skipper");
    expect(html).toContain("downed");
    expect(html).toContain("brine");
    expect(html).toContain("0.00 USDC");
    expect(html).toContain("10 FISH");
    expect(html).toContain("https://flagcdn.com/w40/vn.png");
    expect(html).toContain("https://flagcdn.com/w40/kr.png");
    expect(renderToStaticMarkup(createElement(SeaTicker, { kills: [] }))).toBe("");
  });

  it("keeps the killer's line when the room echoes the same id", () => {
    const local = line("kabc1234", 5, "skipper");
    const echo = { ...line("kabc1234", 9, "other"), gnot: 4, fish: 1 };
    const older = line("kolder01", 1, "kelp");
    const merged = mergeKillFeed([local], [echo, older]);
    expect(merged.map((kill) => kill.id)).toEqual(["kabc1234", "kolder01"]);
    expect(merged[0]).toMatchObject({ attacker: "skipper", gnot: 0, fish: 10 });
  });
});
