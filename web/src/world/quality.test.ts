import { afterEach, describe, expect, it } from "vitest";
import { GRAPHICS, isGraphicsQuality, readQuality, subscribeQuality, writeQuality } from "./quality";

afterEach(() => writeQuality("balanced"));

describe("graphics quality", () => {
  it("accepts only the three rendering presets", () => {
    expect(isGraphicsQuality("balanced")).toBe(true);
    expect(isGraphicsQuality("ultra")).toBe(false);
    expect(GRAPHICS.low.pixelRatio).toBeLessThan(GRAPHICS.high.pixelRatio);
  });

  it("publishes live changes and detaches listeners", () => {
    let calls = 0;
    const unsubscribe = subscribeQuality(() => { calls++; });
    writeQuality("high");
    expect(readQuality()).toBe("high");
    expect(calls).toBe(1);
    unsubscribe();
    writeQuality("low");
    expect(calls).toBe(1);
  });
});
