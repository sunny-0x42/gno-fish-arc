import { describe, expect, it } from "vitest";
import { bayFacts, bayLine, chainLine, classifyFish, duelFacts, duelLine, safePortrait, trialFacts, trialLine, trialStatus, unreadTrialLine } from "./onyxStatus";

describe("onyx fish status", () => {
  it("reads an uninitialized collection from the init panic", () => {
    const status = classifyFish("", "VM panic: fish: init", "");
    expect(status).toEqual({ kind: "uninit" });
    expect(chainLine(status)).toContain("not open yet");
  });

  it("reads a live collection name and minted count", () => {
    const status = classifyFish('("FISH" string)', "", "(2 int)");
    expect(status).toEqual({ kind: "live", name: "FISH", minted: 2, portrait: "" });
    expect(chainLine(status)).toContain("Arc testnet · FISH · 2 minted");
  });

  it("stays unread when the payload has no name", () => {
    expect(classifyFish("", "", "(0 int)")).toEqual({ kind: "unread" });
  });

  it("reads a sealed trial coin and the fishlab strike", () => {
    const read = trialFacts("(true bool)", "", "(36 int)");
    expect(read).toEqual({ sealed: true, strike: 36 });
    expect(trialLine(read)).toBe("Damage on 69 and 88 is 36. This page does not send an upgrade payment.");
  });

  it("stays unread when the sealed read logs an error", () => {
    const read = trialFacts("(true bool)", "panic", "(36 int)");
    expect(read).toEqual({ sealed: false, strike: null });
    expect(trialLine(read)).toContain("Arc status unread");
  });

  it("names an issued coin when the strike differs", () => {
    expect(trialLine(trialFacts("(true bool)", "", "(1 int)"))).toContain("did not return the expected damage");
  });

  it("reads a fishbay strike only when fishmark spender is that realm", () => {
    const realm = "g1mxd8dag6d4pzg3kgkvm5zlm0mswe75zfqch8gf";
    const read = bayFacts(`(36 int)`, "", `("${realm}" .uverse.address)`, "", `("${realm}" .uverse.address)`, "");
    expect(read).toEqual({ strike: 36, spender: realm, realm });
    expect(bayLine(read)).toBe("Bite damage on 69 and 88 is 36. The spender matches the recorded address. Bites stay in this browser.");
    const other = bayFacts("(36 int)", "", `("${realm}" .uverse.address)`, "", '("g1other" .uverse.address)', "");
    expect(bayLine(other)).toContain("does not match the recorded address");
    expect(bayLine(bayFacts("(36 int)", "panic", "", "", "", ""))).toContain("Sea status unread");
    expect(unreadTrialLine()).toContain("Arc status unread");
    const duel = duelFacts('("fishduel-1" string)', "", "(36 int)", "", "(false bool)", "");
    expect(duel).toEqual({ version: "fishduel-1", strike: 36, open: false });
    expect(duelLine(duel)).toBe("The duel record is fishduel-1. Damage on 69 and 88 is 36. The bout is closed. This page does not send Settle.");
    expect(duelLine(duelFacts('("fishduel-1" string)', "", "(36 int)", "", "(true bool)", ""))).toContain("A bout is open");
    expect(duelLine(duelFacts("(36 int)", "panic", "", "", "", ""))).toContain("Duel status unread");
    const empty = { version: "", strike: null, open: null };
    expect(trialStatus({ sealed: true, strike: 36 }, read, duel)).toContain("does not send an upgrade payment");
    expect(trialStatus({ sealed: true, strike: 36 }, read, duel)).toContain("Bites stay in this browser");
    expect(trialStatus({ sealed: true, strike: 36 }, read, duel)).toContain("does not send Settle");
    expect(unreadTrialLine()).toContain("Arc status unread");
    expect(unreadTrialLine()).toContain("does not send Settle");
    expect(trialStatus({ sealed: false, strike: null }, { strike: null, spender: "", realm: "" }, empty)).toContain("Arc status unread");
  });

  it("keeps one https portrait and drops anything else", () => {
    const url = "https://gateway.pinata.cloud/ipfs/bafybeighbcoi7d7mgtaj6ihqrdbgeuclm3gwoyb52wlz4e6mmkbpjmq47u";
    expect(safePortrait(`("${url}" string)`)).toBe(url);
    expect(safePortrait('("http://shoal.example/a.png" string)')).toBe("");
    expect(safePortrait('("https://shoal.example/a|b.png" string)')).toBe("");
  });
});
