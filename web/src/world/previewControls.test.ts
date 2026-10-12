import { describe, expect, it } from "vitest";
import { Quaternion, Vector3 } from "three";
import { aimQuaternion } from "./frame";
import { dragPreview, PREVIEW_BITE_MS, PREVIEW_PITCH_LIMIT, previewBite, previewView } from "./previewControls";

describe("Inspect presentation controls", () => {
  it("presents local -Z nose in front, tail in rear, and flank on side", () => {
    const front = previewView("front");
    const rear = previewView("rear");
    const side = previewView("side");
    const nose = (view: typeof front) => new Vector3(0, 0, -1).applyQuaternion(aimQuaternion(view.yaw, view.pitch, new Quaternion()));
    expect(nose(front).z).toBeCloseTo(-1);
    expect(nose(rear).z).toBeCloseTo(1);
    expect(nose(side).x).toBeCloseTo(-1);
    expect(nose(side).z).toBeCloseTo(0);
    expect(previewView("side")).toEqual({ yaw: Math.PI / 2, pitch: 0 });
  });

  it("applies pixel drag deltas without mutating input and caps pitch", () => {
    const initial = { yaw: 0, pitch: 0 };
    expect(dragPreview(initial, 100, 20)).toEqual({ yaw: expect.closeTo(0.8), pitch: 0.16 });
    expect(initial).toEqual({ yaw: 0, pitch: 0 });
    expect(dragPreview(initial, 0, 1000).pitch).toBe(PREVIEW_PITCH_LIMIT);
    expect(dragPreview(initial, 0, -1000).pitch).toBe(-PREVIEW_PITCH_LIMIT);
  });

  it("wraps yaw and ignores non-finite pointer deltas", () => {
    const aim = previewView("side");
    expect(dragPreview(aim, Infinity, NaN)).toEqual({ yaw: expect.closeTo(aim.yaw), pitch: 0 });
    const next = dragPreview(aim, 100_000, 0);
    expect(next.yaw).toBeGreaterThanOrEqual(-Math.PI);
    expect(next.yaw).toBeLessThan(Math.PI);
  });

  it("plays exactly one 240ms bite envelope and never repeats", () => {
    expect(PREVIEW_BITE_MS).toBe(240);
    expect(previewBite(100, null)).toBe(0);
    expect(previewBite(99, 100)).toBe(0);
    expect(previewBite(100, 100)).toBe(0);
    expect(previewBite(160, 100)).toBeCloseTo(Math.SQRT1_2);
    expect(previewBite(220, 100)).toBe(1);
    expect(previewBite(280, 100)).toBeCloseTo(Math.SQRT1_2);
    expect(previewBite(340, 100)).toBe(0);
    expect(previewBite(460, 100)).toBe(0);
    expect(previewBite(100_000, 100)).toBe(0);
    expect(previewBite(NaN, 100)).toBe(0);
    expect(previewBite(220, Infinity)).toBe(0);
  });
});
