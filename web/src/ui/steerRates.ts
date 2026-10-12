/** Player aim rates. Defaults match the previous fixed mouse step (1.4) and fish turn rate (1). */

export const MOUSE_MIN = 0.4;
export const MOUSE_MAX = 2.8;
export const MOUSE_DEFAULT = 1.4;
export const TURN_MIN = 0.5;
export const TURN_MAX = 2;
export const TURN_DEFAULT = 1;

const STORAGE_KEY = "shoal-steer";

export type SteerSettings = {
  mouse: number;
  turn: number;
};

export const steerSettings: SteerSettings = {
  mouse: MOUSE_DEFAULT,
  turn: TURN_DEFAULT,
};

function clampStep(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  const stepped = Math.round(value * 10) / 10;
  if (stepped < min) return min;
  if (stepped > max) return max;
  return stepped;
}

export function readSteer(raw: string | null): SteerSettings {
  if (!raw) return { mouse: MOUSE_DEFAULT, turn: TURN_DEFAULT };
  try {
    const parsed = JSON.parse(raw) as { mouse?: unknown; turn?: unknown };
    return {
      mouse: clampStep(Number(parsed.mouse), MOUSE_MIN, MOUSE_MAX, MOUSE_DEFAULT),
      turn: clampStep(Number(parsed.turn), TURN_MIN, TURN_MAX, TURN_DEFAULT),
    };
  } catch {
    return { mouse: MOUSE_DEFAULT, turn: TURN_DEFAULT };
  }
}

let memoryRaw: string | null = null;

function storage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function storageGet(): string | null {
  const store = storage();
  if (!store) return memoryRaw;
  try {
    return store.getItem(STORAGE_KEY);
  } catch {
    return memoryRaw;
  }
}

function storageSet(value: string): void {
  memoryRaw = value;
  try {
    storage()?.setItem(STORAGE_KEY, value);
  } catch {
    // The page copy still applies until reload.
  }
}

export function loadSteer(): SteerSettings {
  const next = readSteer(storageGet());
  steerSettings.mouse = next.mouse;
  steerSettings.turn = next.turn;
  return { mouse: next.mouse, turn: next.turn };
}

export function writeSteer(next: Partial<SteerSettings>): SteerSettings {
  if (next.mouse !== undefined) {
    steerSettings.mouse = clampStep(next.mouse, MOUSE_MIN, MOUSE_MAX, MOUSE_DEFAULT);
  }
  if (next.turn !== undefined) {
    steerSettings.turn = clampStep(next.turn, TURN_MIN, TURN_MAX, TURN_DEFAULT);
  }
  storageSet(JSON.stringify({ mouse: steerSettings.mouse, turn: steerSettings.turn }));
  return { mouse: steerSettings.mouse, turn: steerSettings.turn };
}

export function resetSteer(): SteerSettings {
  return writeSteer({ mouse: MOUSE_DEFAULT, turn: TURN_DEFAULT });
}

/** Left yaw stays positive. Right yaw stays negative. Mouse is a positive step cap. */
export function playerTurnStep(base: number, settings: SteerSettings, side: "left" | "right" | "mouse"): number {
  if (side === "left") return base * settings.turn;
  if (side === "right") return -base * settings.turn;
  return base * settings.mouse;
}

/** Ignore a sideways wobble. A deliberate vertical drag still pitches. */
export const PITCH_DRAG_DEADZONE_PX = 4;
/** At the default mouse rate, 40px is 0.32 rad, inside the 1.2 rad nose limit. */
export const PITCH_DRAG_RAD_PER_PX = 0.008;

/** One held drag. Pitch stays 0 until the pointer travels past the deadzone, then the whole drag counts. */
export type PitchDrag = { carry: number; live: boolean; pitch: number };

/**
 * Screen drag to nose pitch. dyPx is clientY change, so drag up is negative.
 * Drag up raises the nose. A −40px drag at mouse 1.4 returns about +0.32.
 * The deadzone lives on the gesture, so a slow drag still adds up.
 */
export function pitchFromDrag(dyPx: number, mouse: number): number {
  if (!Number.isFinite(dyPx) || dyPx === 0) return 0;
  const scale = clampStep(mouse, MOUSE_MIN, MOUSE_MAX, MOUSE_DEFAULT) / MOUSE_DEFAULT;
  return -dyPx * PITCH_DRAG_RAD_PER_PX * scale;
}

export function notePitchDrag(drag: PitchDrag, dyPx: number, mouse: number): void {
  if (!Number.isFinite(dyPx) || dyPx === 0) return;
  drag.carry += dyPx;
  if (!drag.live && Math.abs(drag.carry) < PITCH_DRAG_DEADZONE_PX) return;
  drag.live = true;
  drag.pitch += pitchFromDrag(drag.carry, mouse);
  drag.carry = 0;
}
