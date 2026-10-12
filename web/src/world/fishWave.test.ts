import { describe, expect, it } from "vitest";
import { fishWave, fishWaveGLSL } from "./fishWave";

describe("fish travelling deformation", () => {
  it("travels from the -Z head toward the +Z tail", () => {
    const phase = 2, delta = 0.03, u = 0.55;
    const first = fishWave(u - 0.5, 1, 1, phase, 1);
    const nextU = u + delta / 7.2;
    const next = fishWave(nextU - 0.5, 1, 1, phase + delta, 1);
    expect(first.x / (u * u)).toBeCloseTo(next.x / (nextU * nextU), 12);
    expect(fishWave(-0.5, 1, 1, phase, 1).x).toBe(0);
  });

  it("CPU slopes match finite differences including clamped tail extension", () => {
    for (const z of [-1.6, -0.8, 0, 0.9, 1.6]) {
      const args = [3, 0.13, 1.2, 0.85] as const;
      const wave = fishWave(z, ...args), h = 1e-5;
      const a = fishWave(z - h, ...args), b = fishWave(z + h, ...args);
      expect(wave.dx).toBeCloseTo((b.x - a.x) / (2 * h), 8);
      expect(wave.dy).toBeCloseTo((b.y - a.y) / (2 * h), 8);
    }
  });

  it("GLSL uses identical envelope, phase direction, derivatives and constants", () => {
    const shader = fishWaveGLSL(3, 0.13);
    expect(shader).toContain("uFishPhase - a * 7.2");
    expect(shader).toContain("2.0*a*sin(t)-a*a*7.2*cos(t)");
    expect(shader).toContain("2.0*a*sin(t*0.7)-a*a*5.04*cos(t*0.7)");
    expect(shader).toContain("3.00000000");
    expect(shader).toContain("0.13000000");
    // Direct shader-equivalent reference over nose/body/tail samples.
    for (const z of [-2, -1, 0, 1, 2]) {
      const a = Math.max(0, Math.min(1, z / 3 + 0.5)), t = 2 - a * 7.2;
      const value = fishWave(z, 3, 0.13, 2, 0.7);
      expect(value.x).toBeCloseTo(Math.sin(t) * a * a * 0.13 * 0.7, 12);
      expect(value.y).toBeCloseTo(0.18 * Math.sin(t * 0.7) * a * a * 0.13 * 0.7, 12);
    }
  });
});
