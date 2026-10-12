import { describe, expect, it } from "vitest";
import { createPracticeGame, VIEWER_ID } from "../sim/game";

describe("read-only spectator timing", () => {
  it("preserves the original watch start and clears it on exit", () => {
    const game = createPracticeGame(1000);
    expect(game.watchStartedAt(VIEWER_ID)).toBeNull();
    game.setWatching(VIEWER_ID, true, 2000);
    expect(game.watchStartedAt(VIEWER_ID)).toBe(2000);
    game.setWatching(VIEWER_ID, true, 9000);
    expect(game.watchStartedAt(VIEWER_ID)).toBe(2000);
    game.setWatching(VIEWER_ID, false, 10000);
    expect(game.watchStartedAt(VIEWER_ID)).toBeNull();
    game.setWatching(VIEWER_ID, true, 12000);
    expect(game.watchStartedAt(VIEWER_ID)).toBe(12000);
  });

  it("reads without changing watching or emitting updates", () => {
    const game = createPracticeGame(1000);
    let updates = 0;
    const unsubscribe = game.subscribe(() => updates++);
    game.setWatching(VIEWER_ID, true, 0);
    const before = updates;
    expect(game.watchStartedAt(VIEWER_ID)).toBe(0);
    expect(game.watchStartedAt("unknown-viewer")).toBeNull();
    expect(updates).toBe(before);
    expect(game.watching.has(VIEWER_ID)).toBe(true);
    unsubscribe();
  });
});
