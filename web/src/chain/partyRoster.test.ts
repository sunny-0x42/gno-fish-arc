import { describe, expect, it } from "vitest";
import { ShoalGame } from "../sim/game";
import { readArcCrew, readArcUsername, syncArcParty, type PartyCall } from "./partyRoster";

const ME = "0x3cb09e7756199222939df0378e0ae8f8d2360b28";
const OTHER = "0x8eaae9f664214987204616dd8145bacad48044f6";

function word(value: number): string {
  return value.toString(16).padStart(64, "0");
}

function addressWord(addr: string): string {
  return `0x${addr.slice(2).toLowerCase().padStart(64, "0")}`;
}

/** ABI string "VN", the live crew 1 name. */
const VN = `0x${word(32)}${word(2)}564e${"0".repeat(60)}`;

function crewCall(count = 1, member = ME): PartyCall {
  return async (data: string) => {
    const body = data.toLowerCase();
    if (body.startsWith("0x2cea2d3b")) return `0x${word(1)}`;
    if (body.startsWith("0x051a2664")) return VN;
    if (body.startsWith("0x6e8165e8")) return `0x${word(count)}`;
    if (body.startsWith("0xd0fb813b")) return addressWord(member);
    throw new Error(data);
  };
}

/** ABI string "reef". */
const REEF = `0x${word(32)}${word(4)}72656566${"0".repeat(56)}`;

describe("Arc party roster", () => {
  it("reads a FishProfile username and ignores an empty card", async () => {
    const call: PartyCall = async (data) => {
      if (data.toLowerCase().startsWith("0x7898acef")) return REEF;
      throw new Error(data);
    };
    expect(await readArcUsername(ME, call)).toBe("reef");
    const empty: PartyCall = async () => `0x${word(32)}${word(0)}`;
    expect(await readArcUsername(OTHER, empty)).toBeNull();
    expect(await readArcUsername("not-a-wallet", call)).toBeNull();
  });

  it("reads the VN crew and its member from FishParty words", async () => {
    const crew = await readArcCrew(ME, crewCall());
    expect(crew).toEqual({ id: 1, name: "VN", members: [ME] });
  });

  it("returns null for a wallet with no seat", async () => {
    const call: PartyCall = async (data) => {
      if (data.toLowerCase().startsWith("0x2cea2d3b")) return `0x${word(0)}`;
      throw new Error("name should not be read");
    };
    expect(await readArcCrew(OTHER, call)).toBeNull();
    expect(await readArcCrew("not-a-wallet", call)).toBeNull();
  });

  it("keeps the seated crew when the party read throws", async () => {
    const game = new ShoalGame(0);
    game.seatArcCrew(ME, 1, "VN", [ME, OTHER]);
    const thrown: PartyCall = async () => {
      throw new Error("rpc");
    };
    expect(await syncArcParty(game, ME, thrown)).toBeNull();
    expect(game.arcCrewView()).toEqual({ id: 1, name: "VN", members: [ME, OTHER] });
    const empty: PartyCall = async (data) => {
      if (data.toLowerCase().startsWith("0x2cea2d3b")) return `0x${word(0)}`;
      throw new Error("unread");
    };
    expect(await syncArcParty(game, ME, empty)).toBeNull();
    expect(game.arcCrewView()).toBeNull();
  });
});
