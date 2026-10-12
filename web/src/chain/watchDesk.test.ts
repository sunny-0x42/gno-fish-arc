import { describe, expect, it } from "vitest";
import { FISH_PKG } from "./realmCalls";
import { loadWatch, parseWatch, WATCH_ADDRESS, watchAllowed } from "./watchDesk";

const row = (data: string): { data: string; log: string } => ({ data, log: "" });

describe("watch desk", () => {
  it("opens only the one view address", () => {
    expect(watchAllowed(WATCH_ADDRESS)).toBe(true);
    expect(watchAllowed(`  ${WATCH_ADDRESS.toUpperCase()}  `)).toBe(true);
    expect(watchAllowed("g1otherwallet000000000000000000000000000")).toBe(false);
    expect(watchAllowed("")).toBe(false);
  });

  it("keeps a panic as unread and a zero party as no crew", () => {
    const snap = parseWatch({
      minted: row("(10 int)"),
      mintPrice: row("(5000000 int64)"),
      supply: row("(10 int64)"),
      royalty: row("(500 int64)"),
      held: row("(1 int64)"),
      username: row('("" string)'),
      country: { data: "", log: "panic: profile" },
      party: row("(0 int)"),
      partyName: row('("skip" string)'),
      members: row("(4 int)"),
      fish: [{
        id: 1,
        uri: row('("{\\"name\\":\\"Minnow\\"}" string)'),
        rarity: row('("common" string)'),
        pool: row("(5000000 int64)"),
        match: row("(false bool)"),
      }],
    });
    expect(snap.minted).toBe(10);
    expect(snap.mintPriceUgnot).toBe(5_000_000);
    expect(snap.royaltyBps).toBe(500);
    expect(snap.username).toBe("");
    expect(snap.country).toBe("");
    expect(snap.partyId).toBe(0);
    expect(snap.partyName).toBe("");
    expect(snap.members).toBe(null);
    expect(snap.fish[0]).toMatchObject({ name: "Minnow", rarity: "common", poolUgnot: 5_000_000, inMatch: false });
  });

  it("queries only the watch address and sends no contract", async () => {
    const seen: string[] = [];
    const snap = await loadWatch(async (expr) => {
      seen.push(expr);
      if (expr === `${FISH_PKG}.TokensOf("${WATCH_ADDRESS}")`) return row('("1" string)');
      if (expr === `${FISH_PKG}.TokenURI("1")`) return row('("{\\"name\\":\\"Minnow\\"}" string)');
      if (expr === `${FISH_PKG}.RarityOf(1)`) return row('("common" string)');
      if (expr === `${FISH_PKG}.PoolOf(1)`) return row("(0 int64)");
      if (expr === `${FISH_PKG}.InMatch(1)`) return row("(true bool)");
      if (expr.endsWith("PartyOf(\"" + WATCH_ADDRESS + "\")")) return row("(0 int)");
      if (expr.endsWith("Minted()")) return row("(10 int)");
      if (expr.endsWith("MintPrice()")) return row("(5000000 int64)");
      return row("(1 int)");
    });
    expect(seen.some((expr) => expr.includes("g1") && !expr.includes(WATCH_ADDRESS))).toBe(false);
    expect(seen.some((expr) => /Mint\(|Register\(|DoContract/.test(expr))).toBe(false);
    expect(snap.fish).toEqual([{ id: 1, name: "Minnow", rarity: "common", poolUgnot: 0, inMatch: true }]);
    expect(snap.partyId).toBe(0);
  });
});
