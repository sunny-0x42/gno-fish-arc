import { describe, expect, it } from "vitest";
import { INTRO, introIndex, PRACTICE_LINE, STORY } from "./welcomeIntro";

describe("welcome intro", () => {
  it("plays the sea, the mouth, the hold, and the meal before the species card", () => {
    expect(INTRO.map((beat) => beat.id)).toEqual(["title", "sea", "mouth", "hold", "grow", "enter"]);
    expect(INTRO[0].title).toBe("FISH");
    expect(INTRO[0].body).toBe("Big fish bite little fish.");
    expect(STORY.map((beat) => beat.id)).toEqual(["sea", "mouth", "hold", "grow"]);
    expect(INTRO.find((beat) => beat.id === "sea")?.body).toContain("5 quiet seconds");
    expect(INTRO.find((beat) => beat.id === "mouth")?.body).toContain("in front of the mouth");
    expect(INTRO.find((beat) => beat.id === "hold")?.body).toContain("A and D turn");
    expect(INTRO.find((beat) => beat.id === "hold")?.body).toContain("glides");
    expect(INTRO.find((beat) => beat.id === "grow")?.body).toContain("The tier stays");
    expect(PRACTICE_LINE).toBe("Stake 1 USDC into the pool to enter. There is no practice sea.");
  });

  it("stays on the last card and does not promise a payout", () => {
    expect(introIndex(-1)).toBe(0);
    expect(introIndex(99)).toBe(INTRO.length - 1);
    const text = INTRO.map((beat) => `${beat.title} ${beat.body}`).join(" ").toLowerCase();
    expect(text).not.toMatch(/profit|yield|earn|apy/);
  });
});
