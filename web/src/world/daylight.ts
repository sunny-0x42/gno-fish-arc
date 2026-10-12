import * as THREE from "three";
import { SUN_POSITION } from "./water";

export type Daylight = {
  hour: number;
  /** World position of the sun. Hour 12 is exactly SUN_POSITION. */
  sun: THREE.Vector3;
  sunColor: THREE.Color;
  sunIntensity: number;
  sky: THREE.Color;
  ground: THREE.Color;
  hemi: number;
  caustic: number;
  near: THREE.Color;
  far: THREE.Color;
  reflect: THREE.Color;
  lift: THREE.Color;
  wet: THREE.Color;
  background: THREE.Color;
  /** Unit current in the horizontal sea, +X / +Z. */
  flow: THREE.Vector2;
};

const FLOW = new THREE.Vector2(0.93, 0.36).normalize();

function smoothstep(edge0: number, edge1: number, value: number): number {
  const span = edge1 - edge0;
  const t = span === 0 ? 0 : Math.min(1, Math.max(0, (value - edge0) / span));
  return t * t * (3 - 2 * t);
}

/** Local clock hour in [0, 24). */
export function hourOfDay(when = new Date()): number {
  return when.getHours() + when.getMinutes() / 60 + when.getSeconds() / 3600;
}

export function wrapHour(hour: number): number {
  if (!Number.isFinite(hour)) return 12;
  return ((hour % 24) + 24) % 24;
}

/**
 * One sun orbit. Noon matches the authored SUN_POSITION.
 * Hour 6 and 18 sit on the horizon. Midnight is the opposite ray, below the sea.
 */
export function daylightAt(hour: number): Daylight {
  const wrapped = wrapHour(hour);
  const turn = ((wrapped - 12) / 24) * Math.PI * 2;
  const rise = Math.cos(turn);
  const side = Math.sin(turn);
  const flat = Math.hypot(SUN_POSITION.x, SUN_POSITION.z) || 1;
  const eastX = -SUN_POSITION.z / flat;
  const eastZ = SUN_POSITION.x / flat;
  const radius = SUN_POSITION.length();
  const sun = new THREE.Vector3(
    SUN_POSITION.x * rise + eastX * radius * side,
    SUN_POSITION.y * rise,
    SUN_POSITION.z * rise + eastZ * radius * side,
  );
  const morning = Math.exp(-((wrapped - 6.4) ** 2) / 2.4);
  const evening = Math.exp(-((wrapped - 17.7) ** 2) / 2.6);
  const golden = morning + evening;
  const nightRaw = 1 - smoothstep(-0.05, 0.28, rise);
  const night = nightRaw * (1 - 0.82 * Math.min(1, golden));
  const sunColor = new THREE.Color("#fff3df").lerp(new THREE.Color("#ff8d3a"), Math.min(1, evening * 0.95));
  sunColor.lerp(new THREE.Color("#ffe6c4"), Math.min(1, morning * 0.35));
  sunColor.lerp(new THREE.Color("#c5d4ee"), night);
  const sunIntensity = rise >= 0 ? 0.7 + 1.4 * rise : 0.34;
  const sky = new THREE.Color("#d8edf1").lerp(new THREE.Color("#f2b08a"), Math.min(1, evening * 0.8));
  sky.lerp(new THREE.Color("#d5ebe4"), Math.min(1, morning * 0.4));
  sky.lerp(new THREE.Color("#10243c"), night);
  const ground = new THREE.Color("#163b36").lerp(new THREE.Color("#243044"), night);
  const hemi = rise >= 0 ? 0.5 + 0.35 * rise : 0.42;
  const caustic = rise > 0 ? rise * rise * (1 - 0.45 * Math.min(1, golden)) : 0.05;
  const near = new THREE.Color(0.05, 0.24, 0.26).lerp(new THREE.Color(0.24, 0.16, 0.08), Math.min(1, evening * 0.75));
  near.lerp(new THREE.Color(0.02, 0.06, 0.1), night);
  const far = new THREE.Color(0.038, 0.19, 0.22).lerp(new THREE.Color(0.18, 0.1, 0.05), Math.min(1, evening * 0.7));
  far.lerp(new THREE.Color(0.012, 0.035, 0.07), night);
  const reflect = new THREE.Color(0.31, 0.5, 0.57).lerp(new THREE.Color(0.62, 0.34, 0.24), Math.min(1, evening * 0.9 + morning * 0.25));
  reflect.lerp(new THREE.Color(0.08, 0.12, 0.2), night);
  const lift = new THREE.Color(0.3, 0.52, 0.57).lerp(new THREE.Color(0.55, 0.34, 0.2), Math.min(1, evening * 0.8));
  lift.lerp(new THREE.Color(0.06, 0.1, 0.18), night);
  const wet = new THREE.Color(0.018, 0.095, 0.12).lerp(new THREE.Color(0.01, 0.035, 0.06), night);
  const background = new THREE.Color("#083f48").lerp(new THREE.Color("#2a1812"), Math.min(1, evening * 0.6));
  background.lerp(new THREE.Color("#071422"), night);
  return {
    hour: wrapped,
    sun,
    sunColor,
    sunIntensity,
    sky,
    ground,
    hemi,
    caustic,
    near,
    far,
    reflect,
    lift,
    wet,
    background,
    flow: FLOW.clone(),
  };
}
