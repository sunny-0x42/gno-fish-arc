import { describe, expect, it } from "vitest";
import { lastSeats, leaveSea, queueChat, queueFriend, syncSea, takeChatQueue } from "./seaLink";

const A = "g1n4pl5uc4yt5r96m9w6fmdznx3x0jyg8l6arhmt";
const B = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";

describe("sea link", () => {
  it("retries a friend note when the room is down, then keeps the seats", async () => {
    const original = globalThis.fetch;
    queueFriend(B, "skipper");
    globalThis.fetch = async () => {
      throw new Error("down");
    };
    const failed = await syncSea(A, null, []);
    expect(failed.ok).toBe(false);
    expect(lastSeats()).toEqual([]);
    let body = "";
    globalThis.fetch = async (_url, init) => {
      body = String(init?.body ?? "");
      return new Response(JSON.stringify({
        seats: [{ address: B, name: "Brine", sailor: "brine", x: 4, z: 4, hp: 90, seq: 1 }],
        friends: [],
      }), { status: 200 });
    };
    const lived = await syncSea(A, null, []);
    expect(lived.ok).toBe(true);
    expect(body).toContain(B);
    expect(body).toContain("skipper");
    expect(body).toContain("\"kind\":\"request\"");
    expect(body).toContain("\"chats\":[]");
    expect(body).toContain("\"kills\":[]");
    expect(lastSeats().map((seat) => seat.address)).toEqual([B]);
    globalThis.fetch = original;
  });

  it("sends a world line with an id the room keeps", async () => {
    const original = globalThis.fetch;
    queueChat("hello", "VN", 5, "skipper");
    const lines = takeChatQueue();
    let body = "";
    globalThis.fetch = async (_url, init) => {
      body = String(init?.body ?? "");
      return new Response(JSON.stringify({ seats: [], friends: [], chats: [], kills: [] }), { status: 200 });
    };
    await syncSea(A, null, [], lines, []);
    const sent = JSON.parse(body) as { chats: { id: string; text: string; country: string }[] };
    expect(sent.chats[0]?.text).toBe("hello");
    expect(sent.chats[0]?.country).toBe("VN");
    expect(sent.chats[0]?.id).toMatch(/^c[a-z0-9]{4,20}$/);
    globalThis.fetch = original;
  });

  it("sends a close so the same tab cannot sit back down from a late pose", async () => {
    const original = globalThis.fetch;
    let body = "";
    let keepalive = false;
    globalThis.fetch = async (_url, init) => {
      body = String(init?.body ?? "");
      keepalive = init?.keepalive === true;
      return new Response("{}", { status: 200 });
    };
    leaveSea(A);
    const sent = JSON.parse(body) as { address: string; boot: string; bye: boolean; pose: null };
    expect(sent.address).toBe(A);
    expect(sent.bye).toBe(true);
    expect(sent.pose).toBeNull();
    expect(sent.boot).toMatch(/^[a-z0-9]{8}$/);
    expect(keepalive).toBe(true);
    globalThis.fetch = original;
  });
});
