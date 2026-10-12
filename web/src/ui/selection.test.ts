import { describe, expect, it } from "vitest";
import { createPracticeGame, PLAYER_ID, VIEWER_ID } from "../sim/game";
import { canCheerFish, hasLivePlayer, seaFish } from "./selection";

function snapshot(game: ReturnType<typeof createPracticeGame>) {
  return { fish: [...game.fish.values()], matches: game.matches, activeFishId: game.activeFishId };
}

describe("UI sea selection", () => {
  it("excludes owned NFTs that are alive but not in a live match", () => {
    const game = createPracticeGame(1000);
    game.seedPracticeCast(1000);
    const fish = snapshot(game).fish[0];
    expect(fish).toBeDefined();
    fish.alive = true;
    fish.burned = false;
    fish.matchId = null;
    expect(seaFish(snapshot(game)).some((item) => item.id === fish.id)).toBe(false);
    game.activeFishId = fish.id;
    expect(hasLivePlayer(snapshot(game))).toBe(false);
  });

  it("uses the existing cheer ownership exclusions", () => {
    const game = createPracticeGame(1000);
    game.seedPracticeCast(1000);
    const fish = snapshot(game).fish[0];
    expect(canCheerFish(null)).toBe(false);
    expect(canCheerFish({ ...fish, ownerId: PLAYER_ID })).toBe(false);
    expect(canCheerFish({ ...fish, ownerId: VIEWER_ID })).toBe(false);
    expect(canCheerFish({ ...fish, ownerId: "another-sailor" })).toBe(true);
  });

  it("invalidates follow and phase protection when live membership ends", () => {
    const game = createPracticeGame(1000);
    game.seedPracticeCast(1000);
    const snap = snapshot(game);
    const fish = seaFish(snap)[0];
    expect(fish).toBeDefined();
    game.activeFishId = fish.id;
    expect(hasLivePlayer(snapshot(game))).toBe(true);
    fish.burned = true;
    expect(seaFish(snapshot(game)).some((item) => item.id === fish.id)).toBe(false);
    expect(hasLivePlayer(snapshot(game))).toBe(false);
  });
});
