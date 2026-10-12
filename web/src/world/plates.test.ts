import { describe, expect, it } from "vitest";
import { edgeTickPoint, settleStakePlates, stakePlateBox, type ScreenBox, type StakePlate } from "./plates";

const view: ScreenBox = { l: 8, t: 70, r: 400, b: 600 };

function plate(cx: number, y: number, w = 90, h = 32, pri = 0): StakePlate {
  return { cx, y, w, h, pri };
}

function apart(plates: StakePlate[]) {
  for (let i = 0; i < plates.length; i++) {
    for (let j = i + 1; j < plates.length; j++) {
      const a = stakePlateBox(plates[i]);
      const b = stakePlateBox(plates[j]);
      const ox = Math.min(a.r, b.r) - Math.max(a.l, b.l);
      const oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
      expect(ox <= 0 || oy <= 0).toBe(true);
    }
  }
}

describe("edge tick", () => {
  const box: ScreenBox = { l: 80, t: 90, r: 1200, b: 620 };
  it("sits on the side the fish is past", () => {
    const right = edgeTickPoint(640, 400, 1400, 400, box);
    expect(right.x).toBeCloseTo(box.r);
    expect(right.y).toBeCloseTo(400);
    const above = edgeTickPoint(640, 400, 640, -20, box);
    expect(above.y).toBeCloseTo(box.t);
    expect(above.x).toBeCloseTo(640);
  });
});

describe("stake plates", () => {
  it("splits two plates that share one spot", () => {
    const plates = [plate(160, 240), plate(160, 240)];
    settleStakePlates(plates, view, []);
    apart(plates);
  });

  it("keeps a wide amount inside the screen", () => {
    const plates = [plate(390, 200, 120, 28)];
    settleStakePlates(plates, view, []);
    const box = stakePlateBox(plates[0]);
    expect(box.l).toBeGreaterThanOrEqual(view.l - 0.01);
    expect(box.r).toBeLessThanOrEqual(view.r + 0.01);
    expect(box.t).toBeGreaterThanOrEqual(view.t - 0.01);
    expect(box.b).toBeLessThanOrEqual(view.b + 0.01);
  });

  it("stays next to its fish", () => {
    const plates = [plate(160, 240), plate(160, 240)];
    settleStakePlates(plates, view, []);
    for (const item of plates) {
      expect(Math.hypot(item.cx - 160, item.y - 240)).toBeLessThanOrEqual(110.01);
    }
  });

  it("moves a stake off the dock", () => {
    const dock: ScreenBox = { l: 80, t: 480, r: 360, b: 640 };
    const plates = [plate(200, 520, 100, 36)];
    settleStakePlates(plates, view, [dock]);
    const box = stakePlateBox(plates[0]);
    const ox = Math.min(box.r, dock.r) - Math.max(box.l, dock.l);
    const oy = Math.min(box.b, dock.b) - Math.max(box.t, dock.t);
    expect(ox <= 0 || oy <= 0).toBe(true);
  });
});
