import { describe, expect, it } from "vitest";
import { SeaRoom, type SeaPose } from "./seaRoom";

const A = "g1n4pl5uc4yt5r96m9w6fmdznx3x0jyg8l6arhmt";
const B = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";

function pose(address: string, x: number, hp = 100, seq = 0): SeaPose {
  return {
    address,
    onyxId: 1,
    name: "Minnow",
    sailor: address === A ? "skipper" : "brine",
    rarity: "common",
    size: "medium",
    trait: "fang",
    x,
    z: 4,
    fx: 0,
    fz: -1,
    hp,
    hpMax: 100,
    bite: 22,
    alive: true,
    seq,
  };
}

describe("shared sea room", () => {
  it("seats an Arc wallet next to a g1 sailor", () => {
    const room = new SeaRoom();
    const arc = "0x3cb09e7756199222939df0378e0ae8f8d2360b28";
    expect(room.exchange(0, "0xnope", pose(A, 1), [], [])).toBeNull();
    const sat = room.exchange(0, arc, { ...pose(arc, 4), onyxId: 2 }, [], []);
    expect(sat?.seats.map((seat) => seat.address)).toEqual([arc]);
    const both = room.exchange(10, A, pose(A, 8), [], []);
    expect(both?.seats.map((seat) => seat.address).sort()).toEqual([A, arc].sort());
  });

  it("shows both wallets and keeps a bite from being healed by a stale pose", () => {
    const room = new SeaRoom();
    const first = room.exchange(0, A, pose(A, 1), [], []);
    const second = room.exchange(10, B, pose(B, 8), [], []);
    expect(second?.seats.map((seat) => seat.address).sort()).toEqual([A, B].sort());
    expect(first?.seats).toHaveLength(1);
    const bitten = room.exchange(20, A, pose(A, 2, 100, 0), [{ address: B, hp: 70, alive: true }], []);
    const victim = bitten?.seats.find((seat) => seat.address === B);
    expect(victim).toMatchObject({ hp: 70, seq: 1, alive: true });
    const stale = room.exchange(30, B, pose(B, 9, 100, 0), [], []);
    expect(stale?.seats.find((seat) => seat.address === B)).toMatchObject({ hp: 70, x: 9, seq: 1 });
    const gone = room.exchange(9000, A, pose(A, 3), [], []);
    expect(gone?.seats.map((seat) => seat.address)).toEqual([A]);
  });

  it("keeps a bite when the room is saved and ignores a hit that would heal", () => {
    const room = new SeaRoom();
    room.exchange(0, A, pose(A, 1), [], []);
    room.exchange(10, B, pose(B, 8), [], []);
    room.exchange(20, A, pose(A, 2), [{ address: B, hp: 40, alive: true }], []);
    const copy = SeaRoom.fromJSON(JSON.parse(JSON.stringify(room.toJSON())));
    const stale = copy.exchange(30, B, pose(B, 9, 100, 0), [], []);
    expect(stale?.seats.find((seat) => seat.address === B)).toMatchObject({ hp: 40, x: 9, seq: 1 });
    const healed = copy.exchange(40, A, pose(A, 3), [{ address: B, hp: 90, alive: true }], []);
    expect(healed?.seats.find((seat) => seat.address === B)).toMatchObject({ hp: 40, seq: 1 });
    expect(SeaRoom.fromJSON("nope").exchange(0, A, pose(A, 1), [], [])?.seats).toHaveLength(1);
  });

  it("delivers a friend note to the other wallet once", () => {
    const room = new SeaRoom();
    room.exchange(0, A, pose(A, 0), [], []);
    const sent = room.exchange(10, A, pose(A, 1), [], [{ to: B, fromName: "skipper" }]);
    expect(sent?.friends).toEqual([]);
    const heard = room.exchange(20, B, null, [], []);
    expect(heard?.friends).toEqual([expect.objectContaining({ from: A, to: B, fromName: "skipper", kind: "request" })]);
    const again = room.exchange(30, A, pose(A, 1), [], [{ to: B, fromName: "skipper" }]);
    expect(again?.seats.find((seat) => seat.address === B)).toBeUndefined();
    const still = room.exchange(40, B, null, [], []);
    expect(still?.friends).toHaveLength(1);
    const accepted = room.exchange(50, B, null, [], [{ to: A, fromName: "brine", kind: "accept" }]);
    expect(accepted?.friends.some((note) => note.kind === "accept")).toBe(false);
    const back = room.exchange(60, A, pose(A, 2), [], []);
    expect(back?.friends).toEqual([expect.objectContaining({ from: B, to: A, kind: "accept" })]);
    const copy = SeaRoom.fromJSON(JSON.parse(JSON.stringify(room.toJSON())));
    expect(copy.exchange(70, A, pose(A, 3), [], [])?.friends[0]?.kind).toBe("accept");
    const declined = room.exchange(80, A, pose(A, 4), [], [{ to: B, fromName: "skipper", kind: "decline" }]);
    expect(declined?.friends.some((note) => note.kind === "decline")).toBe(false);
    expect(room.exchange(90, B, null, [], [])?.friends.some((note) => note.kind === "decline")).toBe(true);
  });

  it("drops a request once it is declined, then delivers a new one inside the quiet window", () => {
    const room = new SeaRoom();
    room.exchange(0, A, pose(A, 0), [], [{ to: B, fromName: "skipper", kind: "request" }]);
    expect(room.exchange(1_000, B, null, [], [])?.friends.map((note) => note.kind)).toEqual(["request"]);
    room.exchange(2_000, B, null, [], [{ to: A, fromName: "brine", kind: "decline" }]);
    expect(room.exchange(3_000, B, null, [], [])?.friends.some((note) => note.kind === "request")).toBe(false);
    expect(room.exchange(4_000, A, pose(A, 1), [], [])?.friends.some((note) => note.kind === "decline")).toBe(true);
    room.exchange(5_000, A, pose(A, 1), [], [{ to: B, fromName: "skipper", kind: "request" }]);
    expect(room.exchange(6_000, B, null, [], [])?.friends.map((note) => note.kind)).toEqual(["request"]);
  });

  it("delivers a party invite and a join without turning them into friend requests", () => {
    const room = new SeaRoom();
    room.exchange(0, A, pose(A, 0), [], [{ to: B, fromName: "VN", kind: "party" }]);
    expect(room.exchange(10, B, null, [], [])?.friends).toEqual([
      expect.objectContaining({ from: A, to: B, fromName: "VN", kind: "party" }),
    ]);
    room.exchange(20, B, null, [], [{ to: A, fromName: "VN", kind: "joined" }]);
    const heard = room.exchange(30, A, pose(A, 1), [], []);
    expect(heard?.friends.map((note) => note.kind)).toEqual(["joined"]);
    expect(heard?.friends.some((note) => note.kind === "request")).toBe(false);
  });

  it("marks a kill when the reported hp is higher, and a later pose cannot revive it", () => {
    const room = new SeaRoom();
    room.exchange(0, A, { ...pose(A, 1), country: "VN" }, [], []);
    room.exchange(10, B, { ...pose(B, 8), country: "KR" }, [], []);
    room.exchange(20, A, pose(A, 2), [{ address: B, hp: 22, alive: true }], []);
    const dead = room.exchange(30, A, pose(A, 3), [{ address: B, hp: 30, alive: false }], [], [], [{
      id: "kdead01",
      attacker: "skipper",
      attackerCountry: "VN",
      victim: "brine",
      victimCountry: "KR",
      victimAddress: B,
      gnot: 0,
      fish: 10,
    }]);
    expect(dead?.seats.find((seat) => seat.address === B)).toMatchObject({ hp: 22, alive: false });
    expect(dead?.kills).toEqual([expect.objectContaining({
      attacker: "skipper",
      attackerCountry: "VN",
      victim: "brine",
      victimCountry: "KR",
      gnot: 0,
      fish: 10,
    })]);
    const revived = room.exchange(40, B, pose(B, 9, 100, 99), [], []);
    expect(revived?.seats.find((seat) => seat.address === B)).toMatchObject({ hp: 22, alive: false });
    const copy = SeaRoom.fromJSON(JSON.parse(JSON.stringify(room.toJSON())));
    expect(copy.exchange(50, A, pose(A, 4), [], [])?.kills).toHaveLength(1);
  });

  it("drops a closed browser and ignores a bite that would keep the fish here", () => {
    const room = new SeaRoom();
    const tab = "tababcde";
    room.exchange(0, A, pose(A, 1), [], [], [], [], tab);
    room.exchange(0, B, pose(B, 8), [], []);
    const bitten = room.exchange(7_000, A, pose(A, 2), [{ address: B, hp: 40, alive: true }], [], [], [], tab);
    expect(bitten?.seats.map((seat) => seat.address)).toEqual([A]);
    const left = room.exchange(7_100, A, null, [], [], [], [], tab, true);
    expect(left?.seats).toEqual([]);
    const late = room.exchange(7_200, A, pose(A, 3), [], [], [], [], tab);
    expect(late?.seats).toEqual([]);
    const again = room.exchange(7_300, A, pose(A, 4), [], [], [], [], "tabzzzzz");
    expect(again?.seats.map((seat) => seat.address)).toEqual([A]);
  });

  it("keeps the other tab when one tab of the same wallet closes", () => {
    const room = new SeaRoom();
    room.exchange(0, A, pose(A, 1), [], [], [], [], "tab11111");
    room.exchange(50, A, pose(A, 2), [], [], [], [], "tab22222");
    const stayed = room.exchange(100, A, null, [], [], [], [], "tab11111", true);
    expect(stayed?.seats.map((seat) => seat.address)).toEqual([A]);
    const copy = SeaRoom.fromJSON(JSON.parse(JSON.stringify(room.toJSON())));
    const ignored = copy.exchange(150, A, pose(A, 3), [], [], [], [], "tab11111");
    expect(ignored?.seats).toHaveLength(1);
    expect(ignored?.seats[0]?.x).toBe(2);
    expect(copy.exchange(200, A, pose(A, 4), [], [], [], [], "tab22222")?.seats[0]?.x).toBe(4);
  });

  it("delivers a world line to the other wallet once", () => {
    const room = new SeaRoom();
    room.exchange(0, A, { ...pose(A, 1), country: "VN", sailor: "skipper" }, [], []);
    const sent = room.exchange(10, A, pose(A, 1), [], [], [{ id: "chello1", text: "hello", country: "VN", at: 10, fromName: "skipper" }]);
    expect(sent?.chats).toEqual([expect.objectContaining({ from: A, fromName: "skipper", country: "VN", text: "hello", at: 10 })]);
    const again = room.exchange(20, A, pose(A, 1), [], [], [{ id: "chello1", text: "hello again", at: 20 }]);
    expect(again?.chats).toHaveLength(1);
    const heard = room.exchange(30, B, null, [], []);
    expect(heard?.chats.map((line) => line.text)).toEqual(["hello"]);
  });
});
