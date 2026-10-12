import { describe, expect, it } from "vitest";
import { friendStorageKey, readStoredFriends, writeStoredFriends } from "./friendStore";

const OTHER = "0x8eaae9f664214987204616dd8145bacad48044f6";

describe("friend storage", () => {
  it("keeps an accepted friend and drops a broken row", () => {
    const raw = writeStoredFriends([{ other: OTHER, username: "minnow", status: "accepted", incoming: false }]);
    expect(friendStorageKey("0x3cb09e7756199222939df0378e0ae8f8d2360b28")).toBe(
      "shoal.friends.v1.0x3cb09e7756199222939df0378e0ae8f8d2360b28",
    );
    expect(readStoredFriends(raw)).toEqual([{ other: OTHER, username: "minnow", status: "accepted", incoming: false }]);
    expect(readStoredFriends("{\"v\":1,\"links\":[{\"other\":\"nope\",\"username\":\"minnow\",\"status\":\"accepted\"}]}")).toEqual([]);
    expect(readStoredFriends("not-json")).toEqual([]);
    expect(readStoredFriends(null)).toEqual([]);
  });
});