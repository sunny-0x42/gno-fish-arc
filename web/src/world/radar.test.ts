import { describe, expect, it } from "vitest";
import { clampToDisc, inView, radarBlip, viewPoint } from "./radar";

describe("radar", () => {
  it("maps the sea the same way the fish blips do", () => {
    expect(radarBlip(0, 0, 360, 128, 128)).toEqual({ x: 64, y: 64 });
    expect(radarBlip(360, 0, 360, 128, 128).x).toBeCloseTo(120);
    expect(radarBlip(0, 360, 360, 128, 128).y).toBeCloseTo(120);
    expect(radarBlip(0, -360, 360, 128, 128).y).toBeCloseTo(8);
  });

  it("pulls a far spring onto the radar rim", () => {
    const inside = clampToDisc(70, 64, 64, 64, 50);
    expect(inside.outside).toBe(false);
    expect(inside.x).toBe(70);
    const far = clampToDisc(1000, 64, 64, 64, 50);
    expect(far.outside).toBe(true);
    expect(far.x).toBeCloseTo(114);
    expect(far.y).toBeCloseTo(64);
  });

  it("shows a spring on screen only while it is in front of the camera", () => {
    expect(viewPoint(0, 0, 200, 100)).toEqual({ x: 100, y: 50 });
    expect(inView(0.2, 40, 40, 200, 100, 8)).toBe(true);
    expect(inView(1.2, 40, 40, 200, 100, 8)).toBe(false);
    expect(inView(0.2, 2, 40, 200, 100, 8)).toBe(false);
  });
});
