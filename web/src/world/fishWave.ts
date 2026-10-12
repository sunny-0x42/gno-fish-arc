/** Shared head-to-tail travelling wave. Fish forward is -Z, so phase - k*u travels toward +Z. */
export function fishWave(z: number, length: number, strength: number, phase: number, amplitude: number) {
  const raw = z / length + 0.5;
  const a = Math.max(0, Math.min(1, raw));
  const t = phase - a * 7.2;
  const da = raw >= 0 && raw <= 1 ? 1 / length : 0;
  return {
    x: Math.sin(t) * a * a * strength * amplitude,
    y: 0.18 * Math.sin(t * 0.7) * a * a * strength * amplitude,
    dx: (2 * a * Math.sin(t) - a * a * 7.2 * Math.cos(t)) * da * strength * amplitude,
    dy: 0.18 * (2 * a * Math.sin(t * 0.7) - a * a * 5.04 * Math.cos(t * 0.7)) * da * strength * amplitude,
  };
}

export function fishWaveGLSL(length: number, strength: number): string {
  return `
    uniform float uFishPhase;
    uniform float uFishAmplitude;
    vec2 fishWave(float z) {
      float a = clamp(z / ${length.toFixed(8)} + 0.5, 0.0, 1.0);
      float t = uFishPhase - a * 7.2;
      return vec2(sin(t), 0.18 * sin(t * 0.7)) * a * a * ${strength.toFixed(8)} * uFishAmplitude;
    }
    vec2 fishSlope(float z) {
      float raw = z / ${length.toFixed(8)} + 0.5;
      float a = clamp(raw, 0.0, 1.0);
      float t = uFishPhase - a * 7.2;
      float da = raw >= 0.0 && raw <= 1.0 ? 1.0 / ${length.toFixed(8)} : 0.0;
      return vec2(2.0*a*sin(t)-a*a*7.2*cos(t),
        0.18*(2.0*a*sin(t*0.7)-a*a*5.04*cos(t*0.7))) * da * ${strength.toFixed(8)} * uFishAmplitude;
    }`;
}
