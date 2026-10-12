import { describe, expect, it } from "vitest";
import { daylightAt, hourOfDay, wrapHour } from "./daylight";
import { SUN_POSITION } from "./water";

describe("daylight", () => {
  it("pins noon to the authored sun", () => {
    const noon = daylightAt(12);
    expect(noon.sun.equals(SUN_POSITION)).toBe(true);
    expect(noon.sunIntensity).toBeCloseTo(2.1);
    expect(noon.hemi).toBeCloseTo(0.85);
    expect(noon.caustic).toBeCloseTo(1, 3);
    expect(noon.flow.length()).toBeCloseTo(1);
    expect(noon.background.getHexString()).toBe("083f48");
  });

  it("puts dawn and dusk on the horizon and midnight below the sea", () => {
    expect(daylightAt(6).sun.y).toBeCloseTo(0, 5);
    expect(daylightAt(18).sun.y).toBeCloseTo(0, 5);
    expect(daylightAt(0).sun.y).toBeLessThan(0);
    expect(daylightAt(6).sun.x).not.toBeCloseTo(daylightAt(18).sun.x, 0);
    expect(daylightAt(12).caustic).toBeGreaterThan(daylightAt(0).caustic);
  });

  it("keeps colors in range and wraps a bad hour back to noon", () => {
    for (const hour of [0, 6.4, 12, 17.7, 23.5]) {
      const day = daylightAt(hour);
      for (const color of [day.sunColor, day.sky, day.ground, day.near, day.far, day.reflect, day.lift, day.wet, day.background]) {
        expect(color.r).toBeGreaterThanOrEqual(0);
        expect(color.r).toBeLessThanOrEqual(1);
        expect(color.g).toBeGreaterThanOrEqual(0);
        expect(color.g).toBeLessThanOrEqual(1);
        expect(color.b).toBeGreaterThanOrEqual(0);
        expect(color.b).toBeLessThanOrEqual(1);
      }
      expect(day.sunIntensity).toBeGreaterThan(0);
    }
    expect(wrapHour(Number.NaN)).toBe(12);
    expect(wrapHour(-1)).toBe(23);
    expect(wrapHour(26)).toBe(2);
    expect(hourOfDay(new Date(2026, 0, 1, 15, 30, 0))).toBeCloseTo(15.5);
  });
});
