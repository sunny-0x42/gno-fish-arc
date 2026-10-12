import { afterEach, describe, expect, it } from "vitest";
import {
  MOUSE_DEFAULT,
  TURN_DEFAULT,
  loadSteer,
  notePitchDrag,
  pitchFromDrag,
  playerTurnStep,
  readSteer,
  resetSteer,
  steerSettings,
  writeSteer,
} from "./steerRates";

afterEach(() => {
  resetSteer();
});

describe("steer settings", () => {
  it("keeps the shipped mouse and turn rates as the default", () => {
    expect(readSteer(null)).toEqual({ mouse: MOUSE_DEFAULT, turn: TURN_DEFAULT });
    expect(readSteer("nope")).toEqual({ mouse: 1.4, turn: 1 });
    expect(readSteer("{}")).toEqual({ mouse: 1.4, turn: 1 });
  });

  it("clamps a saved pair onto the slider ends", () => {
    expect(readSteer(JSON.stringify({ mouse: 9, turn: 0 }))).toEqual({ mouse: 2.8, turn: 0.5 });
    expect(readSteer(JSON.stringify({ mouse: 0.1, turn: 8 }))).toEqual({ mouse: 0.4, turn: 2 });
    expect(readSteer(JSON.stringify({ mouse: "fast", turn: 1.25 }))).toEqual({ mouse: 1.4, turn: 1.3 });
  });

  it("writes the live rates and rounds to one tenth", () => {
    expect(writeSteer({ mouse: 2.04, turn: 0.74 })).toEqual({ mouse: 2, turn: 0.7 });
    expect(steerSettings).toMatchObject({ mouse: 2, turn: 0.7 });
    expect(loadSteer()).toEqual({ mouse: 2, turn: 0.7 });
    expect(resetSteer()).toEqual({ mouse: 1.4, turn: 1 });
    expect(loadSteer()).toEqual({ mouse: 1.4, turn: 1 });
  });

  it("scales turn without flipping yaw and keeps mouse off the turn slider", () => {
    const rates = { mouse: 1.4, turn: 2 };
    expect(playerTurnStep(0.2, rates, "left")).toBeCloseTo(0.4);
    expect(playerTurnStep(0.2, rates, "right")).toBeCloseTo(-0.4);
    expect(playerTurnStep(0.2, rates, "mouse")).toBeCloseTo(0.28);
    expect(playerTurnStep(0.2, { mouse: 2, turn: 2 }, "mouse")).toBeCloseTo(0.4);
  });

  it("raises the nose when the pointer drags up and ignores a small wobble", () => {
    const up = pitchFromDrag(-40, 1.4);
    expect(up).toBeCloseTo(0.32);
    expect(pitchFromDrag(40, 1.4)).toBeCloseTo(-up);
    expect(pitchFromDrag(-40, 2.8)).toBeCloseTo(up * 2);
    const drag = { carry: 0, live: false, pitch: 0 };
    notePitchDrag(drag, -1, 1.4);
    notePitchDrag(drag, -1, 1.4);
    notePitchDrag(drag, -1, 1.4);
    expect(drag.pitch).toBe(0);
    notePitchDrag(drag, -37, 1.4);
    expect(drag.live).toBe(true);
    expect(drag.pitch).toBeCloseTo(0.32);
  });
});
